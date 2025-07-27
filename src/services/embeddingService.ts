import { bergetAPI } from './api';

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingService {
  private static readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private static embeddingCache = new Map<string, number[]>();

  static async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const apiKey = import.meta.env.VITE_BERGET_API_KEY;
      if (!apiKey) {
        throw new Error('API key saknas');
      }

      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.berget.ai/v1';
      
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.EMBEDDING_MODEL,
          input: text
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Embedding API Error:', response.status, errorData);
        throw new Error(`Embedding API fel: ${response.status}`);
      }

      const data: EmbeddingResponse = await response.json();
      const embedding = data.embedding;

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);
      
      console.log('🔢 Embedding skapad:', {
        textLength: text.length,
        embeddingDimensions: embedding.length,
        model: data.model
      });

      return embedding;
    } catch (error) {
      console.error('❌ Fel vid skapande av embedding:', error);
      throw error;
    }
  }

  static async getEmbeddings(texts: string[]): Promise<number[][]> {
    // For batch processing, we'll call individual embeddings for now
    // Berget API might support batch embeddings in the future
    const embeddings = await Promise.all(
      texts.map(text => this.getEmbedding(text))
    );
    return embeddings;
  }

  private static getCacheKey(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${this.EMBEDDING_MODEL}:${hash}:${text.length}`;
  }

  static clearCache(): void {
    this.embeddingCache.clear();
    console.log('🧹 Embedding cache rensad');
  }

  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.embeddingCache.size,
      keys: Array.from(this.embeddingCache.keys()).slice(0, 10) // First 10 keys for debugging
    };
  }
}
