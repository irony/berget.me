export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  suggestedNextContactTime?: number; // milliseconds until next proactive contact
  conversationPace?: 'fast' | 'medium' | 'slow' | 'reflective';
}

export interface ReflectionMessage {
  id: string;
  content: string;
  timestamp: Date;
  isVisible: boolean;
  emotions: string[];
  emotionalState: string;
}

export interface EmotionalContext {
  currentEmotions: string[];
  emotionalTrend: 'positive' | 'negative' | 'neutral' | 'mixed';
  userNeeds: string[];
  conversationMood: string;
  recentEmotions: { emotion: string; timestamp: Date; context: string }[];
  shouldInterrupt: boolean;
  interruptReason: string;
  aiEmotionalState?: {
    currentMood: string;
    confidence: number;
    shouldRespond: boolean;
    reasoning: string;
  };
}

export interface KeystrokeData {
  char: string;
  timestamp: number;
  timeSinceLastChar: number;
  position: number;
}

export interface TypingPattern {
  keystrokeData: KeystrokeData[];
  totalTypingTime: number;
  averageCharInterval: number;
  pauseCount: number;
  longPauses: Array<{ position: number; duration: number }>;
  typingSpeed: number; // chars per minute
  hesitationPoints: number[];
  backspaceCount: number;
  correctionPatterns: Array<{ position: number; deletedChars: number; deletedText: string; newChars: string }>;
}