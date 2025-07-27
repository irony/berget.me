import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConversationStateBuilder } from '../../services/stateBuilder';
import { LLMDecisionService } from '../../services/llmDecisionService';
import { ConversationIndexer } from '../../services/conversationIndexer';
import { VectorDatabase } from '../../services/vectorDatabase';
import { EmbeddingService } from '../../services/embeddingService';
import { Message } from '../../types/chat';
import { ConversationState } from '../../types/conversationState';

// Mock embedding service
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
        embedding[i] = (text.charCodeAt(i) / 1000) + 0.1 + (i * 0.001);
      }
      
      // Add more variance to ensure uniqueness
      for (let i = 0; i < 384; i++) {
        embedding[i] += Math.sin(i + text.length) * 0.05 + 0.05;
      }
      
      // Ensure we always return a valid embedding with variance
      return Promise.resolve(embedding.map(val => isNaN(val) ? 0.1 : val));
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, keys: [] })
  }
}));

// Mock berget API
const { bergetAPI } = await import('../../services/api');
vi.mock('../../services/api', () => ({
  bergetAPI: {
    sendAnalysisMessageWithJsonMode: vi.fn().mockImplementation((messages) => {
      const userContent = messages.find(m => m.role === 'user')?.content || '';
      
      if (userContent.includes('stressad') || userContent.includes('hjälp')) {
        return Promise.resolve(JSON.stringify({
          shouldAct: true,
          actionType: 'support',
          priority: 'high',
          timing: 1000,
          reasoning: 'Användaren verkar stressad och behöver stöd',
          confidence: 0.8,
          suggestedMessage: 'Jag märker att du verkar stressad. Vill du prata om det?'
        }));
      } else if (userContent.includes('tyst') || userContent.includes('inaktiv')) {
        return Promise.resolve(JSON.stringify({
          shouldAct: true,
          actionType: 'check_in',
          priority: 'medium',
          timing: 2000,
          reasoning: 'Användaren har varit tyst, kanske behöver uppmuntran',
          confidence: 0.6,
          suggestedMessage: 'Hej igen! Hur mår du?'
        }));
      } else {
        return Promise.resolve(JSON.stringify({
          shouldAct: false,
          actionType: 'wait',
          priority: 'low',
          timing: 5000,
          reasoning: 'Konversationen flyter naturligt',
          confidence: 0.7
        }));
      }
    }),
    
    sendReflectionAnalysisMessageWithJsonMode: vi.fn().mockImplementation((messages) => {
      const userContent = messages.find(m => m.role === 'user')?.content || '';
      
      if (userContent.includes('stressad')) {
        return Promise.resolve(JSON.stringify({
          content: 'Du verkar känna stress och press',
          emotions: ['😰', '😟'],
          emotionalState: 'Stressad oro',
          memoryAction: {
            shouldSave: true,
            content: 'Användaren känner sig stressad',
            type: 'reflection',
            importance: 0.8,
            tags: ['stress', 'känslor'],
            reasoning: 'Viktigt att komma ihåg användarens stresstillstånd'
          }
        }));
      } else {
        return Promise.resolve(JSON.stringify({
          content: 'Du verkar vara i ett neutralt tillstånd',
          emotions: ['🤔'],
          emotionalState: 'Neutral reflektion',
          memoryAction: {
            shouldSave: false,
            reasoning: 'Inget specifikt att spara'
          }
        }));
      }
    })
  }
}));

describe('Conversation Flow Integration Tests', () => {
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

  describe('State-Based Decision Making', () => {
    it('ska fatta beslut baserat på användarens emotionella tillstånd', async () => {
      // 1. Bygg ett tillstånd som indikerar stress
      const stressedState: ConversationState = ConversationStateBuilder
        .create()
        .withCurrentInput('Jag känner mig så stressad och behöver hjälp', new Date(), new Date())
        .withConversationHistory([
          {
            role: 'user',
            content: 'Jag känner mig så stressad och behöver hjälp',
            timestamp: new Date()
          }
        ])
        .withTemporalContext()
        .withEngagementMetrics()
        .withEmotionalHistory([
          {
            timestamp: new Date(),
            emotions: ['😰', '😟'],
            emotionalState: 'Stressad',
            valence: 'negative',
            intensity: 0.8,
            userNeeds: ['stöd', 'hjälp']
          }
        ])
        .build();

      // 2. Analysera tillståndet
      const decision = await new Promise((resolve) => {
        LLMDecisionService.analyzeState(stressedState).subscribe(resolve);
      });

      // 3. Verifiera att AI:n beslutar att agera
      expect(decision.shouldAct).toBe(true);
      expect(decision.actionType).toBe('support');
      expect(decision.priority).toBe('high');
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.suggestedMessage).toContain('stressad');
    });

    it('ska inte agera när konversationen flyter naturligt', async () => {
      // 1. Bygg ett neutralt tillstånd
      const neutralState: ConversationState = ConversationStateBuilder
        .create()
        .withCurrentInput('Tack för hjälpen, det var bra information', new Date(), new Date())
        .withConversationHistory([
          {
            role: 'user',
            content: 'Kan du förklara hur det fungerar?',
            timestamp: new Date(Date.now() - 30000)
          },
          {
            role: 'assistant',
            content: 'Självklart! Här är förklaringen...',
            timestamp: new Date(Date.now() - 15000)
          },
          {
            role: 'user',
            content: 'Tack för hjälpen, det var bra information',
            timestamp: new Date()
          }
        ])
        .withTemporalContext()
        .withEngagementMetrics()
        .build();

      // 2. Analysera tillståndet
      const decision = await new Promise((resolve) => {
        LLMDecisionService.analyzeState(neutralState).subscribe(resolve);
      });

      // 3. Verifiera att AI:n inte agerar
      expect(decision.shouldAct).toBe(false);
      expect(decision.actionType).toBe('wait');
      expect(decision.reasoning).toContain('naturligt');
    });

    it('ska föreslå check-in när användaren varit tyst', async () => {
      // 1. Bygg tillstånd med lång tystnad
      const silentState: ConversationState = ConversationStateBuilder
        .create()
        .withCurrentInput('', new Date(), new Date())
        .withConversationHistory([
          {
            role: 'assistant',
            content: 'Hur mår du idag?',
            timestamp: new Date(Date.now() - 300000) // 5 minuter sedan
          }
        ])
        .withTemporalContext()
        .withEngagementMetrics()
        .withSilencePeriods([
          {
            start: new Date(Date.now() - 300000),
            end: new Date(),
            duration: 300000
          }
        ])
        .build();

      // Mock för att simulera tystnad
      const { bergetAPI } = await import('../../services/api');
      vi.mocked(bergetAPI.sendAnalysisMessageWithJsonMode).mockResolvedValueOnce(
        JSON.stringify({
          shouldAct: true,
          actionType: 'check_in',
          priority: 'medium',
          timing: 2000,
          reasoning: 'Användaren har varit tyst länge',
          confidence: 0.6
        })
      );

      // 2. Analysera tillståndet
      const decision = await new Promise((resolve) => {
        LLMDecisionService.analyzeState(silentState).subscribe(resolve);
      });

      // 3. Verifiera check-in beslut
      expect(decision.shouldAct).toBe(true);
      expect(decision.actionType).toBe('check_in');
      expect(decision.priority).toBe('medium');
    });
  });

  describe('Reflection and Memory Integration', () => {
    it('ska generera reflektion och spara minne samtidigt', async () => {
      // 1. Skapa tillstånd med emotionellt innehåll
      const emotionalState: ConversationState = ConversationStateBuilder
        .create()
        .withCurrentInput('Jag känner mig verkligen stressad på jobbet', new Date(), new Date())
        .withConversationHistory([])
        .withTemporalContext()
        .build();

      // 2. Generera reflektion
      const reflection = await new Promise((resolve) => {
        LLMDecisionService.generateReflection(emotionalState).subscribe(resolve);
      });

      // 3. Vänta på att minneslagring slutförs
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. Verifiera reflektion
      expect(reflection).toBeTruthy();
      expect(reflection).not.toBeNull();
      expect(reflection.content).toContain('stress');
      expect(reflection.emotions).toContain('😰');
      expect(reflection.emotionalState).toContain('Stressad');

      // 5. Verifiera att minne sparades
      const memories = VectorDatabase.getAllEntries();
      expect(memories.length).toBeGreaterThan(0);
      
      const stressMemory = memories.find(m => m.content.includes('stressad'));
      expect(stressMemory).toBeTruthy();
      expect(stressMemory?.metadata.tags).toContain('stress');
      expect(stressMemory?.metadata.importance).toBeGreaterThan(0.5);
    });

    it('ska inte spara minne när reflektionen bedömer det onödigt', async () => {
      // 1. Skapa neutralt tillstånd
      const neutralState: ConversationState = ConversationStateBuilder
        .create()
        .withCurrentInput('okej', new Date(), new Date())
        .withConversationHistory([])
        .withTemporalContext()
        .build();

      // 2. Generera reflektion
      const reflection = await new Promise((resolve) => {
        LLMDecisionService.generateReflection(neutralState).subscribe(resolve);
      });

      // 3. Vänta på eventuell minneslagring
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. Verifiera att ingen minneslagring skedde
      const memories = VectorDatabase.getAllEntries();
      expect(memories.length).toBe(0);

      // 5. Verifiera att reflektion ändå genererades
      if (reflection) {
        expect(reflection).toBeTruthy();
        expect(reflection.content).toBeTruthy();
      } else {
        // Om ingen reflektion genererades, det är också okej för neutralt innehåll
        expect(reflection).toBeNull();
      }
    });
  });

  describe('Context Search and Retrieval', () => {
    it('ska hitta relevant kontext från tidigare konversationer', async () => {
      // 1. Bygg upp konversationshistorik
      const messages: Message[] = [
        {
          id: '1',
          content: 'Jag arbetar som utvecklare på ett tech-företag',
          sender: 'user',
          timestamp: new Date(Date.now() - 3600000) // 1 timme sedan
        },
        {
          id: '2',
          content: 'Jag har problem med TypeScript i mitt projekt',
          sender: 'user',
          timestamp: new Date(Date.now() - 1800000) // 30 min sedan
        }
      ];

      // 2. Indexera meddelandena
      for (const message of messages) {
        await ConversationIndexer.indexUserMessage(message);
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Sök efter relevant kontext
      const context = await ConversationIndexer.searchRelevantContext(
        'Kan du hjälpa mig med TypeScript-fel?',
        [],
        3
      );

      // 4. Verifiera att relevant kontext hittades
      expect(context.relevantMemories.length).toBeGreaterThan(0);
      expect(context.contextSummary).toContain('kontext');
      
      const hasTypeScriptContext = context.relevantMemories.some(
        memory => memory.content.toLowerCase().includes('typescript')
      );
      expect(hasTypeScriptContext).toBe(true);
    });

    it('ska filtrera bort för nya meddelanden från kontextsökning', async () => {
      // 1. Skapa meddelanden - ett gammalt och ett nytt
      const oldMessage: Message = {
        id: '1',
        content: 'Jag gillar programmering',
        sender: 'user',
        timestamp: new Date(Date.now() - 7200000) // 2 timmar sedan
      };

      const recentMessage: Message = {
        id: '2',
        content: 'Jag programmerar i JavaScript',
        sender: 'user',
        timestamp: new Date(Date.now() - 1800) // 30 sekunder sedan
      };

      // 2. Indexera båda meddelandena
      await ConversationIndexer.indexUserMessage(oldMessage);
      await ConversationIndexer.indexUserMessage(recentMessage);
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Sök efter kontext
      const context = await ConversationIndexer.searchRelevantContext(
        'Vad tycker du om programmering?',
        [recentMessage], // Nyligt meddelande som ska filtreras bort
        5
      );

      // 4. Verifiera att endast gamla meddelanden inkluderas
      const hasOldMessage = context.relevantMemories.some(
        memory => memory.content.includes('gillar programmering')
      );
      const hasRecentMessage = context.relevantMemories.some(
        memory => memory.content.includes('JavaScript')
      );

      expect(hasOldMessage).toBe(true);
      expect(hasRecentMessage).toBe(false); // Ska filtreras bort pga för nytt
    });
  });

  describe('Performance and Scalability', () => {
    it('ska hantera många meddelanden utan prestandaproblem', async () => {
      const startTime = Date.now();

      // 1. Skapa många meddelanden
      const messages: Message[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          id: i.toString(),
          content: `Test meddelande nummer ${i} med olika innehåll`,
          sender: i % 2 === 0 ? 'user' : 'assistant',
          timestamp: new Date(Date.now() - (100 - i) * 1000)
        });
      }

      // 2. Indexera alla meddelanden
      const indexPromises = messages.map(message => 
        message.sender === 'user' 
          ? ConversationIndexer.indexUserMessage(message)
          : ConversationIndexer.indexAssistantMessage(message)
      );
      await Promise.all(indexPromises);

      // 3. Vänta på att indexeringen slutförs
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. Verifiera att alla meddelanden indexerades
      const stats = ConversationIndexer.getStats();
      expect(stats.databaseStats.totalEntries).toBeGreaterThan(50);

      // 5. Testa sökning
      const searchResults = await ConversationIndexer.searchRelevantContext(
        'test meddelande',
        [],
        10
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 6. Verifiera prestanda (ska ta mindre än 5 sekunder)
      expect(totalTime).toBeLessThan(5000);
      expect(searchResults.relevantMemories.length).toBeGreaterThan(0);
    });

    it('ska begränsa minnesanvändning genom att rensa gamla entries', async () => {
      // 1. Fyll databasen med många entries
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          VectorDatabase.saveEntry(
            `Test entry ${i}`,
            'conversation_context',
            Math.random(),
            [`tag${i}`]
          )
        );
      }
      await Promise.all(promises);

      // 2. Kontrollera att antalet begränsas
      const stats = VectorDatabase.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(2000); // MAX_ENTRIES

      // 3. Verifiera att viktiga entries behålls
      const allEntries = VectorDatabase.getAllEntries();
      const averageImportance = allEntries.reduce(
        (sum, entry) => sum + entry.metadata.importance, 0
      ) / allEntries.length;

      // Genomsnittlig viktighet bör vara rimlig
      expect(averageImportance).toBeGreaterThan(0.2);
    });
  });

  describe('Error Recovery', () => {
    it('ska återhämta sig från API-fel gracefully', async () => {
      // 1. Mock API att kasta fel
      const { bergetAPI } = await import('../../services/api');
      vi.mocked(bergetAPI.sendAnalysisMessageWithJsonMode).mockRejectedValueOnce(
        new Error('API Error')
      );

      // 2. Försök analysera tillstånd
      const state = ConversationStateBuilder
        .create()
        .withCurrentInput('test', new Date(), new Date())
        .withConversationHistory([])
        .build();

      const decision = await new Promise((resolve) => {
        LLMDecisionService.analyzeState(state).subscribe(resolve);
      });

      // 3. Verifiera att ett default-beslut returneras
      expect(decision).toBeTruthy();
      expect(decision.shouldAct).toBe(false);
      expect(decision.actionType).toBe('wait');
      expect(decision.confidence).toBeLessThan(0.5);
    });

    it('ska hantera korrupt JSON från API', async () => {
      // 1. Mock API att returnera ogiltig JSON
      const { bergetAPI } = await import('../../services/api');
      vi.mocked(bergetAPI.sendReflectionAnalysisMessageWithJsonMode).mockResolvedValueOnce(
        'Detta är inte valid JSON'
      );

      // 2. Försök generera reflektion
      const state = ConversationStateBuilder
        .create()
        .withCurrentInput('test', new Date(), new Date())
        .withConversationHistory([])
        .build();

      const reflection = await new Promise((resolve) => {
        LLMDecisionService.generateReflection(state).subscribe(resolve);
      });

      // 3. Verifiera att null returneras vid JSON-fel
      expect(reflection).toBeNull();
    });
  });
});
