import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Brain, Eye, EyeOff, Database } from 'lucide-react';
import { bergetAPI } from './services/api';
import { useConversationState } from './hooks/useConversationState';
import { ReflectionPanel } from './components/ReflectionPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { ConversationIndexer } from './services/conversationIndexer';
import { Message } from './types/chat';
import { StateAnalysis } from './types/conversationState';

const convertStateToEmotionalContext = (state: any) => {
  return {
    currentEmotions: state.emotionalHistory?.length > 0 ? 
      state.emotionalHistory[state.emotionalHistory.length - 1].emotions : [],
    emotionalTrend: 'neutral',
    userNeeds: state.emotionalHistory?.length > 0 ? 
      state.emotionalHistory[state.emotionalHistory.length - 1].userNeeds : [],
    conversationMood: state.emotionalHistory?.length > 0 ? 
      state.emotionalHistory[state.emotionalHistory.length - 1].emotionalState : 'neutral',
    recentEmotions: [],
    shouldInterrupt: false,
    interruptReason: '',
    detailedTimestamps: state.detailedTimestamps || [],
    inputStartTime: state.inputStartTime
  };
};

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hej, den här AI tjänsten körs på svenska servrar och inget vi pratar om sparas eller kan läsas av någon annan.\n\nJag kan chatta med dig och reflektera över dina tankar i realtid. Vad vill du prata om? 💭',
      sender: 'assistant',
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showReflectionPanel, setShowReflectionPanel] = useState(true);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageTimeRef = useRef<Date>(new Date());
  const nextContactTimeRef = useRef<number>(120000); // Default 2 minutes
  const conversationPaceRef = useRef<'fast' | 'medium' | 'slow' | 'reflective'>('medium');
  
  // Stable refs to prevent infinite loops
  const isTypingRef = useRef(isTyping);
  const messagesRef = useRef(messages);
  
  // Update refs when values change
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  // Stable callback with refs to prevent infinite loops
  const handleStateDecisionCallback = useCallback(async (analysis: StateAnalysis) => {
    if (isTypingRef.current) {
      console.log('🚫 Skipping decision - AI is already typing');
      return;
    }
    
    // Extra check to prevent spam
    const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current.getTime();
    const dynamicMinTime = nextContactTimeRef.current;
    if (timeSinceLastMessage < dynamicMinTime) {
      console.log(`🚫 Skipping decision - too soon since last message (${dynamicMinTime/1000}s rule, pace: ${conversationPaceRef.current})`);
      return;
    }

    console.log('🤖 State-based decision triggered:', analysis.decision.reasoning);
    
    setIsTyping(true);
    
    try {
      const conversationHistory = messagesRef.current.map(msg => ({
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));

      let response = '';
      
      // Use suggested message if available, otherwise use contextual API methods
      if (analysis.decision.suggestedMessage) {
        response = analysis.decision.suggestedMessage;
      } else {
        // Fallback to API methods based on decision type
        switch (analysis.decision.actionType) {
        case 'support':
          response = await bergetAPI.sendProactiveMessage(
            analysis.state.currentInput,
            convertStateToEmotionalContext(analysis.state),
            conversationHistory
          );
          break;
        case 'clarify':
          response = await bergetAPI.sendProactiveMessage(
            analysis.state.currentInput,
            convertStateToEmotionalContext(analysis.state),
            conversationHistory
          );
          break;
        case 'encourage':
          response = await bergetAPI.sendProactiveMessage(
            analysis.state.currentInput,
            convertStateToEmotionalContext(analysis.state),
            conversationHistory
          );
          break;
        case 'check_in':
          response = await bergetAPI.sendSilenceBreaker(conversationHistory);
          break;
        default:
          response = await bergetAPI.sendProactiveMessage(
            analysis.state.currentInput,
            convertStateToEmotionalContext(analysis.state),
            conversationHistory
          );
        }
      }

      const proactiveMessage: Message = {
        id: Date.now().toString(),
        content: response,
        sender: 'assistant',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, proactiveMessage]);
    } catch (error) {
      console.error('State-based decision error:', error);
    } finally {
      setIsTyping(false);
    }
  }, []); // Empty dependency array since we use refs

  // State-based conversation analysis
  const {
    currentState,
    lastDecision,
    isAnalyzing,
    analysisHistory,
    reflections,
    isReflecting,
    emotionalContext,
    addEmotionalAnalysis,
    getEmotionalTrend,
    emotionalHistory
  } = useConversationState(
    currentMessage,
    messages,
    true, // windowFocused - simplified for now
    new Date(), // lastFocusTime
    null, // lastBlurTime
    handleStateDecisionCallback
  );


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;
    
    // Prevent multiple simultaneous sends
    if (isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: currentMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = currentMessage;
    setCurrentMessage('');
    setIsTyping(true);

    // Streaming state
    let assistantMessageId: string | null = null;
    let streamBuffer = '';
    let hasShownMessage = false;
    
    try {
      // Search for relevant context before sending message
      console.log('🔍 Searching for relevant context...');
      const contextSearch = await ConversationIndexer.searchRelevantContext(
        messageToSend,
        messages,
        3
      );

      // Konvertera meddelanden till API-format
      let apiMessages = [...messages, userMessage].map(msg => ({
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));

      // Add relevant context to the conversation if found
      if (contextSearch.relevantMemories.length > 0) {
        console.log('💡 Adding relevant context to conversation:', contextSearch.relevantMemories.length, 'memories');
        
        // Insert context before the latest user message
        const contextMessage = {
          role: 'system' as const,
          content: `RELEVANT TIDIGARE KONTEXT (för AI:ns förståelse):
${contextSearch.contextSummary}

Använd denna kontext för att ge mer personliga och relevanta svar, men nämn inte explicit att du "kommer ihåg" från tidigare såvida det inte är naturligt.`
        };

        // Insert context message before the last user message
        apiMessages.splice(-1, 0, contextMessage);
      }

      // Add simple emotional analysis to history
      // This is a simplified version - in a full implementation, this would also use LLM
      if (emotionalContext && emotionalContext.currentEmotions && emotionalContext.currentEmotions.length > 0) {
        const emotionalAnalysis = {
          emotions: emotionalContext.currentEmotions,
          emotionalState: emotionalContext.conversationMood,
          valence: emotionalContext.emotionalTrend === 'positive' ? 'positive' as const :
                   emotionalContext.emotionalTrend === 'negative' ? 'negative' as const :
                   emotionalContext.emotionalTrend === 'mixed' ? 'mixed' as const : 'neutral' as const,
          intensity: 0.7,
          userNeeds: emotionalContext.userNeeds
        };
        addEmotionalAnalysis(emotionalAnalysis);
      }

      const onChunk = (chunk: string) => {
        console.log('📨 Received chunk (length: ' + chunk.length + '):', chunk.substring(0, 50) + '...');
        
        streamBuffer = chunk; // Use the accumulated content directly
        
        // Show message after we have some content (more than 3 characters)
        const shouldShowMessage = streamBuffer.trim().length > 2;
        
        console.log('📝 Stream buffer length:', streamBuffer.length, 'Should show:', shouldShowMessage);
        console.log('✅ Should show message:', shouldShowMessage, 'Has shown message:', hasShownMessage);
        
        if (shouldShowMessage && !hasShownMessage) {
          // Create the message placeholder now
          assistantMessageId = (Date.now() + 1).toString();
          console.log('🆕 Creating new message with ID:', assistantMessageId);
          const assistantMessage: Message = {
            id: assistantMessageId,
            content: streamBuffer,
            sender: 'assistant',
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, assistantMessage]);
          console.log('✅ Message added to state');
          hasShownMessage = true;
        } else if (hasShownMessage && assistantMessageId) {
          // Update existing message with new content
          console.log('🔄 Updating existing message:', assistantMessageId);
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: streamBuffer }
              : msg
          ));
        }
      };

      // Använd emotionell kontext om den finns
      // Always include timing context now
      const contextWithTiming = {
        ...(emotionalContext || {}),
        detailedTimestamps: currentState?.detailedTimestamps || [],
        inputStartTime: currentState?.inputStartTime || new Date(),
        conversationPace: conversationPaceRef.current
      };
      
      console.log('🚀 Starting API call with context...');
      const responseData = await bergetAPI.sendMainChatMessageWithContextStreaming(apiMessages, contextWithTiming, onChunk, true); // Enable memory tools
      
      console.log('📨 Response data received:', {
        contentLength: responseData.content?.length || 0,
        hasContent: !!responseData.content,
        suggestedTime: responseData.suggestedNextContactTime,
        pace: responseData.conversationPace,
        toolUsed: !!responseData.toolResult
      });
      
      // Log memory usage for debugging
      if (responseData.toolResult) {
        console.log('🧠 Memory tool used:', responseData.toolResult);
      }
      
      // Update timing based on AI's response analysis
      if (responseData.suggestedNextContactTime) {
        nextContactTimeRef.current = responseData.suggestedNextContactTime;
        console.log(`⏰ Updated next contact time: ${responseData.suggestedNextContactTime/1000}s`);
      }
      
      if (responseData.conversationPace) {
        conversationPaceRef.current = responseData.conversationPace as any;
        console.log(`🎭 Updated conversation pace: ${responseData.conversationPace}`);
      }
      
      const response = responseData.content;
      console.log('💬 Final response to display:', response?.substring(0, 100) + '...');

      // If we never showed the message (very short response), show it now
      if (!hasShownMessage && streamBuffer.trim()) {
        console.log('📤 Showing message that was never shown:', streamBuffer.substring(0, 50) + '...');
        assistantMessageId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
          id: assistantMessageId,
          content: streamBuffer,
          sender: 'assistant',
          timestamp: new Date(),
          suggestedNextContactTime: responseData.suggestedNextContactTime,
          conversationPace: responseData.conversationPace as any
        };
        setMessages(prev => [...prev, assistantMessage]);
        console.log('✅ Final message added to state');

        // Index the assistant message for future context
        ConversationIndexer.indexAssistantMessage(assistantMessage);
      } else if (hasShownMessage) {
        console.log('✅ Message was already shown during streaming');
        
        // Index the assistant message that was shown during streaming
        if (assistantMessageId) {
          const finalAssistantMessage: Message = {
            id: assistantMessageId,
            content: streamBuffer,
            sender: 'assistant',
            timestamp: new Date(),
            suggestedNextContactTime: responseData.suggestedNextContactTime,
            conversationPace: responseData.conversationPace as any
          };
          ConversationIndexer.indexAssistantMessage(finalAssistantMessage);
        }
      } else {
        console.log('⚠️ No message to show - streamBuffer empty:', streamBuffer);
        console.log('⚠️ Response from API:', response);
        // Don't show fallback messages - let user see the actual error
      }

      // Index the user message for future context
      ConversationIndexer.indexUserMessage(userMessage);

      // Index conversation context periodically (every 4 messages)
      const updatedMessages = [...messages, userMessage];
      if (updatedMessages.length % 4 === 0) {
        ConversationIndexer.indexConversationContext(updatedMessages);
      }

      // Bestäm om vi ska skicka följdmeddelanden baserat på emotionell kontext
      // Mycket mer restriktiv med följdmeddelanden
      const shouldSendFollowUp = false; // Tillfälligt avstängt för att minska intensiteten
      
      // Endast i extrema fall:
      // const shouldSendFollowUp = emotionalContext && emotionalContext.currentEmotions && emotionalContext.currentEmotions.length > 0 && 
      //   emotionalContext.conversationMood && emotionalContext.conversationMood.toLowerCase().includes('suicid') ||
      //   emotionalContext.conversationMood && emotionalContext.conversationMood.toLowerCase().includes('självskada');

      if (shouldSendFollowUp) {
        // Vänta lite innan följdmeddelandet för att kännas naturligt
        setTimeout(async () => {
          setIsTyping(true);
          
          try {
            // Bestäm typ av följdmeddelande baserat på behov
            let followUpType: 'supportive' | 'curious' | 'reflective' = 'supportive';
            
            if (emotionalContext.userNeeds.includes('klarhet')) {
              followUpType = 'curious';
            } else if (emotionalContext && emotionalContext.userNeeds && emotionalContext.userNeeds.includes('vägledning')) {
              followUpType = 'reflective';
            }

            const followUpResponse = await bergetAPI.sendFollowUpMessage(
              [...apiMessages, { role: 'assistant', content: response }],
              emotionalContext,
              followUpType
            );

            const followUpMessage: Message = {
              id: (Date.now() + 2).toString(),
              content: followUpResponse,
              sender: 'assistant',
              timestamp: new Date()
            };

            setMessages(prev => [...prev, followUpMessage]);
          } catch (error) {
            console.error('Follow-up message error:', error);
          } finally {
            setIsTyping(false);
          }
        }, 2000 + Math.random() * 1000); // 2-3 sekunder för naturlig timing
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      // Don't log or throw errors, just handle the response from the API service
      // The API service now returns user-friendly error messages instead of throwing
    } finally {
      if (!emotionalContext || !emotionalContext.currentEmotions || !emotionalContext.currentEmotions.length || 
          !(emotionalContext.emotionalTrend === 'negative' || 
            (emotionalContext.userNeeds && emotionalContext.userNeeds.includes('stöd')))) {
        setIsTyping(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [currentMessage]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('sv-SE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
      {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
          <Bot className="w-6 h-6 text-blue-600 mr-3" />
          <h1 className="text-lg font-semibold text-gray-900">berget.me</h1>
          <div className="ml-auto flex items-center space-x-4">
            <button
              onClick={() => setShowReflectionPanel(!showReflectionPanel)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showReflectionPanel
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showReflectionPanel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>Reflektion</span>
            </button>
            <button
              onClick={() => setShowMemoryPanel(!showMemoryPanel)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showMemoryPanel
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Minne</span>
            </button>
            <div className="text-sm text-gray-500">
              State-based LLM • RxJS Pipeline
            </div>
          </div>
        </div>

      {/* Messages Container */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} animate-message-appear`}
            >
              <div className={`flex items-start space-x-2 max-w-[70%] ${
                message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.sender === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-300 text-gray-700'
                }`}>
                  {message.sender === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className={`w-4 h-4 ${message.content === '' ? 'animate-typing-pulse' : ''}`} />
                  )}
                </div>
                <div className={`rounded-lg px-4 py-2 shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p className={`text-xs mt-1 ${
                    message.sender === 'user' 
                      ? 'text-blue-100' 
                      : 'text-gray-500'
                  }`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-2 max-w-[70%]">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white text-gray-900 border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-thinking-pulse" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-thinking-pulse" style={{ animationDelay: '0.3s' }}></div>
                      <div className="w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-thinking-pulse" style={{ animationDelay: '0.6s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

      {/* Input Area */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-end space-x-3">
            <div className="flex-1 min-h-[44px] relative">
              <textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Skriv ditt meddelande... AI:n reflekterar medan du skriver"
                className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm leading-relaxed"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                rows={1}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!currentMessage.trim() || isTyping}
              className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-all ${
                currentMessage.trim() && !isTyping
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500 text-center">
            Enter för att skicka • Shift+Enter för ny rad • AI reflekterar i realtid
          </div>
        </div>
      </div>

      {/* Reflection Panel */}
      <ReflectionPanel
        reflections={reflections}
        isReflecting={isReflecting}
        isVisible={showReflectionPanel}
        emotionalContext={emotionalContext}
      />

      {/* Memory Panel */}
      <MemoryPanel isVisible={showMemoryPanel} />
    </div>
  );
}

export default App;
