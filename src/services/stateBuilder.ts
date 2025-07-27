import { ConversationState } from '../types/conversationState';
import { Message } from '../types/chat';
import { TypingPattern } from '../types/chat';

export class ConversationStateBuilder {
  private state: Partial<ConversationState> = {};
  
  static create(): ConversationStateBuilder {
    return new ConversationStateBuilder();
  }
  
  withCurrentInput(input: string, startTime: Date, lastKeystroke: Date): ConversationStateBuilder {
    this.state.currentInput = input;
    this.state.inputStartTime = startTime;
    this.state.lastKeystroke = lastKeystroke;
    this.state.typingDuration = lastKeystroke.getTime() - startTime.getTime();
    return this;
  }
  
  withTypingPattern(pattern: TypingPattern | null): ConversationStateBuilder {
    this.state.typingPattern = pattern || {
      keystrokeData: [],
      totalTypingTime: 0,
      averageCharInterval: 0,
      pauseCount: 0,
      longPauses: [],
      typingSpeed: 0,
      hesitationPoints: [],
      backspaceCount: 0,
      correctionPatterns: []
    };
    return this;
  }
  
  withDetailedTimestamps(timestamps: Array<{
    char: string;
    timestamp: number;
    position: number;
    timeSinceStart: number;
    timeSinceLastChar: number;
  }>, inputStartTime: number): ConversationStateBuilder {
    this.state.detailedTimestamps = timestamps;
    this.state.inputStartTime = new Date(inputStartTime);
    return this;
  }
  
  withConversationHistory(messages: Message[]): ConversationStateBuilder {
    this.state.conversationHistory = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content,
      timestamp: msg.timestamp
    }));
    
    // Calculate conversation metrics
    if (messages.length > 0) {
      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      this.state.conversationDuration = lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime();
      
      const userMessages = messages.filter(m => m.sender === 'user');
      this.state.messageFrequency = userMessages.length / Math.max(1, this.state.conversationDuration / (1000 * 60));
      this.state.averageMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / Math.max(1, userMessages.length);
      
      // Calculate topic changes (simplified)
      this.state.topicChanges = this.calculateTopicChanges(userMessages);
    }
    
    return this;
  }
  
  withTemporalContext(currentTime: Date = new Date()): ConversationStateBuilder {
    this.state.currentTime = currentTime;
    
    const hour = currentTime.getHours();
    if (hour < 12) this.state.timeOfDay = 'morning';
    else if (hour < 17) this.state.timeOfDay = 'afternoon';
    else if (hour < 21) this.state.timeOfDay = 'evening';
    else this.state.timeOfDay = 'night';
    
    this.state.dayOfWeek = currentTime.toLocaleDateString('sv-SE', { weekday: 'long' });
    
    return this;
  }
  
  withWindowState(focused: boolean, lastFocusTime: Date, lastBlurTime: Date | null): ConversationStateBuilder {
    this.state.windowFocused = focused;
    this.state.lastFocusTime = lastFocusTime;
    this.state.lastBlurTime = lastBlurTime;
    this.state.timeSinceLastBlur = lastBlurTime ? Date.now() - lastBlurTime.getTime() : null;
    return this;
  }
  
  withEmotionalHistory(history: Array<{
    timestamp: Date;
    emotions: string[];
    emotionalState: string;
    valence: 'positive' | 'negative' | 'neutral' | 'mixed';
    intensity: number;
    userNeeds: string[];
  }>): ConversationStateBuilder {
    this.state.emotionalHistory = history.slice(-10); // Keep last 10 analyses
    return this;
  }
  
  withEngagementMetrics(): ConversationStateBuilder {
    // Calculate engagement based on message frequency, length, and response time
    const { messageFrequency = 0, averageMessageLength = 0, conversationHistory = [] } = this.state;
    
    if (messageFrequency > 2 && averageMessageLength > 50) {
      this.state.engagementLevel = 'high';
    } else if (messageFrequency > 0.5 && averageMessageLength > 20) {
      this.state.engagementLevel = 'medium';
    } else {
      this.state.engagementLevel = 'low';
    }
    
    // Calculate average response time
    const userMessages = conversationHistory.filter(m => m.role === 'user');
    if (userMessages.length > 1) {
      const responseTimes = [];
      for (let i = 1; i < userMessages.length; i++) {
        responseTimes.push(userMessages[i].timestamp.getTime() - userMessages[i-1].timestamp.getTime());
      }
      this.state.responseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    } else {
      this.state.responseTime = 0;
    }
    
    return this;
  }
  
  withLastAIAction(action: { type: string; timestamp: Date; reasoning: string } | null): ConversationStateBuilder {
    this.state.lastAIAction = action;
    return this;
  }
  
  withSilencePeriods(periods: Array<{ start: Date; end: Date; duration: number }>): ConversationStateBuilder {
    this.state.silencePeriods = periods.slice(-5); // Keep last 5 silence periods
    return this;
  }
  
  build(): ConversationState {
    // Ensure all required fields have defaults
    return {
      currentInput: '',
      inputStartTime: new Date(),
      lastKeystroke: new Date(),
      typingDuration: 0,
      conversationHistory: [],
      currentTime: new Date(),
      timeOfDay: 'afternoon',
      dayOfWeek: 'måndag',
      windowFocused: true,
      lastFocusTime: new Date(),
      lastBlurTime: null,
      timeSinceLastBlur: null,
      emotionalHistory: [],
      messageFrequency: 0,
      averageMessageLength: 0,
      conversationDuration: 0,
      silencePeriods: [],
      lastAIAction: null,
      engagementLevel: 'medium',
      responseTime: 0,
      topicChanges: 0,
      ...this.state
    } as ConversationState;
  }
  
  private calculateTopicChanges(messages: Message[]): number {
    // Simplified topic change detection
    let changes = 0;
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i-1].content.toLowerCase();
      const curr = messages[i].content.toLowerCase();
      
      // Very basic topic change detection - in reality this would be more sophisticated
      const commonWords = ['och', 'men', 'så', 'att', 'det', 'är', 'jag', 'du', 'vi'];
      const prevWords = prev.split(' ').filter(w => !commonWords.includes(w));
      const currWords = curr.split(' ').filter(w => !commonWords.includes(w));
      
      const overlap = prevWords.filter(w => currWords.includes(w)).length;
      const totalWords = Math.max(prevWords.length, currWords.length);
      
      if (totalWords > 0 && overlap / totalWords < 0.3) {
        changes++;
      }
    }
    
    return changes;
  }
}