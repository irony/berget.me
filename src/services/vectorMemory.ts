export interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    timestamp: Date;
    type: 'conversation' | 'reflection' | 'insight' | 'preference' | 'fact';
    importance: number; // 0-1
    tags: string[];
    context?: string;
  };
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  similarity: number;
}

export class VectorMemoryService {
  private static readonly STORAGE_KEY = 'berget_ai_memory';
  private static readonly MAX_ENTRIES = 1000;
  private static readonly EMBEDDING_DIM = 384; // Simulated embedding dimension

  // Simple text-to-vector conversion (in real implementation, use proper embeddings)
  private static async textToVector(text: string): Promise<number[]> {
    // Simplified embedding - in production, use actual embedding model
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(this.EMBEDDING_DIM).fill(0);
    
    // Simple hash-based embedding simulation
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode + i * j) % this.EMBEDDING_DIM;
        vector[index] += Math.sin(charCode * 0.1) * 0.1;
      }
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  static async saveMemory(
    content: string,
    type: MemoryEntry['metadata']['type'],
    importance: number = 0.5,
    tags: string[] = [],
    context?: string
  ): Promise<string> {
    try {
      const embedding = await this.textToVector(content);
      const entry: MemoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        content,
        embedding,
        metadata: {
          timestamp: new Date(),
          type,
          importance: Math.max(0, Math.min(1, importance)),
          tags,
          context
        }
      };

      const memories = this.loadMemories();
      memories.push(entry);

      // Keep only the most recent/important entries
      if (memories.length > this.MAX_ENTRIES) {
        memories.sort((a, b) => {
          // Sort by importance first, then by timestamp
          const importanceDiff = b.metadata.importance - a.metadata.importance;
          if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
          return b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime();
        });
        memories.splice(this.MAX_ENTRIES);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(memories));
      console.log('💾 Memory saved:', { id: entry.id, type, content: content.substring(0, 50) + '...' });
      return entry.id;
    } catch (error) {
      console.error('❌ Failed to save memory:', error);
      throw error;
    }
  }

  static async searchMemories(
    query: string,
    limit: number = 5,
    minSimilarity: number = 0.3,
    typeFilter?: MemoryEntry['metadata']['type']
  ): Promise<MemorySearchResult[]> {
    try {
      const queryEmbedding = await this.textToVector(query);
      const memories = this.loadMemories();

      const results: MemorySearchResult[] = memories
        .filter(memory => !typeFilter || memory.metadata.type === typeFilter)
        .map(memory => ({
          entry: memory,
          similarity: this.cosineSimilarity(queryEmbedding, memory.embedding)
        }))
        .filter(result => result.similarity >= minSimilarity)
        .sort((a, b) => {
          // Sort by similarity first, then by importance
          const simDiff = b.similarity - a.similarity;
          if (Math.abs(simDiff) > 0.05) return simDiff;
          return b.entry.metadata.importance - a.entry.metadata.importance;
        })
        .slice(0, limit);

      console.log('🔍 Memory search:', { 
        query: query.substring(0, 30) + '...', 
        results: results.length,
        topSimilarity: results[0]?.similarity 
      });

      return results;
    } catch (error) {
      console.error('❌ Failed to search memories:', error);
      return [];
    }
  }

  static getMemoryById(id: string): MemoryEntry | null {
    const memories = this.loadMemories();
    return memories.find(memory => memory.id === id) || null;
  }

  static deleteMemory(id: string): boolean {
    try {
      const memories = this.loadMemories();
      const index = memories.findIndex(memory => memory.id === id);
      
      if (index === -1) return false;
      
      memories.splice(index, 1);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(memories));
      console.log('🗑️ Memory deleted:', id);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete memory:', error);
      return false;
    }
  }

  static getAllMemories(): MemoryEntry[] {
    return this.loadMemories();
  }

  static getMemoryStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    averageImportance: number;
  } {
    const memories = this.loadMemories();
    
    if (memories.length === 0) {
      return {
        totalEntries: 0,
        byType: {},
        oldestEntry: null,
        newestEntry: null,
        averageImportance: 0
      };
    }

    const byType: Record<string, number> = {};
    let totalImportance = 0;
    let oldest = memories[0].metadata.timestamp;
    let newest = memories[0].metadata.timestamp;

    for (const memory of memories) {
      byType[memory.metadata.type] = (byType[memory.metadata.type] || 0) + 1;
      totalImportance += memory.metadata.importance;
      
      if (memory.metadata.timestamp < oldest) oldest = memory.metadata.timestamp;
      if (memory.metadata.timestamp > newest) newest = memory.metadata.timestamp;
    }

    return {
      totalEntries: memories.length,
      byType,
      oldestEntry: oldest,
      newestEntry: newest,
      averageImportance: totalImportance / memories.length
    };
  }

  static clearAllMemories(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🧹 All memories cleared');
  }

  private static loadMemories(): MemoryEntry[] {
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
      console.error('❌ Failed to load memories:', error);
      return [];
    }
  }
}