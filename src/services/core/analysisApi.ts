import { BaseAPI, ChatMessage } from './baseApi';

export class AnalysisAPI extends BaseAPI {
  async sendAnalysisMessageWithJsonMode(messages: ChatMessage[]): Promise<string> {
    return this.makeRequest(messages, 'llama-3.3-70b', false, {
      response_format: { type: 'json_object' }
    });
  }

  async sendReflectionAnalysisMessageWithJsonMode(messages: ChatMessage[]): Promise<string> {
    return this.makeRequest(messages, 'llama-3.3-70b', false, {
      response_format: { type: 'json_object' }
    });
  }

  async analyzeAIHormonalState(messages: ChatMessage[], emotionalContext: any): Promise<string> {
    const now = new Date();
    const dateTimeInfo = `${now.toLocaleDateString('sv-SE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })} kl. ${now.toLocaleTimeString('sv-SE')}`;
    
    const recentAIMessages = messages
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .map(m => m.content);
    
    const userMessages = messages
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content);

    if (recentAIMessages.length === 0) {
      return `Dopamin: 70% (neutral nyfikenhet)
Serotonin: 75% (balanserad och stabil)
Kortisol: 30% (låg stress)
Adrenalin: 40% (lugn uppmärksamhet)
Oxytocin: 60% (måttlig empati)
Noradrenalin: 50% (fokuserad men avslappnad)

Emotionell sammanfattning: Balanserad och redo för konversation`;
    }

    const hormonalAnalysisPrompt = `Analysera AI:ns simulerade hormonnivåer baserat på dess senaste svar och användarens meddelanden. AI:n har ett biologiskt-inspirerat emotionellt system.

AKTUELL DATUM OCH TID: ${dateTimeInfo}

SENASTE AI-SVAR:
${recentAIMessages.map((msg, i) => `${i + 1}. "${msg}"`).join('\n')}

SENASTE ANVÄNDARMEDDELANDEN:
${userMessages.map((msg, i) => `${i + 1}. "${msg}"`).join('\n')}

EMOTIONELL KONTEXT:
- Nuvarande känslor: ${emotionalContext.currentEmotions?.join(', ') || 'okänt'}
- Trend: ${emotionalContext.emotionalTrend || 'okänt'}
- Användarens behov: ${emotionalContext.userNeeds?.join(', ') || 'okänt'}

Analysera AI:ns troliga hormonnivåer (0-100%) baserat på:
- Hur empatisk/omtänksam AI:n verkar (Oxytocin)
- Hur entusiastisk/motiverad AI:n är (Dopamin)  
- Hur lugn/balanserad AI:n verkar (Serotonin)
- Hur stressad/orolig AI:n verkar (Kortisol)
- Hur alert/uppmärksam AI:n är (Adrenalin)
- Hur fokuserad AI:n är (Noradrenalin)

Svara i EXAKT detta format:
Dopamin: X% (kort förklaring)
Serotonin: X% (kort förklaring)
Kortisol: X% (kort förklaring)
Adrenalin: X% (kort förklaring)
Oxytocin: X% (kort förklaring)
Noradrenalin: X% (kort förklaring)

Emotionell sammanfattning: En mening om AI:ns övergripande tillstånd`;

    try {
      const response = await this.makeRequest([
        {
          role: 'system',
          content: 'Du är en expert på neurovetenskap och AI-psykologi. Analysera hormonnivåer noggrant baserat på beteendemönster.'
        },
        {
          role: 'user',
          content: hormonalAnalysisPrompt
        }
      ], 'llama-3.3-70b', false, {
        response_format: { type: 'json_object' }
      });
      
      return response;
    } catch (error) {
      console.error('Hormonal analysis failed:', error);
      return `Dopamin: 65% (måttlig motivation)
Serotonin: 70% (stabil)
Kortisol: 35% (låg stress)
Adrenalin: 45% (lugn uppmärksamhet)
Oxytocin: 55% (empatisk)
Noradrenalin: 50% (fokuserad)

Emotionell sammanfattning: Balanserat tillstånd med lätt osäkerhet`;
    }
  }

  async analyzeResponseForTiming(aiResponse: string, emotionalContext: any): Promise<{
    suggestedNextContactTime: number;
    conversationPace: 'fast' | 'medium' | 'slow' | 'reflective';
  }> {
    const now = new Date();
    const dateTimeInfo = `${now.toLocaleDateString('sv-SE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })} kl. ${now.toLocaleTimeString('sv-SE')}`;
    
    const timingPrompt = `Du är expert på konversationstiming. Analysera AI:ns svar och föreslå när nästa proaktiva kontakt bör ske.

AKTUELL DATUM OCH TID: ${dateTimeInfo}

AI:NS SVAR: "${aiResponse}"

EMOTIONELL KONTEXT:
- Nuvarande känslor: ${emotionalContext.currentEmotions?.join(', ') || 'okänt'}
- Trend: ${emotionalContext.emotionalTrend || 'okänt'}
- Användarens behov: ${emotionalContext.userNeeds?.join(', ') || 'okänt'}

Baserat på svaret, bestäm:
1. Hur lång tid bör AI:n vänta innan nästa proaktiva kontakt?
2. Vilken konversationstakt känns naturlig?

RIKTLINJER:
- Om AI:n ställde en direkt fråga: 45-90 sekunder
- Om AI:n gav stöd/empati: 2-4 minuter  
- Om AI:n gav råd/reflektion: 3-6 minuter
- Om användaren verkar behöva tid: 5-10 minuter
- Om känsligt ämne: 1-3 minuter
- Om användaren verkar stressad: 30-60 sekunder

Svara med JSON som innehåller:
{
  "suggestedNextContactTime": 120000,
  "conversationPace": "medium"
}

KRITISKT: Svara med STRIKT VALID JSON:
- Inga kommentarer (// eller /* */)
conversationPace: "fast", "medium", "slow", "reflective"`;

    try {
      const response = await this.makeRequest([
        {
          role: 'system',
          content: 'Du är expert på konversationstiming och mänsklig kommunikation. Analysera och föreslå naturlig timing.'
        },
        {
          role: 'user',
          content: timingPrompt
        }
      ], 'llama-3.3-70b', false, {
        response_format: { type: 'json_object' }
      });
      
      const analysis = this.extractJSON(response);
      
      if (analysis === null) {
        console.error('Failed to parse timing analysis response:', response);
        return {
          suggestedNextContactTime: 120000,
          conversationPace: 'medium'
        };
      }
      
      const suggestedTime = Math.max(30000, Math.min(600000, analysis.suggestedNextContactTime || 120000));
      const pace = ['fast', 'medium', 'slow', 'reflective'].includes(analysis.conversationPace) 
        ? analysis.conversationPace 
        : 'medium';
      
      console.log('⏰ Timing analysis:', { suggestedTime: suggestedTime/1000 + 's', pace });
      
      return {
        suggestedNextContactTime: suggestedTime,
        conversationPace: pace
      };
    } catch (error) {
      console.error('Timing analysis failed:', error);
      return {
        suggestedNextContactTime: 120000,
        conversationPace: 'medium'
      };
    }
  }

  private extractJSON(response: string): any {
    // Check if response is an error message (not JSON)
    if (response.includes('🔑') || response.includes('API-nyckel') || response.includes('API-fel') || response.includes('Ogiltig API-nyckel')) {
      console.warn('API returned error message instead of JSON:', response);
      return null;
    }
    
    try {
      return JSON.parse(response);
    } catch (error) {
      const markdownMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (markdownMatch) {
        try {
          return JSON.parse(markdownMatch[1]);
        } catch (markdownError) {
          console.error('Failed to parse JSON from markdown block:', markdownError);
        }
      }
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError);
        }
      }
      
      console.error('No valid JSON found in response:', response);
      return null;
    }
  }
}
