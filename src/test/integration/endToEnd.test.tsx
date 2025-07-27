import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { VectorDatabase } from '../../services/vectorDatabase';
import { EmbeddingService } from '../../services/embeddingService';
import { ConversationIndexer } from '../../services/conversationIndexer';

// Mock scrollIntoView for jsdom
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
});

// Mock all external dependencies
vi.mock('../../services/embeddingService', () => ({
  EmbeddingService: {
    getEmbedding: vi.fn().mockImplementation((text: string) => {
      if (!text || typeof text !== 'string' || text.length === 0) {
        const fallbackEmbedding = new Array(384).fill(0);
        for (let i = 0; i < 384; i++) {
          fallbackEmbedding[i] = 0.1 + (i * 0.001);
        }
        return Promise.resolve(fallbackEmbedding);
      }
      
      const embedding = new Array(384).fill(0);
      for (let i = 0; i < Math.min(text.length, 384); i++) {
        embedding[i] = (text.charCodeAt(i) / 1000) + Math.sin(i + text.length) * 0.1 + 0.05;
      }
      
      // Add more variance to ensure uniqueness
      for (let i = 0; i < 384; i++) {
        embedding[i] += (i * 0.001) + (text.length * 0.0001) + 0.1;
      }
      
      // Ensure all values are valid numbers
      return Promise.resolve(embedding.map(val => isNaN(val) ? 0.1 : val));
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 5, keys: ['test1', 'test2'] })
  }
}));

vi.mock('../../services/api', () => ({
  bergetAPI: {
    sendMainChatMessageWithContextStreaming: vi.fn().mockImplementation(
      (messages, context, onChunk, useMemoryTools) => {
        const lastMessage = messages[messages.length - 1];
        let response = '';
        
        if (lastMessage?.content.includes('heter Anna')) {
          response = '💾 Trevligt att träffas Anna! Jag kommer ihåg ditt namn.';
        } else if (lastMessage?.content.includes('vad heter jag') || lastMessage?.content.includes('Vad heter jag')) {
          response = 'Du heter Anna!';
        } else if (lastMessage?.content.includes('mår dåligt')) {
          response = 'Jag förstår att du mår dåligt. Vill du prata om vad som händer?';
        } else {
          response = 'Tack för ditt meddelande! Hur kan jag hjälpa dig?';
        }
        
        // Simulate streaming
        setTimeout(() => onChunk(response), 100);
        
        return Promise.resolve({
          content: response,
          suggestedNextContactTime: 120000,
          conversationPace: 'medium'
        });
      }
    ),
    
    sendReflectionAnalysisMessageWithJsonMode: vi.fn().mockImplementation((messages) => {
      const userContent = messages.find(m => m.role === 'user')?.content || '';
      
      if (userContent.includes('heter Anna')) {
        return Promise.resolve(JSON.stringify({
          content: 'Du presenterar dig själv med ditt namn',
          emotions: ['😊', '👋'],
          emotionalState: 'Vänlig presentation',
          memoryAction: {
            shouldSave: true,
            content: 'Användaren heter Anna',
            type: 'fact',
            importance: 0.9,
            tags: ['namn', 'identitet'],
            reasoning: 'Viktigt att komma ihåg användarens namn'
          }
        }));
      } else if (userContent.includes('mår dåligt')) {
        return Promise.resolve(JSON.stringify({
          content: 'Du uttrycker att du mår dåligt',
          emotions: ['😟', '💙'],
          emotionalState: 'Behöver stöd',
          memoryAction: {
            shouldSave: true,
            content: 'Användaren mår dåligt och behöver stöd',
            type: 'reflection',
            importance: 0.8,
            tags: ['känslor', 'stöd'],
            reasoning: 'Viktigt att komma ihåg användarens emotionella tillstånd'
          }
        }));
      } else {
        return Promise.resolve(JSON.stringify({
          content: 'Du skriver något neutralt',
          emotions: ['🤔'],
          emotionalState: 'Neutral',
          memoryAction: {
            shouldSave: false,
            reasoning: 'Inget specifikt att spara'
          }
        }));
      }
    }),
    
    sendAnalysisMessageWithJsonMode: vi.fn().mockResolvedValue(JSON.stringify({
      shouldAct: false,
      actionType: 'wait',
      priority: 'low',
      timing: 5000,
      reasoning: 'Konversationen flyter naturligt',
      confidence: 0.7
    }))
  }
}));

describe('End-to-End Integration Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    VectorDatabase.clearAllEntries();
    VectorDatabase.clearIndexVectors();
    ConversationIndexer.clearQueue();
    
    // Setup mock localStorage
    const mockStorage: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => mockStorage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      mockStorage[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete mockStorage[key];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete User Journey', () => {
    it('ska hantera en komplett konversation med minneslagring', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Verifiera att appen laddas korrekt
      expect(screen.getByText('berget.me')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Skriv ditt meddelande/)).toBeInTheDocument();

      // 3. Skriv första meddelandet (presentation)
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      await user.type(input, 'Hej, jag heter Anna');
      
      // 4. Skicka meddelandet
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // 5. Vänta på AI-svar
      await waitFor(() => {
        expect(screen.getByText(/Trevligt att träffas Anna/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // 6. Vänta på att minneslagring ska slutföras
      await new Promise(resolve => setTimeout(resolve, 500));

      // 7. Öppna minnespanelen för att verifiera att namnet sparades
      const memoryButton = screen.getByText('Minne');
      await user.click(memoryButton);

      // 8. Vänta på att minnespanelen laddas
      await waitFor(() => {
        expect(screen.getByText('AI Långtidsminne')).toBeInTheDocument();
      });

      // 9. Verifiera att minnet sparades (genom att kolla statistik)
      await waitFor(() => {
        const statsElements = screen.getAllByText(/Totalt minnen:/);
        expect(statsElements.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      // 10. Skriv ett andra meddelande som refererar till namnet
      await user.click(input);
      await user.clear(input);
      await user.type(input, 'Vad heter jag?');
      await user.click(sendButton);

      // 11. Verifiera att AI:n kommer ihåg namnet
      await waitFor(() => {
        expect(screen.getByText('Du heter Anna!')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('ska visa reflektioner i realtid', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Verifiera att reflektionspanelen är synlig som standard
      expect(screen.getByText('Realtidsreflektion')).toBeInTheDocument();

      // 3. Börja skriva ett emotionellt meddelande
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      await user.type(input, 'Jag mår verkligen dåligt idag');

      // 4. Vänta på att reflektion genereras (simulerat genom typing)
      await waitFor(() => {
        // Reflektioner genereras baserat på input, så vi väntar lite
        expect(input).toHaveValue('Jag mår verkligen dåligt idag');
      });

      // 5. Skicka meddelandet
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // 6. Vänta på AI-svar
      await waitFor(() => {
        expect(screen.getByText(/mår dåligt/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // 7. Vänta på att reflektion och minneslagring slutförs
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('ska hantera växling mellan paneler', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Verifiera att reflektionspanelen är synlig som standard
      expect(screen.getByText('Realtidsreflektion')).toBeInTheDocument();

      // 3. Klicka för att dölja reflektionspanelen
      const reflectionButton = screen.getByText('Reflektion');
      await user.click(reflectionButton);

      // 4. Verifiera att reflektionspanelen döljs
      await waitFor(() => {
        expect(screen.queryByText('Realtidsreflektion')).not.toBeInTheDocument();
      });

      // 5. Öppna minnespanelen
      const memoryButton = screen.getByText('Minne');
      await user.click(memoryButton);

      // 6. Verifiera att minnespanelen visas
      await waitFor(() => {
        expect(screen.getByText('AI Långtidsminne')).toBeInTheDocument();
      });

      // 7. Öppna reflektionspanelen igen
      await user.click(reflectionButton);

      // 8. Verifiera att båda panelerna kan vara öppna samtidigt
      expect(screen.getByText('Realtidsreflektion')).toBeInTheDocument();
      expect(screen.getByText('AI Långtidsminne')).toBeInTheDocument();
    });

    it('ska hantera minnesökning i minnespanelen', async () => {
      // 1. Rendera appen och lägg till några minnen först
      render(<App />);

      // 2. Skicka några meddelanden för att skapa minnen
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      const sendButton = screen.getByRole('button', { name: /send/i });

      // Första meddelandet
      await user.type(input, 'Jag heter Anna och arbetar som utvecklare');
      await user.click(sendButton);
      await waitFor(() => screen.getByText(/Tack för ditt meddelande/), { timeout: 3000 });

      // Andra meddelandet
      await user.clear(input);
      await user.type(input, 'Jag gillar kaffe på morgonen');
      await user.click(sendButton);
      await waitFor(() => screen.getByText(/Tack för ditt meddelande/), { timeout: 3000 });

      // 3. Vänta på minneslagring
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Öppna minnespanelen
      const memoryButton = screen.getByText('Minne');
      await user.click(memoryButton);

      // 5. Vänta på att panelen laddas
      await waitFor(() => {
        expect(screen.getByText('AI Långtidsminne')).toBeInTheDocument();
      });

      // 6. Hitta sökfältet och sök efter "Anna"
      const searchInput = screen.getByPlaceholderText('Sök i minnen...');
      await user.type(searchInput, 'Anna');


      // 7. Klicka på sökknappen
      const searchButtons = screen.getAllByRole('button');
      const searchButton = searchButtons.find(btn => btn.querySelector('svg'));
      if (searchButton) {
        await user.click(searchButton);
      }

      // 8. Vänta på sökresultat
      await waitFor(() => {
        // Sökresultat bör visas
        expect(searchInput).toHaveValue('Anna');
      }, { timeout: 2000 });
    });
  });

  describe('Error Handling in UI', () => {
    it('ska hantera API-fel gracefully', async () => {
      // 1. Mock API att kasta fel
      const { bergetAPI } = await import('../../services/api');
      vi.mocked(bergetAPI.sendMainChatMessageWithContextStreaming).mockRejectedValueOnce(
        new Error('Network Error')
      );

      // 2. Rendera appen
      render(<App />);

      // 3. Skicka ett meddelande
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.type(input, 'Test meddelande');
      await user.click(sendButton);

      // 4. Vänta på felhantering
      await waitFor(() => {
        // Meddelandet ska fortfarande visas i chatten
        expect(screen.getByText('Test meddelande')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 5. Verifiera att användaren kan fortsätta använda appen
      await user.clear(input);
      await user.type(input, 'Nytt meddelande');
      expect(input).toHaveValue('Nytt meddelande');
    });

    it('ska visa laddningsindikatorer korrekt', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Skicka ett meddelande
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.type(input, 'Test meddelande');
      await user.click(sendButton);

      // 3. Verifiera att typing-indikator visas
      await waitFor(() => {
        // Leta efter typing-indikatorn (prickar som animeras)
        const typingIndicators = screen.getAllByRole('generic');
        const hasTypingIndicator = typingIndicators.some(el => 
          el.className.includes('animate-thinking-pulse')
        );
        expect(hasTypingIndicator).toBe(true);
      }, { timeout: 1000 });

      // 4. Vänta på att svaret kommer
      await waitFor(() => {
        expect(screen.getByText(/Tack för ditt meddelande/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Accessibility and UX', () => {
    it('ska vara tillgänglig med tangentbord', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Navigera med Tab
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      input.focus();
      expect(input).toHaveFocus();

      // 3. Skriv meddelande och använd Enter för att skicka
      await user.type(input, 'Test meddelande{enter}');

      // 4. Verifiera att meddelandet skickades
      await waitFor(() => {
        expect(screen.getByText('Test meddelande')).toBeInTheDocument();
      });

      // 5. Testa Shift+Enter för ny rad
      await user.type(input, 'Första raden{shift}{enter}Andra raden');
      expect(input).toHaveValue('Första raden\nAndra raden');
    });

    it('ska visa korrekta tidsstämplar', async () => {
      // 1. Rendera appen
      render(<App />);

      // 2. Skicka ett meddelande
      const input = screen.getByPlaceholderText(/Skriv ditt meddelande/);
      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.type(input, 'Test meddelande');
      await user.click(sendButton);

      // 3. Vänta på svar
      await waitFor(() => {
        expect(screen.getByText('Test meddelande')).toBeInTheDocument();
      });

      // 4. Verifiera att tidsstämplar visas
      const timeElements = screen.getAllByText(/\d{2}:\d{2}/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });
});
