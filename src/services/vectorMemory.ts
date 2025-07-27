import { VectorDatabase, VectorEntry, VectorSearchResult } from './vectorDatabase';

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
  // Convert VectorEntry to MemoryEntry for backward compatibility
  private static vectorEntryToMemoryEntry(vectorEntry: VectorEntry): MemoryEntry {
    return {
      id: vectorEntry.id,
      content: vectorEntry.content,
      embedding: vectorEntry.embedding,
      metadata: {
        timestamp: vectorEntry.metadata.timestamp,
        type: vectorEntry.metadata.type === 'user_message' || vectorEntry.metadata.type === 'assistant_message' 
          ? 'conversation' 
          : vectorEntry.metadata.type === 'conversation_context'
          ? 'conversation'
          : vectorEntry.metadata.type as any,
        importance: vectorEntry.metadata.importance,
        tags: vectorEntry.metadata.tags,
        context: vectorEntry.metadata.context
      }
    };
  }

  // Convert MemoryEntry type to VectorEntry type
  private static memoryTypeToVectorType(type: MemoryEntry['metadata']['type']): VectorEntry['metadata']['type'] {
    switch (type) {
      case 'conversation': return 'conversation_context';
      case 'reflection': return 'memory';
      case 'insight': return 'memory';
      case 'preference': return 'memory';
      case 'fact': return 'memory';
      default: return 'memory';
    }
  }

  static async saveMemory(
    content: string,
    type: MemoryEntry['metadata']['type'],
    importance: number = 0.5,
    tags: string[] = [],
    context?: string
  ): Promise<string> {
    try {
      const vectorType = this.memoryTypeToVectorType(type);
      const id = await VectorDatabase.saveEntry(content, vectorType, importance, tags, context);
      console.log('💾 Memory saved via VectorDatabase:', { id, type, content: content.substring(0, 50) + '...' });
      return id;
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
      const vectorTypeFilter = typeFilter ? this.memoryTypeToVectorType(typeFilter) : undefined;
      const vectorResults = await VectorDatabase.searchSimilar(query, limit, minSimilarity, vectorTypeFilter);

      const results: MemorySearchResult[] = vectorResults.map(result => ({
        entry: this.vectorEntryToMemoryEntry(result.entry),
        similarity: result.similarity
      }));

      console.log('🔍 Memory search via VectorDatabase:', { 
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
    const vectorEntry = VectorDatabase.getEntryById(id);
    return vectorEntry ? this.vectorEntryToMemoryEntry(vectorEntry) : null;
  }

  static deleteMemory(id: string): boolean {
    const success = VectorDatabase.deleteEntry(id);
    if (success) {
      console.log('🗑️ Memory deleted via VectorDatabase:', id);
    }
    return success;
  }

  static getAllMemories(): MemoryEntry[] {
    const vectorEntries = VectorDatabase.getAllEntries();
    return vectorEntries.map(entry => this.vectorEntryToMemoryEntry(entry));
  }

  static getMemoryStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    averageImportance: number;
  } {
    const stats = VectorDatabase.getStats();
    
    // Convert vector types back to memory types for display
    const byType: Record<string, number> = {};
    Object.entries(stats.byType).forEach(([vectorType, count]) => {
      let memoryType: string;
      switch (vectorType) {
        case 'user_message':
        case 'assistant_message':
        case 'conversation_context':
          memoryType = 'conversation';
          break;
        case 'memory':
          memoryType = 'memory';
          break;
        default:
          memoryType = vectorType;
      }
      byType[memoryType] = (byType[memoryType] || 0) + count;
    });

    return {
      totalEntries: stats.totalEntries,
      byType,
      oldestEntry: stats.oldestEntry,
      newestEntry: stats.newestEntry,
      averageImportance: stats.averageImportance
    };
  }

  static clearAllMemories(): void {
    VectorDatabase.clearAllEntries();
    console.log('🧹 All memories cleared via VectorDatabase');
  }
}
