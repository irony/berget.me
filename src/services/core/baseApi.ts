export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class BaseAPI {
  protected async makeRequest(
    messages: ChatMessage[], 
    model: string = 'llama-3.3-70b',
    stream: boolean = false,
    additionalParams: any = {}
  ): Promise<string> {
    const apiKey = import.meta.env.VITE_BERGET_API_KEY;
    if (!apiKey) {
      return '🔑 API-nyckel saknas. Kontrollera din konfiguration.';
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.berget.ai/v1';
    
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream,
          ...additionalParams
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API Error:', response.status, errorData);
        return `❌ API-fel (${response.status})\n\n${JSON.stringify(errorData, null, 2)}\n\nKontrollera din API-konfiguration och försök igen.`;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '❌ Tomt svar från API';
    } catch (error) {
      console.error('❌ Network error:', error);
      return '❌ Nätverksfel. Kontrollera din internetanslutning.';
    }
  }

  protected async makeStreamingRequest(
    messages: ChatMessage[], 
    model: string = 'llama-3.3-70b',
    onChunk: (chunk: string) => void,
    stream: boolean = true,
    additionalParams: any = {}
  ): Promise<{ content: string; tool_calls?: any[] }> {
    const apiKey = import.meta.env.VITE_BERGET_API_KEY;
    if (!apiKey) {
      const errorMsg = '🔑 API-nyckel saknas. Kontrollera din konfiguration.';
      onChunk(errorMsg);
      return { content: errorMsg };
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.berget.ai/v1';
    
    console.log('🚀 Starting streaming request to:', `${baseUrl}/chat/completions`);
    console.log('📝 Using model:', model);
    console.log('💬 Messages count:', messages.length);
    
    // Log the exact system prompt being sent
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      console.log('📋 EXACT SYSTEM PROMPT BEING SENT:');
      console.log(systemMessage.content.substring(0, 1000) + '...');
    }
    
    const requestBody = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
      stream,
      ...additionalParams
    };
    
    console.log('📡 Full request body:', JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API Error:', response.status, errorData);
        const errorMsg = `❌ API-fel (${response.status})\n\n${JSON.stringify(errorData, null, 2)}\n\nKontrollera din API-konfiguration och försök igen.`;
        onChunk(errorMsg);
        return { content: errorMsg };
      }

      if (!stream) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '❌ Tomt svar från API';
        onChunk(content);
        return { content, tool_calls: data.choices?.[0]?.message?.tool_calls };
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        const errorMsg = '❌ Kunde inte läsa streaming-svar';
        onChunk(errorMsg);
        return { content: errorMsg };
      }

      let fullContent = '';
      let toolCalls: any[] = [];
      let jsonBuffer = '';
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                
                if (delta?.content) {
                  const content = delta.content;
                  
                  // Check if this looks like JSON tool call response
                  if (content.includes('"tool_call"') || content.includes('"message"')) {
                    jsonBuffer += content;
                    
                    // Try to parse complete JSON
                    try {
                      const jsonMatch = jsonBuffer.match(/\{[\s\S]*\}/);
                      if (jsonMatch) {
                        const toolResponse = JSON.parse(jsonMatch[0]);
                        if (toolResponse.tool_call) {
                          // Add visual indicator for memory tool usage
                          const toolName = toolResponse.tool_call.name;
                          let toolIcon = '';
                          if (toolName === 'save_memory') {
                            toolIcon = '💾 ';
                          } else if (toolName === 'search_memory') {
                            toolIcon = '🔍 ';
                          }
                          
                          // Extract message and add tool indicator
                          const message = toolResponse.message || '';
                          fullContent = toolIcon + message;
                          onChunk(fullContent);
                          
                          // Store tool call for processing
                          toolCalls.push({
                            function: {
                              name: toolResponse.tool_call.name,
                              arguments: toolResponse.tool_call.parameters
                            }
                          });
                          jsonBuffer = ''; // Clear buffer
                          continue;
                        }
                      }
                    } catch (e) {
                      // JSON not complete yet, continue buffering
                    }
                  } else {
                    // Regular content, not JSON
                    fullContent += content;
                    onChunk(fullContent);
                  }
                }
                
                if (delta?.tool_calls) {
                  toolCalls.push(...delta.tool_calls);
                }
              } catch (parseError) {
                console.warn('⚠️ Failed to parse streaming chunk:', data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const result = { content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
      
      console.log('🔍 FULL CHAT API RESPONSE:');
      console.log(JSON.stringify(result, null, 2));
      
      return result;
    } catch (error) {
      console.error('❌ Network error:', error);
      const errorMsg = '❌ Nätverksfel. Kontrollera din internetanslutning.';
      onChunk(errorMsg);
      return { content: errorMsg };
    }
  }

  protected logFullResponse(response: any, context: string) {
    console.log(`🔍 FULL ${context} RESPONSE:`, JSON.stringify(response, null, 2));
  }

  protected extractJSON(response: string): any {
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
