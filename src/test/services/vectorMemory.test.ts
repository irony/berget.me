import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorMemoryService } from '../../services/vectorMemory';
import { VectorDatabase } from '../../services/vectorDatabase';

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
        embedding[i] = (text.charCodeAt(i) / 1000) + Math.sin(i) * 0.1 + 0.01;
      }
      
      // Ensure we have a valid embedding with some variance
      const validEmbedding = embedding.map((val, i) => {
        const finalVal = val + (i * 0.001) + (text.length * 0.0001) + 0.1;
        return isNaN(finalVal) ? 0.1 : finalVal;
      });
      return Promise.resolve(validEmbedding);
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, keys: [] })
  }
}));

describe('VectorMemoryService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    VectorDatabase.clearAllEntries();
    VectorDatabase.clearIndexVectors();
    vi.clearAllMocks();
    
    // Mock localStorage properly
    const mockStorage = {};
    localStorage.getItem = vi.fn((key) => mockStorage[key] || null);
    localStorage.setItem = vi.fn((key, value) => {
      mockStorage[key] = value;
    });
    localStorage.removeItem = vi.fn((key) => {
      delete mockStorage[key];
    });
    localStorage.clear = vi.fn(() => {
      Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    });
  });

  describe('saveMemory', () => {
    it('ska spara ett minne och returnera ett ID', async () => {
      const content = 'Användaren gillar kaffe på morgonen';
      const type = 'preference';
      const importance = 0.8;
      const tags = ['kaffe', 'morgon'];

      const id = await VectorMemoryService.saveMemory(content, type, importance, tags);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('ska begränsa importance till 0-1 intervallet', async () => {
      const id1 = await VectorMemoryService.saveMemory('test', 'fact', -0.5);
      const id2 = await VectorMemoryService.saveMemory('test', 'fact', 1.5);

      const memories = VectorMemoryService.getAllMemories();
      const memory1 = memories.find(m => m.id === id1);
      const memory2 = memories.find(m => m.id === id2);

      expect(memory1?.metadata.importance).toBe(0);
      expect(memory2?.metadata.importance).toBe(1);
    });
  });

  describe('searchMemories', () => {
    beforeEach(async () => {
      // Lägg till testdata
      await VectorMemoryService.saveMemory('Användaren gillar kaffe', 'preference', 0.8, ['kaffe']);
      await VectorMemoryService.saveMemory('Användaren arbetar som utvecklare', 'fact', 0.9, ['jobb']);
      await VectorMemoryService.saveMemory('Användaren mår dåligt idag', 'conversation', 0.6, ['känslor']);
    });

    it('ska hitta relevanta minnen baserat på sökfråga', async () => {
      const results = await VectorMemoryService.searchMemories('kaffe', 5, 0.1);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.content).toContain('kaffe');
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    it('ska filtrera efter typ', async () => {
      const results = await VectorMemoryService.searchMemories('användaren', 5, 0.1, 'preference');

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.entry.metadata.type).toBe('preference');
      });
    });

    it('ska respektera minSimilarity-tröskeln', async () => {
      const results = await VectorMemoryService.searchMemories('helt irrelevant sökterm som inte matchar något', 5, 0.99);

      expect(results.length).toBe(0);
    });
  });

  describe('getMemoryStats', () => {
    it('ska returnera korrekt statistik för tomma minnen', () => {
      const stats = VectorMemoryService.getMemoryStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
      expect(stats.averageImportance).toBe(0);
    });

    it('ska beräkna korrekt statistik med minnen', async () => {
      await VectorMemoryService.saveMemory('test1', 'fact', 0.5);
      await VectorMemoryService.saveMemory('test2', 'preference', 0.8);
      await VectorMemoryService.saveMemory('test3', 'fact', 0.6);

      const stats = VectorMemoryService.getMemoryStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.byType.memory).toBe(3); // All converted to 'memory' type
      expect(stats.averageImportance).toBeCloseTo(0.63, 1);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
    });
  });

  describe('deleteMemory', () => {
    it('ska ta bort ett minne och returnera true', async () => {
      const id = await VectorMemoryService.saveMemory('test', 'fact', 0.5);

      const result = VectorMemoryService.deleteMemory(id);

      expect(result).toBe(true);
      expect(VectorMemoryService.getMemoryById(id)).toBeNull();
    });

    it('ska returnera false för icke-existerande ID', () => {
      const result = VectorMemoryService.deleteMemory('nonexistent-id');

      expect(result).toBe(false);
    });
  });
});
