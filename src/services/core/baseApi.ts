const API_KEY = import.meta.env.VITE_BERGET_API_KEY;
const API_URL = import.meta.env.VITE_OPENAI_API_URL;
import { Observable, fromEvent, map, filter, scan, takeUntil, catchError, of, tap } from 'rxjs';

// Fallback models if the primary ones fail
const FALLBACK_MODELS = {
  'llama-3.3-70b': ['gpt-3.5-turbo', 'gpt-4o-mini'],
  'mistralai/Magistral-Small-2506': ['llama-3.3-70b', 'gpt-3.5-turbo', 'gpt-4o-mini'],
  'mistral-small': ['llama-3.3-70b', 'gpt-3.5-turbo', 'gpt-4o-mini'],
  'llama-3.1-8b': ['gpt-3.5-turbo', 'gpt-4o-mini']
};

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class BaseAPI {
  protected async makeRequest(
    messages: ChatMessage[], 
    model: string, 
    retryWithFallback = true,
    options: {
      tools?: any[];
      response_format?: { type: 'json_object' };
    } = {}
  ): Promise<string> {
    // Check if API is configured
    if (!API_KEY || API_KEY === 'your_api_key_here' || API_KEY.trim() === '') {
      return '🔑 API-nyckel saknas eller ogiltig.\n\nFör att använda chatten behöver du:\n1. Skapa en .env fil i projektets rot\n2. Lägg till: VITE_BERGET_API_KEY=din_riktiga_api_nyckel\n3. Starta om servern\n\nKontakta administratören för en giltig API-nyckel.';
    }

    if (!API_URL || API_URL === 'https://api.openai.com/v1' || API_URL.trim() === '') {
      return '🌐 API-URL saknas eller ogiltig.\n\nFör att använda chatten behöver du:\n1. Konfigurera VITE_OPENAI_API_URL i .env filen\n2. Starta om servern\n\nKontakta administratören för rätt API-endpoint.';
    }

    try {
      const response = await fetch(`${API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: false,
          ...options,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        
        // Handle specific API key errors
        if (response.status === 401 || 
            (response.status === 500 && errorData?.error?.message?.includes('Invalid API key'))) {
          return '🔑 Ogiltig API-nyckel.\n\nDin API-nyckel är inte giltig eller har gått ut.\nKontrollera att VITE_BERGET_API_KEY i .env filen är korrekt och att din prenumeration är aktiv.\n\nKontakta administratören för hjälp.';
        }
        
        // If we get a 500 error and haven't tried fallback models yet
        if (response.status === 500 && retryWithFallback && FALLBACK_MODELS[model]) {
          console.warn(`Model ${model} failed with 500, trying fallback models...`);
          
          // Try each fallback model
          for (const fallbackModel of FALLBACK_MODELS[model]) {
            try {
              console.log(`Trying fallback model: ${fallbackModel}`);
              return await this.makeRequest(messages, fallbackModel, false);
            } catch (fallbackError) {
              console.warn(`Fallback model ${fallbackModel} also failed:`, fallbackError);
              continue;
            }
          }
        }
        
        // If all fallbacks failed or it's a different error
        const errorText = errorData ? JSON.stringify(errorData) : await response.text().catch(() => 'Okänt fel');
        return `❌ API-fel (${response.status})\n\n${errorText}\n\nKontrollera din API-konfiguration och försök igen.`;
      }

      const data = await response.json();
      
      // Handle tool calls
      if (data.choices[0]?.message?.tool_calls) {
        return JSON.stringify({
          content: data.choices[0].message.content || '',
          tool_calls: data.choices[0].message.tool_calls
        });
      }
      
      const content = data.choices[0]?.message?.content;
      
      if (!content || content.trim() === '') {
        console.warn('Empty response from API, retrying...');
        const retryMessages = messages.length > 1 ? messages.slice(-1) : messages;
        return this.makeRequest(retryMessages, model, false);
      }
      
      return content;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return '🌐 Anslutningsfel\n\nKunde inte ansluta till AI-tjänsten.\nKontrollera:\n• Din internetanslutning\n• API-URL i .env filen\n• Att tjänsten är tillgänglig';
      }
      
      console.error('API Error:', error);
      return '❌ Oväntat fel\n\nNågot gick fel vid anslutningen till AI-tjänsten.\nFörsök igen om en stund eller kontakta administratören.';
    }
  }

  protected async makeStreamingRequest(
    messages: ChatMessage[], 
    model: string, 
    onChunk: (chunk: string) => void,
    retryWithFallback = true,
    options: {
      tools?: any[];
      response_format?: { type: 'json_object' };
    } = {}
  ): Promise<{ content: string; tool_calls?: any[] }> {
    return this.makeStreamingRequestWithRxJS(messages, model, onChunk, retryWithFallback, options);
  }

  private async makeStreamingRequestWithRxJS(
    messages: ChatMessage[], 
    model: string, 
    onChunk: (chunk: string) => void,
    retryWithFallback = true,
    options: {
      tools?: any[];
      response_format?: { type: 'json_object' };
    } = {}
  ): Promise<{ content: string; tool_calls?: any[] }> {
    // Check if API is configured
    if (!API_KEY || API_KEY === 'your_api_key_here' || API_KEY.trim() === '') {
      const errorMsg = '🔑 API-nyckel saknas eller ogiltig.\n\nFör att använda chatten behöver du:\n1. Skapa en .env fil i projektets rot\n2. Lägg till: VITE_BERGET_API_KEY=din_riktiga_api_nyckel\n3. Starta om servern\n\nKontakta administratören för en giltig API-nyckel.';
      onChunk(errorMsg);
      return { content: errorMsg };
    }

    if (!API_URL || API_URL === 'https://api.openai.com/v1' || API_URL.trim() === '') {
      const errorMsg = '🌐 API-URL saknas eller ogiltig.\n\nFör att använda chatten behöver du:\n1. Konfigurera VITE_OPENAI_API_URL i .env filen\n2. Starta om servern\n\nKontakta administratören för rätt API-endpoint.';
      onChunk(errorMsg);
      return { content: errorMsg };
    }

    console.log('🚀 Starting RxJS streaming request to:', `${API_URL}/chat/completions`);
    console.log('📝 Using model:', model);
    console.log('💬 Messages count:', messages.length);

    try {
      const response = await fetch(`${API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
          // Add specific parameters for Llama 3.3 tool calling
          tool_choice: "auto",
          ...options,
        }),
      });

      console.log('📡 Request body sent:', JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content.substring(0, 50) + '...' })),
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
        tool_choice: "auto",
        ...options,
      }, null, 2));
      
      // Log the FULL request for debugging tool issues
      if (options.tools) {
        console.log('🔧 FULL REQUEST BODY FOR DEBUGGING:', JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
          tool_choice: "auto",
          ...options,
        }, null, 2));
      }

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        // Handle errors same as before
        const errorData = await response.json().catch(() => null);
        
        if (response.status === 401 || 
            (response.status === 500 && errorData?.error?.message?.includes('Invalid API key'))) {
          const errorMsg = '🔑 Ogiltig API-nyckel.\n\nDin API-nyckel är inte giltig eller har gått ut.\nKontrollera att VITE_BERGET_API_KEY i .env filen är korrekt och att din prenumeration är aktiv.\n\nKontakta administratören för hjälp.';
          onChunk(errorMsg);
          return { content: errorMsg };
        }
        
        if (response.status === 500 && retryWithFallback && FALLBACK_MODELS[model]) {
          console.warn(`Model ${model} failed with 500, trying fallback models...`);
          
          for (const fallbackModel of FALLBACK_MODELS[model]) {
            try {
              console.log(`Trying fallback model: ${fallbackModel}`);
              return await this.makeStreamingRequestWithRxJS(messages, fallbackModel, onChunk, false);
            } catch (fallbackError) {
              console.warn(`Fallback model ${fallbackModel} also failed:`, fallbackError);
              continue;
            }
          }
        }
        
        const errorText = errorData ? JSON.stringify(errorData) : await response.text().catch(() => 'Okänt fel');
        const errorMsg = `❌ API-fel (${response.status})\n\n${errorText}\n\nKontrollera din API-konfiguration och försök igen.`;
        onChunk(errorMsg);
        return { content: errorMsg };
      }

      // Create RxJS stream from the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available for streaming response');
      }

      console.log('🌊 Creating RxJS stream from response...');

      return new Promise((resolve, reject) => {
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let toolCalls: any[] = [];
        let isInThinking = false;

        // Create observable from reader
        const stream$ = new Observable<Uint8Array>(subscriber => {
          const readChunk = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  subscriber.complete();
                  break;
                }
                subscriber.next(value);
              }
            } catch (error) {
              subscriber.error(error);
            }
          };
          readChunk();

          // Cleanup function
          return () => {
            reader.releaseLock();
          };
        });

        // Process the stream with RxJS operators
        stream$.pipe(
          // Decode chunks to text
          map(chunk => decoder.decode(chunk, { stream: true })),
          tap(chunk => console.log('📦 RxJS Raw chunk:', chunk.substring(0, 100) + '...')),
          
          // Split into lines and filter for data lines
          map(chunk => chunk.split('\n').filter(line => line.startsWith('data: '))),
          
          // Flatten array of lines
          map(lines => lines.map(line => line.slice(6))),
          
          // Filter out [DONE] and empty lines
          map(dataLines => dataLines.filter(data => data !== '[DONE]' && data.trim())),
          
          // Parse JSON and extract content
          map(dataLines => {
            const contents: string[] = [];
            const newToolCalls: any[] = [];
            
            for (const data of dataLines) {
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                
                if (parsed.choices && parsed.choices.length === 0) {
                  continue; // Skip empty choices
                }
                
                if (delta?.tool_calls) {
                  console.log('🔧 TOOL CALLS DETECTED in delta:', JSON.stringify(delta.tool_calls, null, 2));
                  newToolCalls.push(...delta.tool_calls);
                }
                
                const content = delta?.content;
                if (content !== undefined && content !== null) {
                  console.log('🎯 RxJS Content extracted:', JSON.stringify(content));
                  contents.push(content);
                }
              } catch (parseError) {
                console.warn('⚠️ RxJS Parse error:', parseError);
              }
            }
            
            return { contents, toolCalls: newToolCalls };
          }),
          
          // Filter out empty results
          filter(result => result.contents.length > 0 || result.toolCalls.length > 0),
          
          // Accumulate content
          scan((acc, current) => {
            // Handle tool calls
            if (current.toolCalls.length > 0) {
              acc.toolCalls.push(...current.toolCalls);
            }
            
            // Handle content
            for (const content of current.contents) {
              // Skip thinking tags
              if (content.includes('<think>')) {
                acc.isInThinking = true;
                continue;
              }
              
              if (content.includes('</think>')) {
                acc.isInThinking = false;
                continue;
              }
              
              if (acc.isInThinking) {
                continue;
              }
              
              acc.content += content;
              console.log('📈 RxJS Accumulated content:', acc.content.length, 'chars');
            }
            
            return acc;
          }, { content: '', toolCalls: [], isInThinking: false }),
          
          // Send updates to UI
          tap(acc => {
            if (acc.content) {
              console.log('📤 RxJS Sending to UI:', acc.content.substring(0, 50) + '...');
              onChunk(acc.content);
            }
          }),
          
          // Handle errors
          catchError(error => {
            console.error('❌ RxJS Stream error:', error);
            const errorMsg = 'Ursäkta, något gick fel med streaming. Kan du försöka igen?';
            onChunk(errorMsg);
            return of({ content: errorMsg, toolCalls: [], isInThinking: false });
          })
        ).subscribe({
          next: (acc) => {
            accumulatedContent = acc.content;
            toolCalls = acc.toolCalls;
          },
          error: (error) => {
            console.error('❌ RxJS Subscription error:', error);
            const errorMsg = 'Ursäkta, något gick fel. Kan du försöka igen?';
            resolve({ content: errorMsg });
          },
          complete: () => {
            console.log('✅ RxJS Stream completed');
            
            // Provide fallback if no content
            if (!accumulatedContent.trim() && toolCalls.length === 0) {
              const fallbackMessage = 'Hej! Hur kan jag hjälpa dig idag?';
              accumulatedContent = fallbackMessage;
              onChunk(fallbackMessage);
            }
            
            console.log('🎯 RxJS Final result:', { 
              contentLength: accumulatedContent.length, 
              toolCallsCount: toolCalls.length 
            });
            
            resolve({ 
              content: accumulatedContent,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined
            });
          }
        });
      });
      
    } catch (error) {
      console.error('❌ RxJS Streaming setup error:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const errorMsg = '🌐 Anslutningsfel\n\nKunde inte ansluta till AI-tjänsten.\nKontrollera:\n• Din internetanslutning\n• API-URL i .env filen\n• Att tjänsten är tillgänglig';
        onChunk(errorMsg);
        return { content: errorMsg };
      }
      
      const errorMsg = 'Ursäkta, något gick fel. Kan du försöka igen?';
      onChunk(errorMsg);
      return { content: errorMsg };
    }
  }

  protected extractJSON(response: string): any {
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