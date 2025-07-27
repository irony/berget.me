export interface MemoryEntry {
  id: string;
  content: string;
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
  private static readonly STORAGE_KEY = 'berget_memories';
  private static readonly MAX_ENTRIES = 1000;

  static async saveMemory(
    content: string,
    type: MemoryEntry['metadata']['type'],
    importance: number = 0.5,
    tags: string[] = [],
    context?: string
  ): Promise<string> {
    try {
      const entry: MemoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        content,
        metadata: {
          timestamp: new Date(),
          type,
          importance: Math.max(0, Math.min(1, importance)),
          tags,
          context
        }
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
      
      console.log('💾 Memory saved:', { 
        id: entry.id, 
        type, 
        content: content.substring(0, 50) + '...'
      });
      
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
      const entries = this.loadEntries();
      const queryLower = query.toLowerCase();
      
      // Simple text-based search (will be replaced with vector search via RxDB)
      const results: MemorySearchResult[] = entries
        .filter(entry => !typeFilter || entry.metadata.type === typeFilter)
        .map(entry => {
          const contentLower = entry.content.toLowerCase();
          
          // Simple similarity calculation based on word overlap
          const queryWords = queryLower.split(/\s+/);
          const contentWords = contentLower.split(/\s+/);
          
          const commonWords = queryWords.filter(word => 
            contentWords.some(contentWord => 
              contentWord.includes(word) || word.includes(contentWord)
            )
          );
          
          const similarity = commonWords.length / Math.max(queryWords.length, 1);
          
          return {
            entry,
            similarity
          };
        })
        .filter(result => result.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log('🔍 Memory search completed:', { 
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
    const entries = this.loadEntries();
    return entries.find(entry => entry.id === id) || null;
  }

  static deleteMemory(id: string): boolean {
    try {
      const entries = this.loadEntries();
      const index = entries.findIndex(entry => entry.id === id);
      
      if (index === -1) return false;
      
      entries.splice(index, 1);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
      
      console.log('🗑️ Memory deleted:', id);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete memory:', error);
      return false;
    }
  }

  static getAllMemories(): MemoryEntry[] {
    return this.loadEntries();
  }

  static getMemoryStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    averageImportance: number;
  } {
    const entries = this.loadEntries();
    
    if (entries.length === 0) {
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
      averageImportance: totalImportance / entries.length
    };
  }

  static clearAllMemories(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🧹 All memories cleared');
  }

  private static loadEntries(): MemoryEntry[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
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
