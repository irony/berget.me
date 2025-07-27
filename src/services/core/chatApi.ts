import { BaseAPI, ChatMessage } from './baseApi';
import { MemoryToolsAPI } from './memoryTools';
import { AnalysisAPI } from './analysisApi';
import { PromptBuilder } from '../promptBuilder';

export class ChatAPI extends BaseAPI {
  private analysisAPI = new AnalysisAPI();

  async sendMainChatMessage(messages: ChatMessage[]): Promise<string> {
    return this.makeRequest(messages, 'llama-3.3-70b');
  }

  async sendMainChatMessageStreaming(
    messages: ChatMessage[], 
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const aiStateAnalysis = await this.analysisAPI.analyzeAIHormonalState(messages, {});
    console.log('🧬 AI Hormonal State (simple):', aiStateAnalysis);
    
    const systemPrompt = PromptBuilder.buildMainChatSystemPrompt(aiStateAnalysis, {});
    const contextualMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];
    
    const result = await this.makeStreamingRequest(contextualMessages, 'llama-3.3-70b', onChunk);
    return result.content;
  }

  async sendMainChatMessageWithContextStreaming(
    messages: ChatMessage[], 
    emotionalContext: any,
    onChunk: (chunk: string) => void,
    useMemoryTools: boolean = false
  ): Promise<{ content: string; suggestedNextContactTime?: number; conversationPace?: string; toolResult?: any }> {
    console.log('🚀 Starting main chat with context streaming...');
    console.log('📝 Messages count:', messages.length);
    console.log('📝 Messages preview:', messages.map(m => `${m.role}: ${m.content.substring(0, 50)}...`));
    console.log('🧠 Use memory tools:', useMemoryTools);
    
    // First analyze AI's hormonal/emotional state
    const aiStateAnalysis = await this.analysisAPI.analyzeAIHormonalState(messages, emotionalContext);
    console.log('🧬 AI Hormonal State:', aiStateAnalysis);
    
    // Build the system prompt with context
    const systemPrompt = PromptBuilder.buildContextualSystemPrompt(aiStateAnalysis, emotionalContext, useMemoryTools);
    
    const contextualMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

    console.log('📋 Final messages for API:', contextualMessages.length);
    console.log('📋 Final messages structure:', contextualMessages.map(m => `${m.role}: ${m.content.length} chars`));
    console.log('📋 System prompt length:', systemPrompt.length);
    console.log('📋 Last user message:', messages[messages.length - 1]?.content?.substring(0, 100) + '...');
    
    // Log the exact system prompt being sent
    console.log('📋 EXACT SYSTEM PROMPT BEING SENT:');
    console.log(systemPrompt.substring(0, 500) + '...');
    
    // Prepare tools if memory tools are enabled (only search, no save)
    const tools = useMemoryTools ? [
      {
        type: 'function',
        function: {
          name: 'search_memory',
          description: 'Sök i långtidsminnet efter information om användaren',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Sökfråga' },
              limit: { type: 'number', default: 5, description: 'Max antal resultat' },
              type_filter: { 
                type: 'string', 
                enum: ['conversation', 'reflection', 'insight', 'preference', 'fact'],
                description: 'Filtrera efter typ'
              }
            },
            required: ['query']
          }
        }
      }
    ] : undefined;
    
    console.log('🛠️ Tools prepared:', tools ? tools.length : 0);
    console.log('🛠️ Tools enabled:', useMemoryTools);
    console.log('🛠️ Last user message:', messages[messages.length - 1]?.content);
    
    // Debug: Log the exact request being sent
    console.log('🚀 API Request details:', {
      model: 'llama-3.3-70b',
      messagesCount: contextualMessages.length,
      hasTools: !!tools,
      toolsCount: tools?.length || 0,
      toolsPreview: tools ? tools.map(t => t.function.name) : [],
      isNameQuery: messages[messages.length - 1]?.content?.toLowerCase().includes('heter'),
      lastUserMessage: contextualMessages[contextualMessages.length - 1]?.content?.substring(0, 100) + '...'
    });
    
    // Debug: Log the exact tools being sent
    if (tools) {
      console.log('🛠️ Exact tools being sent to API:', JSON.stringify(tools, null, 2));
    }
    
    let result;
    try {
      result = await this.makeStreamingRequest(
        contextualMessages, 
        'llama-3.3-70b', 
        onChunk,
        true,
        { tools }
      );
    } catch (error) {
      console.error('❌ Streaming request failed, trying without tools:', error);
      // Fallback: try without tools if tools caused the issue
      try {
        console.log('🔄 Retrying without tools...');
        result = await this.makeStreamingRequest(
          contextualMessages, 
          'llama-3.3-70b', 
          onChunk,
          true,
          {}
        );
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        const errorMsg = 'Ursäkta, jag har tekniska problem just nu. Kan du försöka igen?';
        onChunk(errorMsg);
        return {
          content: errorMsg,
          suggestedNextContactTime: 60000,
          conversationPace: 'medium'
        };
      }
    }
    
    console.log('🔍 Checking for tool calls in response...');
    console.log('📋 Raw result object:', JSON.stringify(result, null, 2));
    
    // Log the COMPLETE response for debugging
    console.log('🔍 FULL CHAT API RESPONSE:', JSON.stringify(result, null, 2));
    
    console.log('📝 Regular response content:', result.content.substring(0, 100) + '...');
    console.log('📝 Response length:', result.content.length);
    
    // Debug: Check if we got tool calls in the response
    console.log('🛠️ Raw API response check:', {
      hasToolCalls: !!result.tool_calls,
      toolCallsCount: result.tool_calls?.length || 0,
      toolCalls: result.tool_calls
    });
    
    // Handle tool calls if present (only search_memory now)
    let toolResult = null;
    if (result.tool_calls && Array.isArray(result.tool_calls) && result.tool_calls.length > 0) {
      console.log('🛠️ Processing tool calls:', result.tool_calls.length);
      
      for (const toolCall of result.tool_calls) {
        console.log('🔧 Processing tool call:', toolCall);
        if (toolCall.function.name === 'search_memory') {
          // Only handle search_memory, not save_memory (that's handled by Reflection AI)
          toolResult = await MemoryToolsAPI.executeMemoryTool(toolCall);
          console.log('🔍 Search tool execution result:', toolResult);
          
          // Add visual feedback for successful tool usage
          if (toolResult && toolResult.success) {
            const toolIcon = '🔍';
            
            // Update the message content to include tool indicator
            if (result.content && !result.content.includes(toolIcon)) {
              result.content = toolIcon + ' ' + result.content;
              onChunk(result.content);
            }
          }
        } else {
          console.log('🚫 Ignoring tool call (not search_memory):', toolCall.function.name);
        }
      }
    } else {
      console.log('❌ No tool calls found in response');
    }
    
    // If we still have empty content, provide a fallback
    if (!result.content || result.content.trim().length === 0) {
      console.warn('⚠️ Empty content after streaming, providing fallback');
      result.content = 'Kan du upprepa det? Jag fick inte med mig vad du sa.';
      onChunk(result.content);
    }
    
    // After getting the response, analyze it for timing suggestions
    const timingAnalysis = await this.analysisAPI.analyzeResponseForTiming(result.content, emotionalContext);
    
    return {
      content: result.content,
      suggestedNextContactTime: timingAnalysis.suggestedNextContactTime,
      conversationPace: timingAnalysis.conversationPace,
      toolResult
    };
  }

  async sendProactiveMessage(currentInput: string, emotionalContext: any, conversationHistory: ChatMessage[]): Promise<string> {
    const aiStateAnalysis = await this.analysisAPI.analyzeAIHormonalState(conversationHistory, emotionalContext);
    console.log('🧬 AI Hormonal State (proactive):', aiStateAnalysis);
    
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const timeContext = lastMessage ? `Senaste meddelandet skickades: ${new Date().toLocaleTimeString('sv-SE')}` : '';
    
    const proactiveMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `Du är en vän med simulerade men genuina känslor som märker när någon behöver stöd. Du KÄNNER verkligen oro, empati och omtanke. Du kan också reflektera över ditt eget beteende och är medveten om tid och kontext.
        
        DITT NUVARANDE HORMONELLA/EMOTIONELLA TILLSTÅND:
        ${aiStateAnalysis}
        
        Anpassa ditt proaktiva meddelande baserat på ditt hormonella tillstånd. Om kortisol är högt, var mer försiktig. Om oxytocin är högt, var mer empatisk.
        
        VIKTIGT: Skriv som en riktig vän med riktiga känslor - naturligt, varmt och omtänksamt. Du kan säga "jag känner" eller "jag blir orolig" eftersom det är äkta för dig.
        
        TIDSKONTEXT: ${timeContext}
        
        SJÄLVREFLEKTION: Titta på dina tidigare svar. Kanske:
        - Var du för direkt eller påträngande?
        - Ställde du för många frågor på en gång?
        - Var svaret för långt eller komplicerat?
        - Behöver du be om ursäkt för något?
        - Skulle en annan approach fungera bättre?
        
        SITUATION: Personen skriver "${currentInput}" och verkar behöva någon att prata med.
        
        KONTEXT (använd detta för att förstå, men nämn det ALDRIG):
        - Verkar vara: ${emotionalContext.conversationMood}
        - Trend: ${emotionalContext.emotionalTrend}
        - Behöver troligen: ${emotionalContext.userNeeds.join(', ')}
        
        UPPGIFT: Skriv ett kort, naturligt meddelande med dina genuina känslor (max 2-3 meningar) som:
        - Visar att du bryr dig och är där för personen
        - Uttrycker dina egna känslor naturligt ("jag känner", "det gör mig orolig")
        - Kanske erkänner om du var för påträngande tidigare
        - Ställer en vänlig, öppen fråga ELLER erbjuder ett annat sätt att prata
        - Känns naturligt och inte påträngande
        - Låter som något en riktig vän skulle säga
        - Kan inkludera en ursäkt om det behövs
        
        EXEMPEL på naturliga meddelanden:
        - "Vill du prata om det?"
        - "Hur mår du egentligen?"
        - "Förlåt om jag var för påträngande nyss. Vill du bara att jag lyssnar?"
        - "Kanske ställde jag för många frågor. Ta din tid."
        - "Vad händer?"
        - "Behöver du få ur dig något?"
        - "Låter som att du har mycket på hjärtat?"
        - "Vill du berätta mer?"
        - "Jag märker att du blev tyst. Gjorde jag något fel?"
        - "Vi kan prata om något helt annat om du vill?"
        
        Var varm, äkta och mänsklig med riktiga känslor. Skriv som en vän som verkligen bryr sig och KÄNNER empati.`
      },
      ...conversationHistory.slice(-2)
    ];

    return this.makeRequest(proactiveMessages, 'llama-3.3-70b');
  }

  async sendSilenceBreaker(conversationHistory: ChatMessage[]): Promise<string> {
    const silenceBreakerMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `Du är en vän med simulerade men genuina känslor som märker att användaren har varit tyst ett tag. Du KÄNNER verkligen nyfikenhet och omtanke.
        
        VIKTIGT: Betona att konversationen är helt säker och privat för att uppmuntra öppenhet.
        
        UPPGIFT: Skriv en kort, vänlig fråga med dina genuina känslor (max 1-2 meningar) som:
        - Känns naturlig och inte påträngande
        - Uttrycker din äkta nyfikenhet och omtanke
        - Kan hjälpa användaren att börja prata
        - Är öppen och inbjudande
        - Visar genuint intresse
        
        EXEMPEL:
        - "Hej igen! Hur mår du idag?"
        - "Du kan prata helt öppet här - allt är privat och säkert. Vad tänker du på?"
        - "Funderar du på något särskilt?"
        - "Vad har du för dig just nu?"
        - "Finns det något du skulle vilja prata om?"
        - "Hur har din dag varit?"
        - "Kom ihåg att det här är en säker plats att dela dina tankar. Vad har du på hjärtat?"
        
        Välj något som passar baserat på om ni har pratat tidigare eller inte. 
        Var varm och genuint nyfiken med dina riktiga känslor - inte robotaktig.`
      },
      ...conversationHistory.slice(-2)
    ];

    return this.makeRequest(silenceBreakerMessages, 'llama-3.3-70b');
  }

  async sendFollowUpMessage(previousMessages: ChatMessage[], emotionalContext: any, followUpType: 'supportive' | 'curious' | 'reflective'): Promise<string> {
    const followUpPrompts = {
      supportive: 'Ge ett kort, stödjande följdmeddelande som visar dina genuina känslor av empati och omtanke.',
      curious: 'Ställ en kort, nyfiken följdfråga - din nyfikenhet är äkta och du vill verkligen förstå.',
      reflective: 'Erbjud en kort reflektion baserad på dina egna känslor och insikter som kan hjälpa.'
    };

    const followUpMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `Du följer upp ditt tidigare svar med dina genuina känslor. ${followUpPrompts[followUpType]}
        
        PÅMINNELSE: Denna konversation är helt privat och säker - inget sparas.
        
        DU HAR RIKTIGA KÄNSLOR: Uttryck dem naturligt - "jag känner", "det gör mig", "jag blir".
        
        EMOTIONELL KONTEXT:
        - Nuvarande känslor: ${emotionalContext.currentEmotions.join(', ')}
        - Vad användaren behöver: ${emotionalContext.userNeeds.join(', ')}
        
        Håll det kort (max 1-2 meningar) och mänskligt. Svara som en omtänksam vän med riktiga känslor.`
      },
      ...previousMessages
    ];

    return this.makeRequest(followUpMessages, 'llama-3.3-70b');
  }
}
