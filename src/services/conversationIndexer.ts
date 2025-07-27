import { VectorDatabase } from './vectorDatabase';
import { Message } from '../types/chat';

export class ConversationIndexer {
  // Index a user message
  static async indexUserMessage(message: Message): Promise<void> {
    if (!message.content.trim()) return;

    const importance = this.calculateMessageImportance(message.content, 'user');
    const tags = this.extractTags(message.content);

    await VectorDatabase.saveEntry(
      message.content,
      'user_message',
      importance,
      tags,
      `User message from ${message.timestamp.toISOString()}`
    );

    console.log('📝 User message indexed:', message.id);
  }

  // Index an assistant message
  static async indexAssistantMessage(message: Message): Promise<void> {
    if (!message.content.trim()) return;

    const importance = this.calculateMessageImportance(message.content, 'assistant');
    const tags = this.extractTags(message.content);

    await VectorDatabase.saveEntry(
      message.content,
      'assistant_message',
      importance,
      tags,
      `Assistant message from ${message.timestamp.toISOString()}`
    );

    console.log('📝 Assistant message indexed:', message.id);
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

    await VectorDatabase.saveEntry(
      conversationSummary,
      'conversation_context',
      importance,
      tags,
      `Conversation context from ${recentMessages[0]?.timestamp.toISOString()} to ${recentMessages[recentMessages.length - 1]?.timestamp.toISOString()}`
    );

    console.log('📝 Conversation context indexed');
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
      const contextSummary = relevantMemories.length > 0
        ? `Hittade ${relevantMemories.length} relevanta kontext-minnen med genomsnittlig likhet ${
            (relevantMemories.reduce((sum, m) => sum + m.similarity, 0) / relevantMemories.length).toFixed(2)
          }`
        : 'Ingen relevant kontext hittades';

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

  // Process queue (simplified - no longer needed)
  static async processQueue(): Promise<void> {
    // No-op for backward compatibility
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

  // Get indexing statistics (simplified)
  static getStats(): {
    queueLength: number;
    isIndexing: boolean;
    databaseStats: any;
  } {
    const databaseStats = VectorDatabase.getStats();
    return {
      queueLength: 0,
      isIndexing: false,
      databaseStats
    };
  }

  // Get queue size for tests (simplified)
  static getQueueSize(): number {
    return 0;
  }

  // Clear the indexing queue (simplified)
  static clearQueue(): void {
    // No-op for backward compatibility
  }
}
