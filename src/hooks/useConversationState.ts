import { useState, useEffect, useRef } from 'react';
import { Subject, timer, merge } from 'rxjs';
import { of } from 'rxjs';
import { 
  debounceTime, 
  distinctUntilChanged, 
  switchMap, 
  tap,
  filter,
  share,
  takeUntil,
  timeout,
  catchError,
  bufferTime,
  mergeMap
} from 'rxjs/operators';
import { ConversationStateBuilder } from '../services/stateBuilder';
import { LLMDecisionService } from '../services/llmDecisionService';
import { ConversationState, LLMDecision, StateAnalysis } from '../types/conversationState';
import { Message, ReflectionMessage, EmotionalContext } from '../types/chat';
import { useTypingAnalysis } from './useTypingAnalysis';
import { EmotionalAnalysisService } from '../services/emotionalAnalysisService';

export const useConversationState = (
  currentInput: string,
  messages: Message[],
  windowFocused: boolean,
  lastFocusTime: Date,
  lastBlurTime: Date | null,
  onDecision?: (analysis: StateAnalysis) => void
) => {
  const [currentState, setCurrentState] = useState<ConversationState | null>(null);
  const [lastDecision, setLastDecision] = useState<LLMDecision | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<StateAnalysis[]>([]);
  const [reflections, setReflections] = useState<ReflectionMessage[]>([]);
  const [isReflecting, setIsReflecting] = useState(false);
  
  // Add typing analysis
  const { typingPattern, keystrokeData, detailedTimestamps, inputStartTime } = useTypingAnalysis(currentInput);
  
  // AI emotional state
  const [aiEmotionalState, setAIEmotionalState] = useState<{
    currentMood: string;
    confidence: number;
    shouldRespond: boolean;
    reasoning: string;
    emotionalNeed: string;
  } | null>(null);
  
  // Track input timing
  const inputStartTimeRef = useRef<Date>(new Date());
  const lastKeystrokeRef = useRef<Date>(new Date());
  const lastAIActionRef = useRef<{ type: string; timestamp: Date; reasoning: string } | null>(null);
  const lastMessageCountRef = useRef(0);
  
  // RxJS subjects
  const stateSubject = useRef(new Subject<ConversationState>());
  
  // Update timing when input changes
  useEffect(() => {
    if (currentInput.length === 1) {
      // First character - new input session
      inputStartTimeRef.current = new Date();
    }
    lastKeystrokeRef.current = new Date();
  }, [currentInput]);
  
  // Build and emit state when relevant data changes
  useEffect(() => {
    if (currentInput.trim().length >= 10) {
      const state = ConversationStateBuilder
        .create()
        .withCurrentInput(currentInput, inputStartTimeRef.current, lastKeystrokeRef.current)
        .withTypingPattern(typingPattern)
        .withDetailedTimestamps(detailedTimestamps, inputStartTime)
        .withConversationHistory(messages)
        .withTemporalContext()
        .withWindowState(windowFocused, lastFocusTime, lastBlurTime)
        .withEmotionalHistory(EmotionalAnalysisService.getHistory())
        .withEngagementMetrics()
        .withLastAIAction(lastAIActionRef.current)
        .build();
      
      setCurrentState(state);
      stateSubject.current.next(state);
      console.log('📡 State emitted to RxJS pipeline:', {
        inputLength: currentInput.length,
        input: currentInput.substring(0, 30) + '...'
      });
    }
  }, [currentInput, messages.length, windowFocused, typingPattern]);
  
  // Analyze AI emotional state less frequently - only after user messages
  useEffect(() => {
    // Only trigger when message count actually changes and it's a user message
    if (messages.length > lastMessageCountRef.current && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      lastMessageCountRef.current = messages.length;
      
      // Only analyze after user messages, not AI messages, and only every other user message
      if (lastMessage.sender === 'user' && messages.filter(m => m.sender === 'user').length % 2 === 0) {
        const aiAnalysis$ = new Promise(resolve => {
          EmotionalAnalysisService.analyzeAIEmotionalState(messages)
            .then(resolve)
            .catch(() => resolve(null));
        });
        
        aiAnalysis$.then((analysis: any) => {
          if (analysis) {
            console.log('🤖 AI emotional state updated:', analysis);
            setAIEmotionalState(analysis);
          }
        });
      }
    }
  }, [messages]);
  
  // Set up RxJS pipeline - stable reference
  const onDecisionRef = useRef(onDecision);
  onDecisionRef.current = onDecision; // Update ref without causing re-renders
  
  useEffect(() => {
    console.log('🔧 Setting up RxJS pipeline...');
    
    // Create a timeout subject to prevent hanging
    const timeoutSubject = new Subject<void>();
    
    // Reset timeout on new input
    const resetTimeout = () => {
      timer(10000).subscribe(() => timeoutSubject.next());
    };
    
    const state$ = stateSubject.current.pipe(
      debounceTime(1000), // Mycket snabbare - 1 sekund
      tap(state => console.log('⏰ After debounce - input:', state.currentInput.substring(0, 30) + '...')),
      distinctUntilChanged((prev, curr) => 
        prev.currentInput === curr.currentInput &&
        prev.conversationHistory.length === curr.conversationHistory.length
      ),
      tap(state => console.log('🔄 After distinctUntilChanged - input length:', state.currentInput.length)),
      filter(state => {
        // Ännu enklare filter - analysera nästan allt
        const hasMinimumContent = state.currentInput.trim().length >= 3;
        console.log('🎯 Basic content check:', {
          hasMinimumContent,
          inputLength: state.currentInput.trim().length,
          input: state.currentInput.substring(0, 50) + '...'
        });
        return hasMinimumContent;
      }),
      tap(state => console.log('✅ After basic filter - proceeding with analysis')),
      tap(() => resetTimeout()),
      share()
    );
    
    // Independent windowed streams for decision and reflection
    const decision$ = state$.pipe(
      tap(() => {
        console.log('🧠 Starting DECISION analysis...');
        setIsAnalyzing(true);
      }),
      mergeMap(state => {
        console.log('📊 DECISION State to analyze:', {
          input: state.currentInput.substring(0, 50) + '...',
          timeOfDay: state.timeOfDay,
          engagement: state.engagementLevel,
          emotionalHistory: state.emotionalHistory.length,
          lastAIAction: state.lastAIAction?.type
        });
        
        return LLMDecisionService.analyzeState(state).pipe(
          timeout(20000), // 20 second timeout
          takeUntil(timeoutSubject),
          catchError(error => {
            console.error('❌ DECISION timeout/error:', error);
            return of({
              shouldAct: false,
              actionType: 'wait' as const,
              priority: 'low' as const,
              timing: 2000,
              reasoning: 'Timeout eller fel i analys',
              confidence: 0.1
            });
          }),
          tap(decision => {
            console.log('🤖 DECISION Result:', {
              shouldAct: decision.shouldAct,
              actionType: decision.actionType,
              priority: decision.priority,
              confidence: decision.confidence,
              reasoning: decision.reasoning
            });
            
            const analysis: StateAnalysis = {
              state,
              decision,
              timestamp: new Date()
            };
            
            // Store analysis
            setAnalysisHistory(prev => [...prev.slice(-19), analysis]);
            setLastDecision(decision);
            
            // Trigger callback if decision should act
            if (decision.shouldAct && onDecisionRef.current) {
              setTimeout(() => {
                console.log('🚀 DECISION Executing:', decision.actionType);
                onDecisionRef.current!(analysis);
                
                // Record this AI action
                lastAIActionRef.current = {
                  type: decision.actionType,
                  timestamp: new Date(),
                  reasoning: decision.reasoning
                };
              }, decision.timing);
            }
          })
        );
      })
    );
    
    const reflection$ = state$.pipe(
      tap(() => {
        console.log('💭 Starting REFLECTION generation...');
        setIsReflecting(true);
      }),
      // Use bufferTime to batch reflection requests - longer buffer
      bufferTime(1000), // Kortare buffer för snabbare reflektioner
      filter(states => states.length > 0),
      tap(states => console.log(`📦 Processing ${states.length} buffered reflection states`)),
      mergeMap(states => {
        // Take the latest state from the buffer
        const state = states[states.length - 1];
        
        console.log('🔍 REFLECTION State to analyze:', {
          input: state.currentInput.substring(0, 50) + '...',
          inputLength: state.currentInput.length,
          timeOfDay: state.timeOfDay,
          conversationLength: state.conversationHistory.length
        });
        
        return LLMDecisionService.generateReflection(state).pipe(
          timeout(8000), // Längre timeout för reflektioner
          takeUntil(timeoutSubject),
          catchError(error => {
            console.error('❌ REFLECTION timeout/error:', error);
            setIsReflecting(false);
            return of(null);
          }),
          tap(reflection => {
            if (reflection) {
              console.log('✨ REFLECTION Generated:', {
                content: reflection.content.substring(0, 50) + '...',
                emotions: reflection.emotions,
                emotionalState: reflection.emotionalState
              });
              setReflections(prev => [...prev.slice(-4), reflection]); // Keep last 5 reflections
              
              // Add to emotional history
              const emotionalAnalysis = {
                emotions: reflection.emotions,
                emotionalState: reflection.emotionalState,
                valence: 'neutral' as const, // Will be determined by LLM later
                intensity: 0.5,
                userNeeds: []
              };
              addEmotionalAnalysis(emotionalAnalysis);
            } else {
              console.log('❌ REFLECTION No reflection generated (null response)');
            }
            setIsReflecting(false);
          })
        );
      })
    );
    
    // Merge both streams to handle them independently
    const combined$ = merge(decision$, reflection$);
    
    const combinedSubscription = combined$.subscribe({
      next: () => {
        console.log('✅ Analysis stream completed');
        setIsAnalyzing(false);
      },
      error: (error) => {
        console.error('❌ Combined stream error:', error);
        setIsAnalyzing(false);
        setIsReflecting(false);
      }
    });
    
    return () => {
      console.log('🧹 Cleaning up RxJS subscriptions');
      timeoutSubject.next();
      timeoutSubject.complete();
      combinedSubscription.unsubscribe();
    };
  }, []); // Empty dependency array - pipeline should only be set up once
  
  // Method to add emotional analysis to history
  const addEmotionalAnalysis = (analysis: {
    emotions: string[];
    emotionalState: string;
    valence: 'positive' | 'negative' | 'neutral' | 'mixed';
    intensity: number;
    userNeeds: string[];
  }) => {
    EmotionalAnalysisService.addToHistory(analysis);
  };
  
  return {
    currentState,
    lastDecision,
    isAnalyzing,
    analysisHistory,
    reflections,
    isReflecting,
    addEmotionalAnalysis,
    getEmotionalTrend: EmotionalAnalysisService.getEmotionalTrend,
    emotionalHistory: EmotionalAnalysisService.getHistory(),
    // Legacy compatibility for ReflectionPanel
    emotionalContext: {
      ...EmotionalAnalysisService.getCurrentEmotionalContext(),
      recentEmotions: EmotionalAnalysisService.getHistory().slice(-5).map(h => ({
        emotion: h.emotionalState,
        timestamp: h.timestamp,
        context: h.emotionalState
      })),
      shouldInterrupt: lastDecision?.shouldAct && ['high', 'urgent'].includes(lastDecision.priority),
      interruptReason: lastDecision?.reasoning || '',
      aiEmotionalState
    } as EmotionalContext
  };
};