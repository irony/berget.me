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
    // Base implementation would go here
    // This is a placeholder - actual implementation would make HTTP requests
    throw new Error('makeRequest must be implemented by subclass');
  }

  protected async makeStreamingRequest(
    messages: ChatMessage[], 
    model: string, 
    onChunk: (chunk: string) => void,
    useJsonMode: boolean = false,
    additionalOptions: any = {}
  ): Promise<{ content: string; tool_calls?: any[] }> {
    // Base implementation would go here
    // This is a placeholder - actual implementation would make streaming HTTP requests
    throw new Error('makeStreamingRequest must be implemented by subclass');
  }

  protected logFullResponse(response: any, context: string) {
    console.log(`🔍 FULL ${context} RESPONSE:`, JSON.stringify(response, null, 2));
  }
}
