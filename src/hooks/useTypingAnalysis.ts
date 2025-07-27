import { useState, useEffect, useRef } from 'react';
import { KeystrokeData, TypingPattern } from '../types/chat';
import { TimingService } from '../services/timingService';

export const useTypingAnalysis = (currentInput: string) => {
  const [typingPattern, setTypingPattern] = useState<TypingPattern | null>(null);
  const [detailedTimestamps, setDetailedTimestamps] = useState<Array<{
    char: string;
    timestamp: number;
    position: number;
    timeSinceStart: number;
    timeSinceLastChar: number;
  }>>([]);
  const keystrokeDataRef = useRef<KeystrokeData[]>([]);
  const lastKeystrokeTimeRef = useRef<number>(0);
  const inputStartTimeRef = useRef<number>(0);
  const previousInputRef = useRef<string>('');

  useEffect(() => {
    const now = Date.now();
    const prevInput = previousInputRef.current;
    
    // Detect if this is a new input session
    if (currentInput.length === 1 && prevInput.length === 0) {
      // Starting new input
      inputStartTimeRef.current = now;
      keystrokeDataRef.current = [];
      setDetailedTimestamps([]);
      lastKeystrokeTimeRef.current = now;
    }
    
    // Analyze the change
    if (currentInput.length > prevInput.length) {
      // Character added
      const newChar = currentInput[currentInput.length - 1];
      const timeSinceLastChar = lastKeystrokeTimeRef.current > 0 
        ? now - lastKeystrokeTimeRef.current 
        : 0;
      const timeSinceStart = now - inputStartTimeRef.current;
      
      const keystrokeData: KeystrokeData = {
        char: newChar,
        timestamp: now,
        timeSinceLastChar,
        position: currentInput.length - 1
      };
      
      keystrokeDataRef.current.push(keystrokeData);
      
      // Add to detailed timestamps
      setDetailedTimestamps(prev => [...prev, {
        char: newChar,
        timestamp: now,
        position: currentInput.length - 1,
        timeSinceStart,
        timeSinceLastChar
      }]);
      
      lastKeystrokeTimeRef.current = now;
      
      console.log('⌨️ Keystroke:', {
        char: newChar === ' ' ? '[SPACE]' : newChar,
        timeSinceLastChar: timeSinceLastChar + 'ms',
        timeSinceStart: timeSinceStart + 'ms',
        position: keystrokeData.position,
        totalLength: currentInput.length
      });
    } else if (currentInput.length < prevInput.length) {
      // Character(s) deleted - record backspace
      const deletedCount = prevInput.length - currentInput.length;
      const deletedText = prevInput.substring(currentInput.length, prevInput.length);
      const timeSinceStart = now - inputStartTimeRef.current;
      
      console.log('⌫ Backspace:', {
        deletedCount,
        deletedText: deletedText,
        newLength: currentInput.length,
        timeSinceLastChar: now - lastKeystrokeTimeRef.current + 'ms',
        remainingText: currentInput
      });
      
      // Add backspace record with deleted content
      const keystrokeData: KeystrokeData = {
        char: `[BACKSPACE:${deletedText}]`,
        timestamp: now,
        timeSinceLastChar: now - lastKeystrokeTimeRef.current,
        position: currentInput.length
      };
      
      keystrokeDataRef.current.push(keystrokeData);
      
      // Add to detailed timestamps
      setDetailedTimestamps(prev => [...prev, {
        char: `[BACKSPACE:${deletedText}]`,
        timestamp: now,
        position: currentInput.length,
        timeSinceStart,
        timeSinceLastChar: now - lastKeystrokeTimeRef.current
      }]);
      
      lastKeystrokeTimeRef.current = now;
    }
    
    // Update pattern analysis
    if (keystrokeDataRef.current.length > 0) {
      const pattern = TimingService.analyzeTypingPattern(keystrokeDataRef.current, inputStartTimeRef.current, now);
      setTypingPattern(pattern);
    }
    
    previousInputRef.current = currentInput;
  }, [currentInput]);

  // Reset when input is cleared
  useEffect(() => {
    if (currentInput === '') {
      keystrokeDataRef.current = [];
      setDetailedTimestamps([]);
      setTypingPattern(null);
      inputStartTimeRef.current = 0;
      lastKeystrokeTimeRef.current = 0;
      previousInputRef.current = '';
    }
  }, [currentInput]);

  return {
    typingPattern,
    keystrokeData: keystrokeDataRef.current,
    detailedTimestamps,
    inputStartTime: inputStartTimeRef.current
  };
};