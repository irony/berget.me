import { Observable } from 'rxjs';
import { bergetAPI } from './api';
import { ConversationState, LLMDecision } from '../types/conversationState';
import { ReflectionMessage, Message } from '../types/chat';
import { PromptBuilder } from './promptBuilder';
import { TimingService } from './timingService';

export class LLMDecisionService {
  private static extractJSON(response: string): any {
    if (!response || typeof response !== 'string') {
      console.error('Invalid response for JSON extraction:', response);
      return null;
    }

    try {
      // Remove any markdown code blocks first
      const cleanResponse = response.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
      
      // Try direct parsing first
      return JSON.parse(cleanResponse);
    } catch (error) {
      // Try to clean up common issues
      let cleaned = response;
      
      // Remove comments
      cleaned = cleaned.replace(/\/\/.*$/gm, '');
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Remove markdown code blocks
      cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1');
      
      // Extract JSON from text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
          return null;
        }
      }
      
      console.error('No valid JSON found in response:', response);
      return null;
    }
  }

  private extractJSONOld(response: string): any {
    try {
      // First try direct JSON parsing
      return JSON.parse(response);
    } catch (error) {
      // Try to extract JSON from markdown code block
      const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (markdownMatch) {
        try {
          return JSON.parse(markdownMatch[1]);
        } catch (markdownError) {
          console.error('Failed to parse JSON from markdown block:', markdownError);
        }
      }
      
      // Fall back to extracting between first { and last }
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
        }
      }
      
      // If all parsing attempts fail, throw error
      console.error('No valid JSON found in response:', response);
      return null;
    }
  }

  static analyzeState(state: ConversationState): Observable<LLMDecision> {
    return new Observable(subscriber => {
      const analysisPrompt = PromptBuilder.buildAnalysisPrompt(state);
      
      // Use JSON mode for structured response
      const analysisMessages = [
        {
          role: 'system' as const,
          content: 'Du är en expert på att analysera mänsklig kommunikation och känslor. Svara ALLTID med valid JSON enligt det format som begärs.'
        },
        {
          role: 'user' as const,
          content: analysisPrompt
        }
      ];
      
      const apiCall = bergetAPI.sendAnalysisMessageWithJsonMode(analysisMessages);
      if (!apiCall || typeof apiCall.then !== 'function') {
        console.error('API call returned invalid promise');
        subscriber.next(this.getDefaultDecision());
        subscriber.complete();
        return;
      }
      
      apiCall.then(response => {
          try {
            const decision = JSON.parse(response);
            
            if (!decision) {
              console.error('Failed to parse LLM decision - empty response');
              subscriber.next(this.getDefaultDecision());
              subscriber.complete();
              return;
            }
            
            // Validate and sanitize the response
            const validatedDecision: LLMDecision = {
              shouldAct: Boolean(decision.shouldAct),
              actionType: this.validateActionType(decision.actionType),
              priority: this.validatePriority(decision.priority),
              timing: Math.max(500, Math.min(10000, decision.timing || 2000)),
              reasoning: decision.reasoning || 'Ingen specifik anledning',
              confidence: Math.max(0, Math.min(1, decision.confidence || 0.5)),
              suggestedMessage: decision.suggestedMessage
            };
            
            subscriber.next(validatedDecision);
            subscriber.complete();
          } catch (error) {
            console.error('Failed to parse LLM decision JSON:', error, 'Response:', response);
            subscriber.next(this.getDefaultDecision());
            subscriber.complete();
          }
        })
        .catch(error => {
          console.error('LLM decision service error:', error);
          subscriber.next(this.getDefaultDecision());
          subscriber.complete();
        });
    });
  }
  
  static generateReflection(state: ConversationState): Observable<ReflectionMessage | null> {
    return new Observable(subscriber => {
      console.log('🔬 generateReflection called with input:', {
        length: state.currentInput.trim().length,
        input: state.currentInput.substring(0, 50) + '...'
      });
      
      if (state.currentInput.trim().length < 10) {
        console.log('❌ Input too short for reflection (<10 chars)');
        subscriber.next(null);
        subscriber.complete();
        return;
      }

      const reflectionPrompt = PromptBuilder.buildReflectionPrompt(state);

      console.log('🚀 Sending reflection prompt to API...');
      console.log('📋 Reflection prompt preview:', reflectionPrompt.substring(0, 200) + '...');
      
      const reflectionMessages = [
        {
          role: 'system' as const,
          content: 'Du är en emotionellt intelligent AI som analyserar användarens känslor i realtid OCH hanterar långtidsminnet. Svara ALLTID med valid JSON enligt det format som begärs. Använd ALDRIG markdown-kodblock. Svara ENDAST med JSON, inget annat text.'
        },
        {
          role: 'user' as const,
          content: reflectionPrompt
        }
      ];
      
      const apiCall = bergetAPI.sendReflectionAnalysisMessageWithJsonMode(reflectionMessages);
      if (!apiCall || typeof apiCall.then !== 'function') {
        console.error('API call returned invalid promise');
        subscriber.next(null);
        subscriber.complete();
        return;
      }
      
      apiCall.then(response => {
          console.log('📨 Raw API response for reflection (first 200 chars):', response.substring(0, 200));
          console.log('📨 Full response length:', response.length);
          
          // Check if response is an error message
          if (response.includes('🔑') || response.includes('API-nyckel') || response.includes('API-fel')) {
            console.error('❌ API returned error message:', response);
            subscriber.next(null);
            subscriber.complete();
            return;
          }
          
          // Check if response is empty or too short
          if (!response || response.trim().length < 10) {
            console.error('❌ API returned empty or very short response:', response);
            subscriber.next(null);
            subscriber.complete();
            return;
          }
          
          try {
            // Try to extract and parse JSON from response
            const reflection = this.extractJSON(response);
            
            if (!reflection || typeof reflection !== 'object') {
              console.error('❌ Failed to parse reflection - invalid JSON structure:', reflection);
              console.error('❌ Original response:', response);
              subscriber.next(null);
              subscriber.complete();
              return;
            }
            
            console.log('✅ Parsed reflection JSON:', reflection);
            
            // Handle memory action if present
            if (reflection.memoryAction && reflection.memoryAction.shouldSave) {
              console.log('💾 Reflection AI wants to save memory:', reflection.memoryAction);
              
              // Import and use VectorMemoryService to save the memory
              try {
                const { VectorMemoryService } = await import('../services/vectorMemory');
                const id = await VectorMemoryService.saveMemory(
                  reflection.memoryAction.content,
                  reflection.memoryAction.type,
                  reflection.memoryAction.importance,
                  reflection.memoryAction.tags,
                  `Reflection AI: ${reflection.memoryAction.reasoning}`
                );
                console.log('💾 Memory saved by Reflection AI:', id);
              } catch (error) {
                console.error('❌ Failed to save memory from Reflection AI:', error);
              }
            } else if (reflection.memoryAction) {
              console.log('🚫 Reflection AI decided not to save memory:', reflection.memoryAction.reasoning);
            }
            
            // Validate required fields with more detailed logging
            if (!reflection.content) {
              console.error('❌ Reflection missing content field:', reflection);
              subscriber.next(null);
              subscriber.complete();
              return;
            }
            
            if (!reflection.emotionalState) {
              console.error('❌ Reflection missing emotionalState field:', reflection);
              subscriber.next(null);
              subscriber.complete();
              return;
            }
            
            // Ensure emotions is an array
            const emotions = Array.isArray(reflection.emotions) ? reflection.emotions : ['🤔'];
            if (emotions.length === 0) {
              emotions.push('🤔');
            }
            
            const reflectionMessage: ReflectionMessage = {
              id: Date.now().toString(),
              content: reflection.content,
              timestamp: new Date(),
              isVisible: true,
              emotions: emotions,
              emotionalState: reflection.emotionalState
            };
            
            console.log('🎯 Final reflection message:', reflectionMessage);
            subscriber.next(reflectionMessage);
            subscriber.complete();
          } catch (error) {
            console.error('❌ Failed to parse reflection JSON:', error);
            console.error('📄 Raw response that failed to parse:', response);
            console.error('📄 Response type:', typeof response);
            console.error('📄 Response constructor:', response.constructor.name);
            subscriber.next(null);
            subscriber.complete();
          }
        })
        .catch(error => {
          console.error('❌ API call failed for reflection:', error);
          subscriber.next(null);
          subscriber.complete();
        });
    });
  }
  
  private static validateActionType(actionType: string): LLMDecision['actionType'] {
    const validTypes: LLMDecision['actionType'][] = [
      'wait', 'reflect', 'support', 'clarify', 'encourage', 'check_in', 'apologize', 'redirect'
    ];
    return validTypes.includes(actionType as any) ? actionType as LLMDecision['actionType'] : 'wait';
  }
  
  private static validatePriority(priority: string): LLMDecision['priority'] {
    const validPriorities: LLMDecision['priority'][] = ['low', 'medium', 'high', 'urgent'];
    return validPriorities.includes(priority as any) ? priority as LLMDecision['priority'] : 'low';
  }
  
  private static getDefaultDecision(): LLMDecision {
    return {
      shouldAct: false,
      actionType: 'wait',
      priority: 'low',
      timing: 2000,
      reasoning: 'Konversationen flyter naturligt - väntar',
      confidence: 0.1
    };
  }
}
