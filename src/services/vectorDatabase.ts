import { EmbeddingService } from './embeddingService';

export interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    timestamp: Date;
    type: 'user_message' | 'assistant_message' | 'conversation_context' | 'memory';
    importance: number; // 0-1
    tags: string[];
    context?: string;
  };
  // Index fields for faster searching
  idx0: string;
  idx1: string;
  idx2: string;
  idx3: string;
  idx4: string;
}

export interface VectorSearchResult {
  entry: VectorEntry;
  similarity: number;
  distance: number;
}

export class VectorDatabase {
  private static readonly STORAGE_KEY = 'berget_vector_db';
  private static readonly MAX_ENTRIES = 2000;
  private static readonly INDEX_VECTORS_KEY = 'berget_vector_index_vectors';
  private static indexVectors: number[][] | null = null;

  // Cosine similarity calculation
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      console.warn('⚠️ Invalid vectors for similarity calculation:', { 
        aLength: a?.length, 
        bLength: b?.length,
        aIsArray: Array.isArray(a),
        bIsArray: Array.isArray(b)
      });
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      if (isNaN(a[i]) || isNaN(b[i])) {
        console.warn('⚠️ NaN values in vectors at index', i);
        continue;
      }
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    const similarity = magnitude > 0 ? dotProduct / magnitude : 0;
    
    // Ensure similarity is in valid range
    if (isNaN(similarity)) {
      console.warn('⚠️ NaN similarity calculated');
      return 0;
    }
    
    return Math.max(-1, Math.min(1, similarity));
  }

  // Euclidean distance calculation
  private static euclideanDistance(a: number[], b: number[]): number {
    if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum);
  }

  // Convert number to fixed-length string for indexing
  private static indexNrToString(nr: number): string {
    return nr.toFixed(6).padStart(10, '0');
  }

  // Initialize or load index vectors
  private static async getIndexVectors(): Promise<number[][]> {
    console.log('📊 Getting index vectors, current state:', !!this.indexVectors);
    
    if (this.indexVectors) {
      console.log('✅ Using cached index vectors:', this.indexVectors.length);
      return this.indexVectors;
    }

    try {
      const stored = localStorage.getItem(this.INDEX_VECTORS_KEY);
      if (stored) {
        this.indexVectors = JSON.parse(stored);
        console.log('📊 Index vectors laddade från localStorage:', this.indexVectors?.length);
        
        // Validate loaded vectors
        if (this.indexVectors && Array.isArray(this.indexVectors) && this.indexVectors.length > 0) {
          return this.indexVectors;
        } else {
          console.warn('⚠️ Loaded index vectors are invalid, regenerating');
          this.indexVectors = null;
        }
      }
    } catch (error) {
      console.warn('⚠️ Kunde inte ladda index vectors från localStorage:', error);
    }

    // Generate new index vectors using sample texts
    console.log('🔧 Skapar nya index vectors...');
    const sampleTexts = [
      'Hej, hur mår du idag?',
      'Jag känner mig lite stressad och behöver prata.',
      'Tack för hjälpen, det var mycket användbart.',
      'Kan du förklara hur det här fungerar?',
      'Jag är glad och nöjd med resultatet.'
    ];

    try {
      console.log('🚀 Generating embeddings for index vectors...');
      const embeddings = await Promise.all(
        sampleTexts.map(async (text, i) => {
          console.log(`📝 Generating embedding ${i + 1}/5 for: "${text.substring(0, 30)}..."`);
          const embedding = await EmbeddingService.getEmbedding(text);
          console.log(`✅ Embedding ${i + 1} generated:`, { 
            length: embedding.length, 
            sample: embedding.slice(0, 3),
            hasNaN: embedding.some(val => isNaN(val))
          });
          return embedding;
        })
      );
      
      this.indexVectors = embeddings;
      console.log('✅ All index vectors generated successfully:', this.indexVectors.length);
    } catch (error) {
      console.warn('⚠️ Kunde inte skapa index vectors, använder fallback:', error);
      // Fallback to simple mock vectors for tests
      this.indexVectors = sampleTexts.map((text, i) => {
        const embedding = new Array(384).fill(0);
        for (let j = 0; j < Math.min(text.length, 384); j++) {
          embedding[j] = (text.charCodeAt(j) / 1000) + Math.sin(j + i) * 0.1 + 0.1;
        }
        console.log(`🔧 Fallback embedding ${i + 1} created:`, { 
          length: embedding.length, 
          sample: embedding.slice(0, 3) 
        });
        return embedding;
      });
    }

    // Validate generated vectors
    if (!this.indexVectors || !Array.isArray(this.indexVectors) || this.indexVectors.length === 0) {
      console.error('❌ Failed to generate valid index vectors');
      throw new Error('Failed to generate index vectors');
    }

    // Store for future use
    try {
      localStorage.setItem(this.INDEX_VECTORS_KEY, JSON.stringify(this.indexVectors));
      console.log('💾 Index vectors sparade till localStorage');
    } catch (error) {
      console.warn('⚠️ Kunde inte spara index vectors till localStorage:', error);
    }

    return this.indexVectors;
  }

  // Save a vector entry
  static async saveEntry(
    content: string,
    type: VectorEntry['metadata']['type'],
    importance: number = 0.5,
    tags: string[] = [],
    context?: string
  ): Promise<string> {
    try {
      console.log('💾 Saving vector entry:', { content: content.substring(0, 50) + '...', type, importance });
      
      const embedding = await EmbeddingService.getEmbedding(content);
      console.log('🔢 Embedding received:', { 
        isArray: Array.isArray(embedding), 
        length: embedding?.length, 
        hasNaN: embedding?.some(val => isNaN(val)),
        sample: embedding?.slice(0, 3)
      });
      
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0 || embedding.some(val => isNaN(val))) {
        console.error('❌ Invalid embedding returned from service:', embedding);
        throw new Error('Invalid embedding returned from service');
      }
      
      const indexVectors = await this.getIndexVectors();
      console.log('📊 Index vectors status:', { 
        isArray: Array.isArray(indexVectors), 
        length: indexVectors?.length,
        initialized: !!this.indexVectors
      });
      
      if (!indexVectors || !Array.isArray(indexVectors) || indexVectors.length === 0) {
        console.error('❌ Invalid index vectors:', indexVectors);
        throw new Error('Invalid index vectors');
      }

      const entry: VectorEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        content,
        embedding,
        metadata: {
          timestamp: new Date(),
          type,
          importance: Math.max(0, Math.min(1, importance)),
          tags,
          context
        },
        // Calculate index values
        idx0: this.indexNrToString(this.euclideanDistance(indexVectors[0], embedding)),
        idx1: this.indexNrToString(this.euclideanDistance(indexVectors[1], embedding)),
        idx2: this.indexNrToString(this.euclideanDistance(indexVectors[2], embedding)),
        idx3: this.indexNrToString(this.euclideanDistance(indexVectors[3], embedding)),
        idx4: this.indexNrToString(this.euclideanDistance(indexVectors[4], embedding))
      };

      const entries = this.loadEntries();
      entries.push(entry);

      // Keep only the most recent/important entries
      if (entries.length > this.MAX_ENTRIES) {
        entries.sort((a, b) => {
          const importanceDiff = b.metadata.importance - a.metadata.importance;
          if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
          return b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime();
        });
        entries.splice(this.MAX_ENTRIES);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
      
      console.log('💾 Vector entry sparad:', { 
        id: entry.id, 
        type, 
        content: content.substring(0, 50) + '...',
        embeddingDim: embedding.length
      });
      
      return entry.id;
    } catch (error) {
      console.error('❌ Fel vid sparande av vector entry:', error);
      throw error;
    }
  }

  // Search for similar entries
  static async searchSimilar(
    query: string,
    limit: number = 5,
    minSimilarity: number = 0.3,
    typeFilter?: VectorEntry['metadata']['type']
  ): Promise<VectorSearchResult[]> {
    try {
      console.log('🔍 Starting vector search:', { 
        query: query.substring(0, 50) + '...', 
        limit, 
        minSimilarity, 
        typeFilter 
      });
      
      const queryEmbedding = await EmbeddingService.getEmbedding(query);
      console.log('🔢 Query embedding:', { 
        isArray: Array.isArray(queryEmbedding), 
        length: queryEmbedding?.length,
        sample: queryEmbedding?.slice(0, 3)
      });
      
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        console.error('❌ Invalid query embedding:', queryEmbedding);
        return [];
      }
      
      const indexVectors = await this.getIndexVectors();
      if (!indexVectors || !Array.isArray(indexVectors)) {
        console.error('❌ Invalid index vectors for search:', indexVectors);
        return [];
      }
      
      const entries = this.loadEntries();
      console.log('📚 Loaded entries for search:', { 
        totalEntries: entries.length,
        typeFilter,
        filteredCount: typeFilter ? entries.filter(e => e.metadata.type === typeFilter).length : entries.length
      });
      
      if (entries.length === 0) {
        console.log('⚠️ No entries found in database');
        return [];
      }

      // Use index-based search for better performance
      const candidates = new Set<VectorEntry>();
      const indexDistance = 0.003;

      // Search using index ranges
      for (let i = 0; i < 5; i++) {
        const distanceToIndex = this.euclideanDistance(indexVectors[i], queryEmbedding);
        const range = distanceToIndex * indexDistance;
        const minRange = this.indexNrToString(distanceToIndex - range);
        const maxRange = this.indexNrToString(distanceToIndex + range);

        const indexField = `idx${i}` as keyof VectorEntry;
        
        entries
          .filter(entry => !typeFilter || entry.metadata.type === typeFilter)
          .filter(entry => {
            const indexValue = entry[indexField] as string;
            return indexValue >= minRange && indexValue <= maxRange;
          })
          .forEach(entry => candidates.add(entry));
      }

      // Calculate similarities and distances for all candidates
      const results: VectorSearchResult[] = Array.from(candidates)
        .map(entry => {
          const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
          const distance = this.euclideanDistance(queryEmbedding, entry.embedding);
          
          console.log('📊 Similarity calculation:', {
            entryId: entry.id,
            content: entry.content.substring(0, 30) + '...',
            similarity: similarity.toFixed(3),
            distance: distance.toFixed(3),
            passesThreshold: similarity >= minSimilarity
          });
          
          return {
            entry,
            similarity,
            distance
          };
        })
        .filter(result => {
          const passes = result.similarity >= minSimilarity;
          if (!passes) {
            console.log('❌ Filtered out:', {
              similarity: result.similarity.toFixed(3),
              threshold: minSimilarity,
              content: result.entry.content.substring(0, 30) + '...'
            });
          }
          return passes;
        })
        .sort((a, b) => b.similarity - a.similarity) // Sort by similarity (highest first)
        .slice(0, limit);

      console.log('✅ Vector search completed:', { 
        query: query.substring(0, 30) + '...', 
        totalCandidates: candidates.size,
        resultsAfterFilter: results.length,
        topSimilarity: results[0]?.similarity?.toFixed(3),
        allSimilarities: results.map(r => r.similarity.toFixed(3))
      });

      return results;
    } catch (error) {
      console.error('❌ Fel vid vector search:', error);
      return [];
    }
  }

  // Get entry by ID
  static getEntryById(id: string): VectorEntry | null {
    const entries = this.loadEntries();
    return entries.find(entry => entry.id === id) || null;
  }

  // Delete entry
  static deleteEntry(id: string): boolean {
    try {
      const entries = this.loadEntries();
      const index = entries.findIndex(entry => entry.id === id);
      
      if (index === -1) return false;
      
      entries.splice(index, 1);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
      
      console.log('🗑️ Vector entry borttagen:', id);
      return true;
    } catch (error) {
      console.error('❌ Fel vid borttagning av vector entry:', error);
      return false;
    }
  }

  // Get all entries
  static getAllEntries(): VectorEntry[] {
    return this.loadEntries();
  }

  // Get database statistics
  static getStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    averageImportance: number;
    indexVectorsInitialized: boolean;
  } {
    const entries = this.loadEntries();
    
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        byType: {},
        oldestEntry: null,
        newestEntry: null,
        averageImportance: 0,
        indexVectorsInitialized: !!this.indexVectors
      };
    }

    const byType: Record<string, number> = {};
    let totalImportance = 0;
    let oldest = entries[0].metadata.timestamp;
    let newest = entries[0].metadata.timestamp;

    for (const entry of entries) {
      byType[entry.metadata.type] = (byType[entry.metadata.type] || 0) + 1;
      totalImportance += entry.metadata.importance;
      
      if (entry.metadata.timestamp < oldest) oldest = entry.metadata.timestamp;
      if (entry.metadata.timestamp > newest) newest = entry.metadata.timestamp;
    }

    return {
      totalEntries: entries.length,
      byType,
      oldestEntry: oldest,
      newestEntry: newest,
      averageImportance: totalImportance / entries.length,
      indexVectorsInitialized: !!this.indexVectors
    };
  }

  // Clear all entries
  static clearAllEntries(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🧹 Alla vector entries rensade');
  }

  // Clear index vectors (will regenerate on next use)
  static clearIndexVectors(): void {
    localStorage.removeItem(this.INDEX_VECTORS_KEY);
    this.indexVectors = null;
    console.log('🧹 Index vectors rensade');
  }

  // Load entries from localStorage
  private static loadEntries(): VectorEntry[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      // Convert timestamp strings back to Date objects
      return parsed.map((entry: any) => ({
        ...entry,
        metadata: {
          ...entry.metadata,
          timestamp: new Date(entry.metadata.timestamp)
        }
      }));
    } catch (error) {
      console.error('❌ Fel vid laddning av vector entries:', error);
      return [];
    }
  }
}
