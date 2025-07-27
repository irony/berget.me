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
      
      // Skapa mycket mer deterministiska embeddings som garanterat ger hög similarity
      const embedding = new Array(384).fill(0);
      
      // Använd enkel hash för konsistens
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) & 0xffffffff;
      }
      
      // Skapa embeddings som är mycket lika för liknande ord
      for (let i = 0; i < 384; i++) {
        let baseValue = 0.5; // Neutral bas
        
        // Lägg till starka, konsekventa signaler för specifika ord
        if (text.toLowerCase().includes('kaffe')) {
          baseValue += Math.sin(i * 0.1) * 0.8 + 0.3; // Mycket stark signal
        }
        if (text.toLowerCase().includes('användaren')) {
          baseValue += Math.cos(i * 0.1) * 0.8 + 0.3; // Mycket stark signal
        }
        if (text.toLowerCase().includes('gillar')) {
          baseValue += Math.sin(i * 0.15) * 0.7 + 0.2;
        }
        
        // Lägg till hash-baserad variation för att göra embeddings unika men relaterade
        baseValue += Math.sin(i + hash * 0.0001) * 0.1;
        
        // Normalisera till [-1, 1]
        embedding[i] = Math.max(-1, Math.min(1, baseValue));
      }
      
      console.log('🧪 DEBUG: Created embedding with hash:', hash, 'sample:', embedding.slice(0, 5));
      
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
      console.log('🧪 TEST: Entry content:', allEntries[0]?.content);
      console.log('🧪 TEST: Entry embedding length:', allEntries[0]?.embedding?.length);
      
      // Vänta längre för att säkerställa att indexering är klar
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Först testa med exakt samma text för att garantera match
      console.log('🧪 TEST: Searching with exact same text...');
      const exactResults = await VectorDatabase.searchSimilar('Användaren gillar kaffe', 5, 0.0);
      console.log('🧪 TEST: Exact text search results:', exactResults.length);
      
      if (exactResults.length > 0) {
        console.log('🧪 TEST: Exact match similarity:', exactResults[0].similarity);
        console.log('🧪 TEST: Exact match content:', exactResults[0].entry.content);
      }
      
      // Sedan testa med delord
      console.log('🧪 TEST: Searching with partial word...');
      const partialResults = await VectorDatabase.searchSimilar('kaffe', 5, 0.0);
      console.log('🧪 TEST: Partial word search results:', partialResults.length);
      
      if (partialResults.length > 0) {
        console.log('🧪 TEST: Partial match similarity:', partialResults[0].similarity);
        console.log('🧪 TEST: Partial match content:', partialResults[0].entry.content);
      }
      
      // Debug: kontrollera index vectors status
      const stats = VectorDatabase.getStats();
      console.log('🧪 TEST: Database stats:', stats);
      
      expect(allEntries.length).toBe(1);
      
      // Vi bör hitta resultat med antingen exakt text eller delord
      const hasResults = exactResults.length > 0 || partialResults.length > 0;
      if (!hasResults) {
        console.error('🧪 TEST: No results found with any search method');
        console.error('🧪 TEST: Entry embedding sample:', allEntries[0]?.embedding?.slice(0, 10));
        
        // Testa att skapa en ny embedding för samma text och jämför
        const testEmbedding = await import('../../services/embeddingService').then(m => 
          m.EmbeddingService.getEmbedding('kaffe')
        );
        console.error('🧪 TEST: Test embedding sample:', testEmbedding.slice(0, 10));
      }
      
      expect(hasResults).toBe(true);
    });
  });
});
