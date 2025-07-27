import { bergetAPI } from './api';

export interface EmotionalAnalysis {
  emotions: string[];
  emotionalState: string;
  valence: 'positive' | 'negative' | 'neutral' | 'mixed';
  intensity: number;
  userNeeds: string[];
}

export class EmotionalAnalysisService {
  private static emotionalHistory: Array<EmotionalAnalysis & { timestamp: Date }> = [];

  static addToHistory(analysis: EmotionalAnalysis): void {
    this.emotionalHistory = [
      ...this.emotionalHistory.slice(-9),
      {
        ...analysis,
        timestamp: new Date()
      }
    ];
  }

  static getHistory(): Array<EmotionalAnalysis & { timestamp: Date }> {
    return this.emotionalHistory;
  }

  static getEmotionalTrend(): 'improving' | 'declining' | 'stable' | 'unknown' {
    const recent = this.emotionalHistory.slice(-3);
    if (recent.length < 2) return 'unknown';
    
    const positiveCount = recent.filter(a => a.valence === 'positive').length;
    const negativeCount = recent.filter(a => a.valence === 'negative').length;
    
    if (positiveCount > negativeCount) return 'improving';
    if (negativeCount > positiveCount) return 'declining';
    return 'stable';
  }

  static getCurrentEmotionalContext() {
    const latest = this.emotionalHistory[this.emotionalHistory.length - 1];
    return {
      currentEmotions: latest?.emotions || [],
      emotionalTrend: this.getEmotionalTrend(),
      userNeeds: latest?.userNeeds || [],
      conversationMood: latest?.emotionalState || 'neutral',
      recentEmotions: this.emotionalHistory.slice(-5).map(h => ({
        emotion: h.emotionalState,
        timestamp: h.timestamp,
        context: h.emotionalState
      }))
    };
  }

  static async analyzeAIEmotionalState(messages: Array<{ sender: string; content: string }>): Promise<{
    currentMood: string;
    confidence: number;
    shouldRespond: boolean;
    reasoning: string;
    emotionalNeed: string;
  } | null> {
    console.log('🤖 Analyzing AI emotional state...');
    
    // Get recent AI messages for analysis
    const recentAIMessages = messages
      .filter(m => m.sender === 'assistant')
      .slice(-3)
      .map(m => m.content);
    
    if (recentAIMessages.length === 0) {
      return null;
    }
    
    const aiAnalysisPrompt = `Analysera AI:ns emotionella tillstånd baserat på dess senaste svar. AI:n har simulerade känslor och kan känna empati, oro, glädje, frustration, etc.

SENASTE AI-SVAR:
${recentAIMessages.map((msg, i) => `${i + 1}. "${msg}"`).join('\n')}

Analysera:
1. Vilken känsla uttrycker AI:n mest?
2. Hur säker verkar AI:n på sina svar?
3. Vill AI:n fortsätta samtalet eller behöver den en paus?
4. Vad behöver AI:n emotionellt just nu?

Svara ENDAST med JSON:
{
  "currentMood": "empatisk oro",
  "confidence": 0.7,
  "shouldRespond": true,
  "reasoning": "AI:n visar stark empati men verkar osäker på hur den ska hjälpa bäst",
  "emotionalNeed": "vägledning om hur den ska balansera stöd och respekt för användarens gränser"
}`;

    try {
      const response = await bergetAPI.sendAnalysisMessage(aiAnalysisPrompt);
      const analysis = this.extractJSON(response);
      
      // Handle null response from extractJSON
      if (analysis === null) {
        console.error('❌ Failed to parse AI emotional analysis - non-JSON response:', response);
        return null;
      }
      
      console.log('🤖 AI emotional analysis:', analysis);
      return analysis;
    } catch (error) {
      console.error('❌ Failed to parse AI emotional analysis:', error);
      return null;
    }
  }

  private static extractJSON(response: string): any {
    try {
      // First try to parse the response directly
      return JSON.parse(response);
    } catch (error) {
      // If that fails, try to extract JSON from the response
     const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
     if (codeBlockMatch) {
       try {
         return JSON.parse(codeBlockMatch[1]);
       } catch (innerError) {
         console.error('Failed to parse JSON from code block:', innerError);
       }
     }
     
     // Try to extract JSON from the response without code blocks
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
          return null;
        }
      }
      return null;
    }
  }
}