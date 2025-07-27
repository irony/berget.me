// Main API facade that combines all API modules
import { ChatAPI } from './core/chatApi';
import { AnalysisAPI } from './core/analysisApi';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

class BergetAPI {
  private chatAPI = new ChatAPI();
  private analysisAPI = new AnalysisAPI();

  // Chat methods
  async sendMainChatMessage(messages: ChatMessage[]): Promise<string> {
    return this.chatAPI.sendMainChatMessage(messages);
  }

  async sendMainChatMessageStreaming(
    messages: ChatMessage[], 
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return this.chatAPI.sendMainChatMessageStreaming(messages, onChunk);
  }

  async sendMainChatMessageWithContextStreaming(
    messages: ChatMessage[], 
    emotionalContext: any,
    onChunk: (chunk: string) => void,
    useMemoryTools: boolean = false
  ): Promise<{ content: string; suggestedNextContactTime?: number; conversationPace?: string; toolResult?: any }> {
    return this.chatAPI.sendMainChatMessageWithContextStreaming(messages, emotionalContext, onChunk, useMemoryTools);
  }

  async sendProactiveMessage(currentInput: string, emotionalContext: any, conversationHistory: ChatMessage[]): Promise<string> {
    return this.chatAPI.sendProactiveMessage(currentInput, emotionalContext, conversationHistory);
  }

  async sendSilenceBreaker(conversationHistory: ChatMessage[]): Promise<string> {
    return this.chatAPI.sendSilenceBreaker(conversationHistory);
  }

  async sendFollowUpMessage(previousMessages: ChatMessage[], emotionalContext: any, followUpType: 'supportive' | 'curious' | 'reflective'): Promise<string> {
    return this.chatAPI.sendFollowUpMessage(previousMessages, emotionalContext, followUpType);
  }

  // Analysis methods
  async sendAnalysisMessageWithJsonMode(messages: ChatMessage[]): Promise<string> {
    return this.analysisAPI.sendAnalysisMessageWithJsonMode(messages);
  }

  async sendReflectionAnalysisMessageWithJsonMode(messages: ChatMessage[]): Promise<string> {
    return this.analysisAPI.sendReflectionAnalysisMessageWithJsonMode(messages);
  }

  async analyzeAIHormonalState(messages: ChatMessage[], emotionalContext: any): Promise<string> {
    return this.analysisAPI.analyzeAIHormonalState(messages, emotionalContext);
  }

  async analyzeResponseForTiming(aiResponse: string, emotionalContext: any): Promise<{
    suggestedNextContactTime: number;
    conversationPace: 'fast' | 'medium' | 'slow' | 'reflective';
  }> {
    return this.analysisAPI.analyzeResponseForTiming(aiResponse, emotionalContext);
  }

  // Legacy methods for backward compatibility
  async sendAnalysisMessage(prompt: string): Promise<string> {
    return this.analysisAPI.sendAnalysisMessageWithJsonMode([
      {
        role: 'system',
        content: 'Du är en expert på att analysera mänsklig kommunikation och känslor. Svara ALLTID med valid JSON enligt det format som begärs. Var noggrann och insiktsfull i dina analyser.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);
  }

  async sendReflectionAnalysisMessage(prompt: string): Promise<string> {
    return this.analysisAPI.sendReflectionAnalysisMessageWithJsonMode([
      {
        role: 'system',
        content: 'Du är en expert på att analysera mänskliga känslor och kommunikation i realtid. Svara ALLTID med valid JSON enligt det format som begärs. Var empatisk och insiktsfull i dina reflektioner.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]);
  }
}

export const bergetAPI = new BergetAPI();
export type { ChatMessage };