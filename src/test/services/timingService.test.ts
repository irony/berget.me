import { describe, it, expect } from 'vitest';
import { TimingService } from '../../services/timingService';
import { KeystrokeData } from '../../types/chat';

describe('TimingService', () => {
  describe('analyzeTypingPattern', () => {
    it('ska analysera grundläggande skrivmönster', () => {
      const keystrokeData: KeystrokeData[] = [
        { char: 'h', timestamp: 1000, timeSinceLastChar: 0, position: 0 },
        { char: 'e', timestamp: 1100, timeSinceLastChar: 100, position: 1 },
        { char: 'j', timestamp: 1200, timeSinceLastChar: 100, position: 2 },
      ];

      const pattern = TimingService.analyzeTypingPattern(keystrokeData, 1000, 1200);

      expect(pattern.totalTypingTime).toBe(200);
      expect(pattern.averageCharInterval).toBe(100);
      expect(pattern.typingSpeed).toBeGreaterThan(0);
      expect(pattern.backspaceCount).toBe(0);
    });

    it('ska upptäcka långa pauser', () => {
      const keystrokeData: KeystrokeData[] = [
        { char: 'h', timestamp: 1000, timeSinceLastChar: 0, position: 0 },
        { char: 'e', timestamp: 1100, timeSinceLastChar: 100, position: 1 },
        { char: 'j', timestamp: 2500, timeSinceLastChar: 1400, position: 2 }, // Lång paus
      ];

      const pattern = TimingService.analyzeTypingPattern(keystrokeData, 1000, 2500);

      expect(pattern.longPauses.length).toBe(1);
      expect(pattern.longPauses[0].duration).toBe(1400);
      expect(pattern.longPauses[0].position).toBe(2);
    });

    it('ska räkna backspaces korrekt', () => {
      const keystrokeData: KeystrokeData[] = [
        { char: 'h', timestamp: 1000, timeSinceLastChar: 0, position: 0 },
        { char: 'e', timestamp: 1100, timeSinceLastChar: 100, position: 1 },
        { char: '[BACKSPACE:e]', timestamp: 1200, timeSinceLastChar: 100, position: 1 },
        { char: 'a', timestamp: 1300, timeSinceLastChar: 100, position: 1 },
      ];

      const pattern = TimingService.analyzeTypingPattern(keystrokeData, 1000, 1300);

      expect(pattern.backspaceCount).toBe(1);
      expect(pattern.correctionPatterns.length).toBe(1);
      expect(pattern.correctionPatterns[0].deletedText).toBe('e');
      expect(pattern.correctionPatterns[0].newChars).toBe('a');
    });

    it('ska upptäcka tveksamhetspunkter', () => {
      const keystrokeData: KeystrokeData[] = [
        { char: 'h', timestamp: 1000, timeSinceLastChar: 0, position: 0 },
        { char: 'e', timestamp: 1100, timeSinceLastChar: 100, position: 1 },
        { char: 'j', timestamp: 1700, timeSinceLastChar: 600, position: 2 }, // Tveksamhet
      ];

      const pattern = TimingService.analyzeTypingPattern(keystrokeData, 1000, 1700);

      expect(pattern.hesitationPoints.length).toBe(1);
      expect(pattern.hesitationPoints[0]).toBe(2);
    });
  });

  describe('analyzeTypingPatternsForPrompt', () => {
    it('ska generera beskrivning för långsam skrivning', () => {
      const pattern = {
        keystrokeData: [],
        totalTypingTime: 10000,
        averageCharInterval: 500,
        pauseCount: 0,
        longPauses: [],
        typingSpeed: 20, // Långsam
        hesitationPoints: [],
        backspaceCount: 0,
        correctionPatterns: []
      };

      const analysis = TimingService.analyzeTypingPatternsForPrompt(pattern);

      expect(analysis).toContain('Långsam skrivhastighet');
      expect(analysis).toContain('reflektion eller osäkerhet');
    });

    it('ska generera beskrivning för många pauser', () => {
      const pattern = {
        keystrokeData: [],
        totalTypingTime: 5000,
        averageCharInterval: 200,
        pauseCount: 5,
        longPauses: [
          { position: 5, duration: 1200 },
          { position: 10, duration: 1500 },
          { position: 15, duration: 1100 }
        ],
        typingSpeed: 60,
        hesitationPoints: [],
        backspaceCount: 0,
        correctionPatterns: []
      };

      const analysis = TimingService.analyzeTypingPatternsForPrompt(pattern);

      expect(analysis).toContain('långa pauser');
      expect(analysis).toContain('djup reflektion');
    });

    it('ska hantera tomma mönster', () => {
      const pattern = {
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

      const analysis = TimingService.analyzeTypingPatternsForPrompt(pattern);

      expect(analysis).toContain('Inga skrivmönster att analysera');
    });
  });
});
