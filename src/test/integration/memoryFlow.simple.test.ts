import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorMemoryService } from '../../services/vectorMemory';
import { VectorDatabase } from '../../services/vectorDatabase';

// Enkel, pålitlig mock för EmbeddingService
vi.mock('../../services/embeddingService', () => ({
  EmbeddingService: {
    getEmbedding: vi.fn().mockImplementation((text: string) => {
      // Skapa en helt enkel, deterministisk embedding som ALLTID fungerar
      const safeText = text || 'fallback';
      const embedding = new Array(384);
      
      // Använd enkel hash för konsistens
      let hash = 0;
      for (let i = 0; i < safeText.length; i++) {
        hash = (hash + safeText.charCodeAt(i)) % 1000;
      }
      
      // Fyll embedding med säkra värden
      for (let i = 0; i < 384; i++) {
        embedding[i] = 0.1 + (hash / 10000) + (i / 10000);
      }
      
      return Promise.resolve(embedding);
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, keys: [] })
  }
}));

describe('Simple Memory Flow Tests', () => {
  beforeEach(() => {
    // Rensa allt före varje test
    localStorage.clear();
    VectorDatabase.clearAllEntries();
    VectorDatabase.clearIndexVectors();
    vi.clearAllMocks();
    
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

  describe('Basic Memory Operations', () => {
    it('ska spara ett minne', async () => {
      const id = await VectorMemoryService.saveMemory(
        'Användaren heter Anna',
        'fact',
        0.8,
        ['namn']
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      
      const memories = VectorMemoryService.getAllMemories();
      expect(memories.length).toBe(1);
      expect(memories[0].content).toBe('Användaren heter Anna');
      expect(memories[0].metadata.tags).toContain('namn');
    });

    it('ska söka i sparade minnen', async () => {
      // Spara några minnen
      await VectorMemoryService.saveMemory('Anna gillar kaffe', 'preference', 0.7, ['kaffe']);
      await VectorMemoryService.saveMemory('Anna arbetar som utvecklare', 'fact', 0.8, ['jobb']);
      
      // Sök efter namn
      const results = await VectorMemoryService.searchMemories('Anna', 5, 0.1);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.entry.content.includes('Anna'))).toBe(true);
    });

    it('ska hantera minnesstatistik', async () => {
      // Spara några minnen
      await VectorMemoryService.saveMemory('Test 1', 'fact', 0.5);
      await VectorMemoryService.saveMemory('Test 2', 'preference', 0.8);
      
      const stats = VectorMemoryService.getMemoryStats();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.averageImportance).toBeCloseTo(0.65, 1);
    });

    it('ska ta bort minnen', async () => {
      const id = await VectorMemoryService.saveMemory('Test minne', 'fact', 0.5);
      
      expect(VectorMemoryService.getAllMemories().length).toBe(1);
      
      const deleted = VectorMemoryService.deleteMemory(id);
      expect(deleted).toBe(true);
      expect(VectorMemoryService.getAllMemories().length).toBe(0);
    });
  });

  describe('VectorDatabase Direct Tests', () => {
    it('ska spara och hämta entries', async () => {
      const id = await VectorDatabase.saveEntry(
        'Test content',
        'memory',
        0.7,
        ['test']
      );

      expect(id).toBeDefined();
      
      const entry = VectorDatabase.getEntryById(id);
      expect(entry).toBeTruthy();
      expect(entry?.content).toBe('Test content');
      expect(entry?.metadata.type).toBe('memory');
    });

    it('ska söka med similarity', async () => {
      // Spara några entries
      await VectorDatabase.saveEntry('Kaffe är gott', 'memory', 0.8, ['kaffe']);
      await VectorDatabase.saveEntry('Te är också bra', 'memory', 0.6, ['te']);
      
      // Sök efter kaffe
      const results = await VectorDatabase.searchSimilar('kaffe', 5, 0.1);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.content).toContain('Kaffe');
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    it('ska hantera databas-statistik', async () => {
      await VectorDatabase.saveEntry('Test 1', 'memory', 0.5);
      await VectorDatabase.saveEntry('Test 2', 'user_message', 0.8);
      
      const stats = VectorDatabase.getStats();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.byType.memory).toBe(1);
      expect(stats.byType.user_message).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('ska hantera ogiltiga inputs gracefully', async () => {
      // Testa med tom sträng
      const id1 = await VectorMemoryService.saveMemory('', 'fact', 0.5);
      expect(id1).toBeDefined();
      
      // Testa med mycket låg importance
      const id2 = await VectorMemoryService.saveMemory('Test', 'fact', -1);
      const memory = VectorMemoryService.getMemoryById(id2);
      expect(memory?.metadata.importance).toBe(0); // Ska begränsas till 0
      
      // Testa med mycket hög importance
      const id3 = await VectorMemoryService.saveMemory('Test', 'fact', 2);
      const memory2 = VectorMemoryService.getMemoryById(id3);
      expect(memory2?.metadata.importance).toBe(1); // Ska begränsas till 1
    });

    it('ska hantera sökningar utan resultat', async () => {
      const results = await VectorMemoryService.searchMemories('nonexistent', 5, 0.9);
      expect(results).toEqual([]);
    });

    it('ska hantera borttagning av icke-existerande minnen', () => {
      const result = VectorMemoryService.deleteMemory('nonexistent-id');
      expect(result).toBe(false);
    });
  });
});
