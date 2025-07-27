import { Observable } from 'rxjs';
import { bergetAPI } from './api';
import { ConversationState, LLMDecision } from '../types/conversationState';
import { ReflectionMessage, Message } from '../types/chat';
import { PromptBuilder } from './promptBuilder';
import { TimingService } from './timingService';

export class LLMDecisionService {
  private static extractJSON(response: string): any {
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
          throw new Error(`Invalid JSON structure: ${innerError.message}`);
        }
      }
      
      console.error('No valid JSON found in response:', response);
      throw new Error('No valid JSON found in response');
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
      
      bergetAPI.sendAnalysisMessageWithJsonMode(analysisMessages)
        .then(response => {
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
      
      const reflectionMessages = [
        {
          role: 'system' as const,
          content: 'Du är en emotionellt intelligent AI som analyserar användarens känslor i realtid. Svara ALLTID med valid JSON enligt det format som begärs.'
        },
        {
          role: 'user' as const,
          content: reflectionPrompt
        }
      ];
      
      bergetAPI.sendReflectionAnalysisMessageWithJsonMode(reflectionMessages)
        .then(response => {
          console.log('📨 Raw API response for reflection:', response.substring(0, 200) + '...');
          try {
            const reflection = JSON.parse(response);
            
            if (!reflection) {
              console.error('❌ Failed to parse reflection - empty response');
              subscriber.next({
                id: Date.now().toString(),
                content: 'Jag reflekterar över det du skriver...',
                timestamp: new Date(),
                isVisible: true,
                emotions: ['🤔'],
                emotionalState: 'Fundersam'
              });
              subscriber.complete();
              return;
            }
            
            console.log('✅ Parsed reflection JSON:', reflection);
            
            const reflectionMessage: ReflectionMessage = {
              id: Date.now().toString(),
              content: reflection.content || 'Jag reflekterar över det du skriver...',
              timestamp: new Date(),
              isVisible: true,
              emotions: Array.isArray(reflection.emotions) ? reflection.emotions : ['🤔'],
              emotionalState: reflection.emotionalState || 'Fundersam'
            };
            
            console.log('🎯 Final reflection message:', reflectionMessage);
            subscriber.next(reflectionMessage);
            subscriber.complete();
          } catch (error) {
            console.error('❌ Failed to parse reflection JSON:', error, 'Response:', response);
            console.log('📄 Raw response that failed to parse:', response);
            subscriber.next({
              id: Date.now().toString(),
              content: 'Jag reflekterar över det du skriver...',
              timestamp: new Date(),
              isVisible: true,
              emotions: ['🤔'],
              emotionalState: 'Fundersam'
            });
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
      reasoning: 'Fel i analysprocessen - väntar',
      confidence: 0.1
    };
  }
}