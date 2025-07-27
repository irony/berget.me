import { TypingPattern } from './chat';

export interface ConversationState {
  // Current input and timing
  currentInput: string;
  inputStartTime: Date;
  lastKeystroke: Date;
  typingDuration: number;
  typingPattern: TypingPattern;
  
  // Detailed timing information
  detailedTimestamps?: Array<{
    char: string;
    timestamp: number;
    position: number;
    timeSinceStart: number;
    timeSinceLastChar: number;
  }>;
  
  // Conversation context
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  
  // Temporal context
  currentTime: Date;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  
  // Window and focus state
  windowFocused: boolean;
  lastFocusTime: Date;
  lastBlurTime: Date | null;
  timeSinceLastBlur: number | null;
  
  // Previous analyses
  emotionalHistory: Array<{
    timestamp: Date;
    emotions: string[];
    emotionalState: string;
    valence: 'positive' | 'negative' | 'neutral' | 'mixed';
    intensity: number;
    userNeeds: string[];
  }>;
  
  // Conversation patterns
  messageFrequency: number;
  averageMessageLength: number;
  conversationDuration: number;
  silencePeriods: Array<{
    start: Date;
    end: Date;
    duration: number;
  }>;
  
  // AI behavior history
  lastAIAction: {
    type: string;
    timestamp: Date;
    reasoning: string;
  } | null;
  
  // User engagement patterns
  engagementLevel: 'high' | 'medium' | 'low';
  responseTime: number;
  topicChanges: number;
}

export interface LLMDecision {
  shouldAct: boolean;
  actionType: 'wait' | 'reflect' | 'support' | 'clarify' | 'encourage' | 'check_in' | 'apologize' | 'redirect';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timing: number; // milliseconds to wait
  reasoning: string;
  confidence: number; // 0-1
  suggestedMessage?: string;
}

export interface StateAnalysis {
  state: ConversationState;
  decision: LLMDecision;
  timestamp: Date;
}