import { VectorDatabase } from './vectorDatabase';
import { Message } from '../types/chat';

export class ConversationIndexer {
  private static isIndexing = false;
  private static indexQueue: Array<{
    content: string;
    type: 'user_message' | 'assistant_message';
    importance: number;
    tags: string[];
    context?: string;
  }> = [];

  // Index a user message
  static async indexUserMessage(message: Message): Promise<void> {
    if (!message.content.trim()) return;

    const importance = this.calculateMessageImportance(message.content, 'user');
    const tags = this.extractTags(message.content);

    this.indexQueue.push({
      content: message.content,
      type: 'user_message',
      importance,
      tags,
      context: `User message from ${message.timestamp.toISOString()}`
    });

    this.processQueue();
  }

  // Index an assistant message
  static async indexAssistantMessage(message: Message): Promise<void> {
    if (!message.content.trim()) return;

    const importance = this.calculateMessageImportance(message.content, 'assistant');
    const tags = this.extractTags(message.content);

    this.indexQueue.push({
      content: message.content,
      type: 'assistant_message',
      importance,
      tags,
      context: `Assistant message from ${message.timestamp.toISOString()}`
    });

    this.processQueue();
  }

  // Index conversation context (summary of recent conversation)
  static async indexConversationContext(messages: Message[]): Promise<void> {
    if (messages.length < 2) return;

    // Create a summary of the recent conversation
    const recentMessages = messages.slice(-6); // Last 6 messages
    const conversationSummary = recentMessages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');

    const importance = 0.7; // Conversation context is generally important
    const tags = ['conversation', 'context'];

    // Add emotional context tags if available
    const userMessages = recentMessages.filter(m => m.sender === 'user');
    const assistantMessages = recentMessages.filter(m => m.sender === 'assistant');
    
    if (userMessages.length > 0) tags.push('user_interaction');
    if (assistantMessages.length > 0) tags.push('assistant_response');

    this.indexQueue.push({
      content: conversationSummary,
      type: 'conversation_context',
      importance,
      tags,
      context: `Conversation context from ${recentMessages[0]?.timestamp.toISOString()} to ${recentMessages[recentMessages.length - 1]?.timestamp.toISOString()}`
    });

    this.processQueue();
  }

  // Search for relevant context before sending a message
  static async searchRelevantContext(
    userMessage: string,
    recentMessages: Message[],
    limit: number = 3
  ): Promise<{
    relevantMemories: Array<{
      content: string;
      similarity: number;
      type: string;
      timestamp: Date;
    }>;
    contextSummary: string;
  }> {
    try {
      // Search for similar conversations and context
      const searchResults = await VectorDatabase.searchSimilar(
        userMessage,
        limit * 2, // Get more results to filter
        0.4 // Higher similarity threshold for context
      );

      // Filter out very recent messages to avoid redundancy
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const relevantResults = searchResults
        .filter(result => result.entry.metadata.timestamp < oneHourAgo)
        .slice(0, limit);

      const relevantMemories = relevantResults.map(result => ({
        content: result.entry.content,
        similarity: result.similarity,
        type: result.entry.metadata.type,
        timestamp: result.entry.metadata.timestamp
      }));

      // Create a context summary
      let contextSummary = '';
      if (relevantMemories.length > 0) {
        contextSummary = `Relevant tidigare kontext:\n${relevantMemories
          .map(memory => `- ${memory.content.substring(0, 100)}...`)
          .join('\n')}`;
      }

      console.log('🔍 Relevant context found:', {
        userMessage: userMessage.substring(0, 50) + '...',
        memoriesFound: relevantMemories.length,
        topSimilarity: relevantMemories[0]?.similarity
      });

      return {
        relevantMemories,
        contextSummary
      };
    } catch (error) {
      console.error('❌ Error searching for relevant context:', error);
      return {
        relevantMemories: [],
        contextSummary: ''
      };
    }
  }

  // Process the indexing queue
  static async processQueue(): Promise<void> {
    if (this.isIndexing || this.indexQueue.length === 0) return;

    this.isIndexing = true;
    console.log('📝 Processing conversation indexing queue:', this.indexQueue.length, 'items');

    try {
      // Process items in batches to avoid overwhelming the embedding service
      const batchSize = 3;
      while (this.indexQueue.length > 0) {
        const batch = this.indexQueue.splice(0, batchSize);
        
        await Promise.all(
          batch.map(async item => {
            try {
              await VectorDatabase.saveEntry(
                item.content,
                item.type,
                item.importance,
                item.tags,
                item.context
              );
            } catch (error) {
              console.error('❌ Error indexing item:', error, item);
            }
          })
        );

        // Small delay between batches to prevent API rate limiting
        if (this.indexQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      this.isIndexing = false;
    }
  }

  // Calculate importance of a message
  private static calculateMessageImportance(content: string, sender: 'user' | 'assistant'): number {
    let importance = 0.5; // Base importance

    // Length factor
    if (content.length > 100) importance += 0.1;
    if (content.length > 300) importance += 0.1;

    // Question factor
    if (content.includes('?')) importance += 0.1;

    // Emotional keywords
    const emotionalKeywords = [
      'känner', 'mår', 'glad', 'ledsen', 'arg', 'rädd', 'orolig', 'stressad',
      'lycklig', 'nöjd', 'besviken', 'frustrerad', 'tacksam', 'kärlek', 'hat'
    ];
    const hasEmotionalContent = emotionalKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    if (hasEmotionalContent) importance += 0.2;

    // Personal information keywords
    const personalKeywords = [
      'heter', 'bor', 'arbetar', 'studerar', 'familj', 'vänner', 'hobby',
      'gillar', 'tycker', 'drömmer', 'planerar', 'vill', 'behöver'
    ];
    const hasPersonalContent = personalKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    if (hasPersonalContent) importance += 0.2;

    // User messages are generally more important than assistant messages
    if (sender === 'user') importance += 0.1;

    return Math.min(1.0, importance);
  }

  // Extract relevant tags from content
  private static extractTags(content: string): string[] {
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // Emotional tags
    if (lowerContent.match(/\b(glad|lycklig|nöjd|bra)\b/)) tags.push('positiv_känsla');
    if (lowerContent.match(/\b(ledsen|arg|rädd|orolig|stressad|dålig)\b/)) tags.push('negativ_känsla');
    if (lowerContent.match(/\b(känner|mår|känslor)\b/)) tags.push('känslor');

    // Topic tags
    if (lowerContent.match(/\b(arbete|jobb|jobbar|arbetar)\b/)) tags.push('arbete');
    if (lowerContent.match(/\b(familj|föräldrar|barn|syskon)\b/)) tags.push('familj');
    if (lowerContent.match(/\b(vänner|kompisar|relation)\b/)) tags.push('relationer');
    if (lowerContent.match(/\b(hälsa|sjuk|mår|kropp)\b/)) tags.push('hälsa');
    if (lowerContent.match(/\b(skola|studier|utbildning|lära)\b/)) tags.push('utbildning');

    // Question tags
    if (content.includes('?')) tags.push('fråga');
    if (lowerContent.match(/\b(varför|hur|vad|när|var|vem)\b/)) tags.push('fråga');

    // Personal information tags
    if (lowerContent.match(/\b(heter|namn)\b/)) tags.push('namn');
    if (lowerContent.match(/\b(bor|hemma|adress)\b/)) tags.push('boende');
    if (lowerContent.match(/\b(ålder|år|gammal)\b/)) tags.push('ålder');

    return tags;
  }

  // Get indexing statistics
  static getStats(): {
    queueLength: number;
    isIndexing: boolean;
    databaseStats: any;
  } {
    return {
      queueLength: this.indexQueue.length,
      isIndexing: this.isIndexing,
      databaseStats: VectorDatabase.getStats()
    };
  }

  // Get queue size for tests
  static getQueueSize(): number {
    return this.indexQueue.length;
  }

  // Clear the indexing queue
  static clearQueue(): void {
    this.indexQueue = [];
    console.log('🧹 Indexing queue cleared');
  }
}
