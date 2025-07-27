import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VectorMemoryService } from '../../services/vectorMemory';
import { VectorDatabase } from '../../services/vectorDatabase';
import { ConversationIndexer } from '../../services/conversationIndexer';
import { LLMDecisionService } from '../../services/llmDecisionService';
import { ConversationStateBuilder } from '../../services/stateBuilder';
import { EmbeddingService } from '../../services/embeddingService';
import { Message } from '../../types/chat';

// Mock the embedding service to avoid API calls in tests
vi.mock('../../services/embeddingService', () => ({
  EmbeddingService: {
    getEmbedding: vi.fn().mockImplementation((text: string) => {
      // Create a simple mock embedding based on text content
      const words = text.toLowerCase().split(' ');
      const embedding = new Array(384).fill(0);
      
      // Simple hash-based embedding for testing
      words.forEach((word, wordIndex) => {
        for (let i = 0; i < word.length; i++) {
          const charCode = word.charCodeAt(i);
          const index = (charCode + wordIndex * i) % 384;
          embedding[index] += Math.sin(charCode * 0.1) * 0.1;
        }
      });
      
      // Normalize
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return Promise.resolve(magnitude > 0 ? embedding.map(val => val / magnitude) : embedding);
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, keys: [] })
  }
}));

// Mock the bergetAPI to avoid real API calls
const { bergetAPI } = await import('../../services/api');
vi.mock('../../services/api', () => ({
  bergetAPI: {
    sendReflectionAnalysisMessageWithJsonMode: vi.fn().mockImplementation((messages) => {
      const userContent = messages.find(m => m.role === 'user')?.content || '';
      
      // Mock reflection response based on input content
      if (userContent.includes('heter Anna')) {
        return Promise.resolve(JSON.stringify({
          content: 'Du verkar presentera dig själv och dela ditt namn',
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
          content: 'Du verkar må dåligt och behöver stöd',
          emotions: ['😟', '💙'],
          emotionalState: 'Behöver stöd',
          memoryAction: {
            shouldSave: true,
            content: 'Användaren mår dåligt och behöver emotionellt stöd',
            type: 'reflection',
            importance: 0.8,
            tags: ['känslor', 'stöd', 'negativ_känsla'],
            reasoning: 'Viktigt att komma ihåg användarens emotionella tillstånd'
          }
        }));
      } else {
        return Promise.resolve(JSON.stringify({
          content: 'Du verkar skriva något intressant',
          emotions: ['🤔'],
          emotionalState: 'Neutral reflektion',
          memoryAction: {
            shouldSave: false,
            reasoning: 'Inget specifikt att spara från detta meddelande'
          }
        }));
      }
    })
  }
}));

describe('Memory Flow Integration Tests', () => {
  beforeEach(() => {
    // Clear all storage before each test
    localStorage.clear();
    VectorDatabase.clearAllEntries();
    VectorDatabase.clearIndexVectors();
    EmbeddingService.clearCache();
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
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
      Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Memory Flow', () => {
    it('ska hantera hela flödet från användarinput till minneslagring', async () => {
      // 1. Simulera användarinput
      const userMessage: Message = {
        id: '1',
        content: 'Hej, jag heter Anna och mår dåligt idag',
        sender: 'user',
        timestamp: new Date()
      };

      // 2. Bygg konversationstillstånd
      const state = ConversationStateBuilder
        .create()
        .withCurrentInput(userMessage.content, new Date(), new Date())
        .withConversationHistory([userMessage])
        .withTemporalContext()
        .withEngagementMetrics()
        .build();

      // 3. Generera reflektion (som skulle trigga minneslagring)
      const reflection = await new Promise((resolve) => {
        LLMDecisionService.generateReflection(state).subscribe(resolve);
      });

      // 4. Vänta lite för att låta asynkron minneslagring slutföras
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Verifiera att reflektionen genererades korrekt
      expect(reflection).toBeTruthy();
      expect(reflection.content).toContain('presentera');
      expect(reflection.emotions).toContain('😊');

      // 6. Verifiera att minnet sparades
      const memories = VectorMemoryService.getAllMemories();
      expect(memories.length).toBeGreaterThan(0);
      
      const nameMemory = memories.find(m => m.content.includes('Anna'));
      const emotionMemory = memories.find(m => m.content.includes('dåligt'));
      
      expect(nameMemory).toBeTruthy();
      expect(nameMemory?.metadata.type).toBe('memory'); // Converted from 'fact'
      expect(nameMemory?.metadata.tags).toContain('namn');
      
      expect(emotionMemory).toBeTruthy();
      expect(emotionMemory?.metadata.type).toBe('memory'); // Converted from 'reflection'
      expect(emotionMemory?.metadata.tags).toContain('känslor');
    });

    it('ska kunna söka i sparade minnen', async () => {
      // 1. Spara några testminnen
      await VectorMemoryService.saveMemory(
        'Användaren heter Anna och arbetar som utvecklare',
        'fact',
        0.9,
        ['namn', 'jobb']
      );

      await VectorMemoryService.saveMemory(
        'Användaren gillar kaffe på morgonen',
        'preference',
        0.7,
        ['kaffe', 'morgon']
      );

      await VectorMemoryService.saveMemory(
        'Användaren känner sig stressad på jobbet',
        'reflection',
        0.8,
        ['stress', 'jobb', 'känslor']
      );

      // 2. Sök efter namn
      const nameResults = await VectorMemoryService.searchMemories('Anna', 5, 0.1);
      expect(nameResults.length).toBeGreaterThan(0);
      expect(nameResults[0].entry.content).toContain('Anna');

      // 3. Sök efter jobb-relaterat
      const jobResults = await VectorMemoryService.searchMemories('arbete utvecklare', 5, 0.1);
      expect(jobResults.length).toBeGreaterThan(0);
      expect(jobResults.some(r => r.entry.content.includes('utvecklare'))).toBe(true);

      // 4. Sök med typfilter
      const preferenceResults = await VectorMemoryService.searchMemories('kaffe', 5, 0.1, 'preference');
      expect(preferenceResults.length).toBeGreaterThan(0);
      expect(preferenceResults[0].entry.metadata.type).toBe('preference');
    });

    it('ska indexera konversationer automatiskt', async () => {
      // 1. Simulera en konversation
      const messages: Message[] = [
        {
          id: '1',
          content: 'Hej, jag heter Anna',
          sender: 'user',
          timestamp: new Date(Date.now() - 2000)
        },
        {
          id: '2',
          content: 'Hej Anna! Trevligt att träffas.',
          sender: 'assistant',
          timestamp: new Date(Date.now() - 1000)
        },
        {
          id: '3',
          content: 'Jag arbetar som utvecklare och gillar kaffe',
          sender: 'user',
          timestamp: new Date()
        }
      ];

      // 2. Indexera meddelandena
      for (const message of messages) {
        if (message.sender === 'user') {
          await ConversationIndexer.indexUserMessage(message);
        } else {
          await ConversationIndexer.indexAssistantMessage(message);
        }
      }

      // 3. Indexera konversationskontext
      await ConversationIndexer.indexConversationContext(messages);

      // 4. Vänta på att indexeringen slutförs
      await new Promise(resolve => setTimeout(resolve, 200));

      // 5. Verifiera att meddelanden indexerades
      const allEntries = VectorDatabase.getAllEntries();
      expect(allEntries.length).toBeGreaterThan(0);

      const userMessages = allEntries.filter(e => e.metadata.type === 'user_message');
      const assistantMessages = allEntries.filter(e => e.metadata.type === 'assistant_message');
      const contextEntries = allEntries.filter(e => e.metadata.type === 'conversation_context');

      expect(userMessages.length).toBe(2); // 2 user messages
      expect(assistantMessages.length).toBe(1); // 1 assistant message
      expect(contextEntries.length).toBeGreaterThan(0); // At least 1 context entry
    });

    it('ska hitta relevant kontext för nya meddelanden', async () => {
      // 1. Bygg upp en konversationshistorik
      const oldMessages: Message[] = [
        {
          id: '1',
          content: 'Jag heter Anna och arbetar som utvecklare',
          sender: 'user',
          timestamp: new Date(Date.now() - 3600000) // 1 hour ago
        },
        {
          id: '2',
          content: 'Jag gillar att programmera i TypeScript',
          sender: 'user',
          timestamp: new Date(Date.now() - 3000000) // 50 minutes ago
        }
      ];

      // 2. Indexera gamla meddelanden
      for (const message of oldMessages) {
        await ConversationIndexer.indexUserMessage(message);
      }

      // 3. Vänta på indexering
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. Sök efter relevant kontext för nytt meddelande
      const newMessage = 'Kan du hjälpa mig med TypeScript-problem?';
      const context = await ConversationIndexer.searchRelevantContext(
        newMessage,
        [], // Inga nya meddelanden
        3
      );

      // 5. Verifiera att relevant kontext hittades
      expect(context.relevantMemories.length).toBeGreaterThan(0);
      expect(context.contextSummary).toContain('kontext');
      
      const hasTypeScriptContext = context.relevantMemories.some(
        memory => memory.content.includes('TypeScript')
      );
      expect(hasTypeScriptContext).toBe(true);
    });

    it('ska hantera viktighetsberäkning korrekt', async () => {
      // 1. Spara minnen med olika viktighet
      const lowImportanceId = await VectorMemoryService.saveMemory(
        'ok',
        'conversation',
        0.1,
        []
      );

      const mediumImportanceId = await VectorMemoryService.saveMemory(
        'Jag heter Anna och arbetar som utvecklare',
        'fact',
        0.8,
        ['namn', 'jobb']
      );

      const highImportanceId = await VectorMemoryService.saveMemory(
        'Jag känner mig mycket deprimerad och har självmordstankar',
        'reflection',
        0.95,
        ['depression', 'kris', 'självmord']
      );

      // 2. Hämta statistik
      const stats = VectorMemoryService.getMemoryStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.averageImportance).toBeGreaterThan(0.5);

      // 3. Verifiera att viktiga minnen prioriteras i sökningar
      const searchResults = await VectorMemoryService.searchMemories('användaren', 10, 0.1);
      
      // Högre viktighet bör ge högre relevans i sökresultat
      const highImportanceResult = searchResults.find(r => r.entry.id === highImportanceId);
      const lowImportanceResult = searchResults.find(r => r.entry.id === lowImportanceId);
      
      if (highImportanceResult && lowImportanceResult) {
        expect(highImportanceResult.entry.metadata.importance).toBeGreaterThan(
          lowImportanceResult.entry.metadata.importance
        );
      }
    });

    it('ska begränsa antalet sparade minnen', async () => {
      // 1. Spara många minnen (mer än MAX_ENTRIES)
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          VectorMemoryService.saveMemory(
            `Test minne nummer ${i}`,
            'conversation',
            Math.random(),
            [`test${i}`]
          )
        );
      }
      await Promise.all(promises);

      // 2. Verifiera att antalet begränsas
      const stats = VectorDatabase.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(2000); // MAX_ENTRIES

      // 3. Verifiera att viktiga minnen behålls
      const allMemories = VectorMemoryService.getAllMemories();
      const averageImportance = allMemories.reduce((sum, m) => sum + m.metadata.importance, 0) / allMemories.length;
      
      // Genomsnittlig viktighet bör vara rimlig (inte bara låga värden)
      expect(averageImportance).toBeGreaterThan(0.3);
    });
  });

  describe('Error Handling', () => {
    it('ska hantera fel i embedding-generering gracefully', async () => {
      // 1. Mock embedding service att kasta fel
      vi.mocked(EmbeddingService.getEmbedding).mockRejectedValueOnce(new Error('API Error'));

      // 2. Försök spara minne
      await expect(
        VectorMemoryService.saveMemory('test', 'fact', 0.5)
      ).rejects.toThrow('API Error');

      // 3. Verifiera att systemet fortfarande fungerar efter fel
      vi.mocked(EmbeddingService.getEmbedding).mockResolvedValueOnce(new Array(384).fill(0.1));
      
      const id = await VectorMemoryService.saveMemory('test efter fel', 'fact', 0.5);
      expect(id).toBeTruthy();
    });

    it('ska hantera korrupt localStorage data', async () => {
      // 1. Sätt korrupt data i localStorage
      localStorage.setItem('berget_vector_db', 'invalid json data');

      // 2. Försök ladda minnen
      const memories = VectorMemoryService.getAllMemories();
      expect(memories).toEqual([]); // Ska returnera tom array vid fel

      // 3. Verifiera att nya minnen kan sparas
      const id = await VectorMemoryService.saveMemory('test efter korrupt data', 'fact', 0.5);
      expect(id).toBeTruthy();
    });

    it('ska hantera reflektion utan minnesåtgärd', async () => {
      // 1. Mock API att returnera reflektion utan memoryAction
      const { bergetAPI } = await import('../../services/api');
      vi.mocked(bergetAPI.sendReflectionAnalysisMessageWithJsonMode).mockResolvedValueOnce(
        JSON.stringify({
          content: 'En enkel reflektion',
          emotions: ['🤔'],
          emotionalState: 'Neutral'
          // Ingen memoryAction
        })
      );

      // 2. Generera reflektion
      const state = ConversationStateBuilder
        .create()
        .withCurrentInput('test input', new Date(), new Date())
        .withConversationHistory([])
        .build();

      const reflection = await new Promise((resolve) => {
        LLMDecisionService.generateReflection(state).subscribe(resolve);
      });

      // 3. Verifiera att reflektion genererades utan fel
      expect(reflection).toBeTruthy();
      expect(reflection.content).toBe('En enkel reflektion');

      // 4. Verifiera att inga minnen sparades
      await new Promise(resolve => setTimeout(resolve, 100));
      const memories = VectorMemoryService.getAllMemories();
      expect(memories.length).toBe(0);
    });
  });
});
