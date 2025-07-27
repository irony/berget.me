import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorMemoryService } from '../../services/vectorMemory';
import { VectorDatabase } from '../../services/vectorDatabase';
import { EmbeddingService } from '../../services/embeddingService';

// Mock embedding service med mer realistiska embeddings
vi.mock('../../services/embeddingService', () => ({
  EmbeddingService: {
    getEmbedding: vi.fn().mockImplementation((text: string) => {
      console.log('🧪 DEBUG: Creating embedding for text:', text);
      
      if (!text || typeof text !== 'string' || text.length === 0) {
        console.log('🧪 DEBUG: Empty text, returning fallback');
        return Promise.resolve(new Array(384).fill(0.1));
      }
      
      // Skapa deterministiska men unika embeddings
      const embedding = new Array(384).fill(0);
      
      // Använd text-hash för att skapa unik bas
      const textHash = text.split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) & 0xffffffff;
      }, 0);
      
      // Fyll embedding med värden baserat på text
      for (let i = 0; i < 384; i++) {
        const charIndex = i % text.length;
        const charCode = text.charCodeAt(charIndex);
        
        // Bas-värde från tecken
        let value = (charCode / 1000) + 0.1;
        
        // Lägg till text-specifika mönster
        value += Math.sin(i * 0.01 + textHash * 0.001) * 0.2;
        value += Math.cos(i * 0.02 + text.length * 0.01) * 0.1;
        
        // Lägg till ord-specifika signaler (men svagare än tidigare)
        if (text.toLowerCase().includes('kaffe')) {
          value += Math.sin(i * 0.05) * 0.3;
        }
        if (text.toLowerCase().includes('te')) {
          value += Math.cos(i * 0.07) * 0.3;
        }
        if (text.toLowerCase().includes('användaren')) {
          value += Math.sin(i * 0.03) * 0.2;
        }
        
        embedding[i] = Math.max(-1, Math.min(1, value));
      }
      
      console.log('🧪 DEBUG: Created embedding with hash:', textHash, 'sample:', embedding.slice(0, 5));
      
      return Promise.resolve(embedding);
    }),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, keys: [] })
  }
}));

describe('VectorMemory Debug Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    VectorDatabase.clearAllEntries();
    VectorDatabase.clearIndexVectors();
    vi.clearAllMocks();
    
    // Mock localStorage
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

  describe('Basic Embedding Tests', () => {
    it('ska skapa embeddings korrekt', async () => {
      console.log('🧪 TEST: Testing basic embedding creation');
      
      const embedding1 = await EmbeddingService.getEmbedding('kaffe');
      const embedding2 = await EmbeddingService.getEmbedding('kaffe');
      const embedding3 = await EmbeddingService.getEmbedding('te');
      
      console.log('🧪 TEST: Embedding1 sample:', embedding1.slice(0, 5));
      console.log('🧪 TEST: Embedding2 sample:', embedding2.slice(0, 5));
      console.log('🧪 TEST: Embedding3 sample:', embedding3.slice(0, 5));
      
      expect(embedding1).toHaveLength(384);
      expect(embedding2).toHaveLength(384);
      expect(embedding3).toHaveLength(384);
      
      // Samma text ska ge samma embedding
      expect(embedding1).toEqual(embedding2);
      
      // Olika text ska ge olika embeddings
      expect(embedding1).not.toEqual(embedding3);
    });

    it('ska spara och ladda minnen korrekt', async () => {
      console.log('🧪 TEST: Testing save and load');
      
      const id = await VectorMemoryService.saveMemory('Användaren gillar kaffe', 'preference', 0.8, ['kaffe']);
      console.log('🧪 TEST: Saved memory with ID:', id);
      
      const allMemories = VectorMemoryService.getAllMemories();
      console.log('🧪 TEST: All memories count:', allMemories.length);
      console.log('🧪 TEST: Memory content:', allMemories[0]?.content);
      
      expect(allMemories).toHaveLength(1);
      expect(allMemories[0].content).toBe('Användaren gillar kaffe');
      expect(allMemories[0].metadata.type).toBe('memory'); // Converted from 'preference'
    });

    it('ska söka med mycket låg threshold', async () => {
      console.log('🧪 TEST: Testing search with very low threshold');
      
      // Spara ett minne
      await VectorMemoryService.saveMemory('Användaren gillar kaffe', 'preference', 0.8, ['kaffe']);
      
      // Vänta lite
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verifiera att det sparades
      const allMemories = VectorMemoryService.getAllMemories();
      console.log('🧪 TEST: Memories after save:', allMemories.length);
      
      // Sök med exakt samma text och mycket låg threshold
      const results = await VectorMemoryService.searchMemories('Användaren gillar kaffe', 5, 0.001);
      
      console.log('🧪 TEST: Search results count:', results.length);
      if (results.length > 0) {
        console.log('🧪 TEST: First result similarity:', results[0].similarity);
        console.log('🧪 TEST: First result content:', results[0].entry.content);
      }
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('ska testa similarity-beräkning direkt', async () => {
      console.log('🧪 TEST: Testing similarity calculation directly');
      
      const embedding1 = await EmbeddingService.getEmbedding('kaffe');
      const embedding2 = await EmbeddingService.getEmbedding('kaffe');
      const embedding3 = await EmbeddingService.getEmbedding('te');
      
      // Manuell cosine similarity beräkning
      const cosineSimilarity = (a: number[], b: number[]): number => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
          dotProduct += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        return magnitude > 0 ? dotProduct / magnitude : 0;
      };
      
      const sim1_2 = cosineSimilarity(embedding1, embedding2);
      const sim1_3 = cosineSimilarity(embedding1, embedding3);
      
      console.log('🧪 TEST: Similarity kaffe-kaffe:', sim1_2);
      console.log('🧪 TEST: Similarity kaffe-te:', sim1_3);
      console.log('🧪 TEST: Embedding1 sample:', embedding1.slice(0, 5));
      console.log('🧪 TEST: Embedding3 sample:', embedding3.slice(0, 5));
      
      expect(sim1_2).toBeCloseTo(1.0, 10); // Identiska embeddings (floating point precision)
      expect(sim1_3).toBeLessThan(0.99); // Olika embeddings (mer realistisk threshold)
      expect(sim1_3).toBeGreaterThan(0); // Men fortfarande positiv similarity
    });
  });

  describe('VectorDatabase Direct Tests', () => {
    it('ska testa VectorDatabase direkt', async () => {
      console.log('🧪 TEST: Testing VectorDatabase directly');
      
      const id = await VectorDatabase.saveEntry('Användaren gillar kaffe', 'memory', 0.8, ['kaffe']);
      console.log('🧪 TEST: VectorDatabase saved entry with ID:', id);
      
      const allEntries = VectorDatabase.getAllEntries();
      console.log('🧪 TEST: VectorDatabase entries count:', allEntries.length);
      
      // Vänta lite för att säkerställa att indexering är klar
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const searchResults = await VectorDatabase.searchSimilar('kaffe', 5, 0.001);
      console.log('🧪 TEST: VectorDatabase search results:', searchResults.length);
      
      if (searchResults.length > 0) {
        console.log('🧪 TEST: First search result similarity:', searchResults[0].similarity);
      } else {
        // Debug: försök med exakt samma text
        const exactResults = await VectorDatabase.searchSimilar('Användaren gillar kaffe', 5, 0.001);
        console.log('🧪 TEST: Exact text search results:', exactResults.length);
      }
      
      expect(allEntries.length).toBe(1);
      expect(searchResults.length).toBeGreaterThan(0);
    });
  });
});
