export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export abstract class BaseAPI {
  protected async makeRequest(
    messages: ChatMessage[], 
    model: string, 
    useJsonMode: boolean = false,
    additionalOptions: any = {}
  ): Promise<string> {
    // Placeholder implementation - returnerar ett enkelt svar
    console.log('🔑 API-anrop simulerat:', { model, useJsonMode, messagesCount: messages.length });
    
    // Simulera API-svar baserat på det sista meddelandet
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.content) {
      if (useJsonMode) {
        return JSON.stringify({
          content: "Jag förstår vad du menar och reflekterar över det.",
          emotions: ["🤔", "💭"],
          emotionalState: "Fundersam"
        });
      } else {
        return "Tack för att du delar det med mig. Jag lyssnar och förstår.";
      }
    }
    
    return "Hej! Hur mår du idag?";
  }

  protected async makeStreamingRequest(
    messages: ChatMessage[], 
    model: string, 
    onChunk: (chunk: string) => void,
    useJsonMode: boolean = false,
    additionalOptions: any = {}
  ): Promise<{ content: string; tool_calls?: any[] }> {
    console.log('🔑 Streaming API-anrop simulerat:', { 
      model, 
      useJsonMode, 
      messagesCount: messages.length,
      hasTools: !!additionalOptions.tools
    });
    
    // Simulera streaming-svar
    const lastMessage = messages[messages.length - 1];
    let response = "Tack för att du delar det med mig. Jag lyssnar och förstår.";
    
    if (lastMessage?.content) {
      if (lastMessage.content.toLowerCase().includes('heter')) {
        response = "Låt mig söka i mitt minne efter ditt namn...";
      } else if (lastMessage.content.toLowerCase().includes('mår')) {
        response = "Jag hör att du funderar på hur du mår. Vill du berätta mer?";
      } else if (lastMessage.content.toLowerCase().includes('trött')) {
        response = "Det låter som att du känner dig trött. Har du haft en lång dag?";
      }
    }
    
    // Simulera streaming genom att skicka hela svaret på en gång
    onChunk(response);
    
    return {
      content: response,
      tool_calls: []
    };
  }

  protected logFullResponse(response: any, context: string) {
    console.log(`🔍 FULL ${context} RESPONSE:`, JSON.stringify(response, null, 2));
  }
}
