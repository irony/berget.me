import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorMemoryService } from '../../services/vectorMemory';
import { VectorDatabase } from '../../services/vectorDatabase';
import { EmbeddingService } from '../../services/embeddingService';

// Mock embedding service med enklare, mer förutsägbara embeddings
vi.mock('../../services/embeddingService', () => ({
  EmbeddingService: {
    getEmbedding: vi.fn().mockImplementation((text: string) => {
      console.log('🧪 DEBUG: Creating embedding for text:', text);
      
      if (!text || typeof text !== 'string' || text.length === 0) {
        console.log('🧪 DEBUG: Empty text, returning fallback');
        return Promise.resolve(new Array(384).fill(0.1));
      }
      
      // Skapa mycket enkla embeddings som garanterat ger hög similarity för samma ord
      const embedding = new Array(384).fill(0);
      
      // Använd enkla mönster baserat på ord i texten
      const words = text.toLowerCase().split(' ');
      console.log('🧪 DEBUG: Words found:', words);
      
      words.forEach((word, wordIndex) => {
        // Ge varje ord en unik "signatur" i embedding-vektorn
        const startIndex = (wordIndex * 50) % 384;
        for (let i = 0; i < 50 && startIndex + i < 384; i++) {
          if (word === 'kaffe') {
            embedding[startIndex + i] = 0.9; // Stark signal för "kaffe"
          } else if (word === 'användaren') {
            embedding[startIndex + i] = 0.8; // Stark signal för "användaren"
          } else if (word === 'utvecklare') {
            embedding[startIndex + i] = 0.7; // Stark signal för "utvecklare"
          } else {
            // Svagare signal för andra ord
            embedding[startIndex + i] = 0.3 + (word.charCodeAt(0) % 10) * 0.05;
          }
        }
      });
      
      console.log('🧪 DEBUG: Created embedding with signals at positions:', 
        embedding.map((val, idx) => val > 0.5 ? idx : null).filter(x => x !== null).slice(0, 10)
      );
      
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
      
      expect(sim1_2).toBe(1.0); // Identiska embeddings
      expect(sim1_3).toBeLessThan(1.0); // Olika embeddings
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
      
      const searchResults = await VectorDatabase.searchSimilar('kaffe', 5, 0.001);
      console.log('🧪 TEST: VectorDatabase search results:', searchResults.length);
      
      if (searchResults.length > 0) {
        console.log('🧪 TEST: First search result similarity:', searchResults[0].similarity);
      }
      
      expect(allEntries.length).toBe(1);
      expect(searchResults.length).toBeGreaterThan(0);
    });
  });
});
