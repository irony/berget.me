import { KeystrokeData, TypingPattern } from '../types/chat';

export class TimingService {
  static analyzeTypingPattern(
    keystrokeData: KeystrokeData[], 
    startTime: number, 
    currentTime: number
  ): TypingPattern {
    const totalTypingTime = currentTime - startTime;
    const validIntervals = keystrokeData
      .filter(k => k.timeSinceLastChar > 0 && k.char !== '[BACKSPACE]')
      .map(k => k.timeSinceLastChar);
    
    const averageCharInterval = validIntervals.length > 0 
      ? validIntervals.reduce((sum, interval) => sum + interval, 0) / validIntervals.length
      : 0;
    
    // Detect pauses (>1000ms between keystrokes)
    const longPauses = keystrokeData
      .filter(k => k.timeSinceLastChar > 1000)
      .map(k => ({ position: k.position, duration: k.timeSinceLastChar }));
    
    // Calculate typing speed (chars per minute)
    const typingSpeed = totalTypingTime > 0 
      ? (keystrokeData.filter(k => k.char !== '[BACKSPACE]').length / totalTypingTime) * 60000
      : 0;
    
    // Detect hesitation points (pauses >500ms)
    const hesitationPoints = keystrokeData
      .filter(k => k.timeSinceLastChar > 500 && k.timeSinceLastChar <= 1000)
      .map(k => k.position);
    
    // Count backspaces
    const backspaceCount = keystrokeData.filter(k => k.char.startsWith('[BACKSPACE')).length;
    
    // Detect correction patterns (backspace followed by new text)
    const correctionPatterns: Array<{ position: number; deletedChars: number; deletedText: string; newChars: string }> = [];
    
    for (let i = 0; i < keystrokeData.length - 1; i++) {
      const current = keystrokeData[i];
      const next = keystrokeData[i + 1];
      
      if (current.char.startsWith('[BACKSPACE') && !next.char.startsWith('[BACKSPACE')) {
        // Extract deleted text from backspace record
        const deletedTextMatch = current.char.match(/\[BACKSPACE:(.+)\]/);
        const deletedText = deletedTextMatch ? deletedTextMatch[1] : '';
        
        // Find following characters until next backspace or end
        let newChars = '';
        let j = i + 1;
        while (j < keystrokeData.length && !keystrokeData[j].char.startsWith('[BACKSPACE')) {
          if (keystrokeData[j].char !== '[BACKSPACE]') {
            newChars += keystrokeData[j].char;
          }
          j++;
        }
        
        correctionPatterns.push({
          position: current.position,
          deletedChars: deletedText.length,
          deletedText: deletedText,
          newChars: newChars
        });
      }
    }
    
    return {
      keystrokeData,
      totalTypingTime,
      averageCharInterval,
      pauseCount: longPauses.length,
      longPauses,
      typingSpeed,
      hesitationPoints,
      backspaceCount,
      correctionPatterns
    };
  }

  static analyzeTypingPatternsForPrompt(pattern: TypingPattern): string {
    if (!pattern || pattern.keystrokeData.length === 0) {
      return "Inga skrivmönster att analysera än.";
    }
    
    const analysis = [];
    
    // Typing speed analysis
    if (pattern.typingSpeed < 30) {
      analysis.push("Långsam skrivhastighet - kan indikera reflektion eller osäkerhet");
    } else if (pattern.typingSpeed > 80) {
      analysis.push("Snabb skrivhastighet - kan indikera stress eller entusiasm");
    } else {
      analysis.push("Normal skrivhastighet - avslappnad skrivning");
    }
    
    // Pause analysis
    if (pattern.longPauses.length > 2) {
      analysis.push(`${pattern.longPauses.length} långa pauser - tyder på djup reflektion eller tveksamhet`);
      
      // Analyze where pauses occur
      const pausePositions = pattern.longPauses.map(p => p.position);
      if (pausePositions.some(pos => pos < 10)) {
        analysis.push("Pauser tidigt i meddelandet - svårt att komma igång");
      }
    }
    
    // Hesitation analysis
    if (pattern.hesitationPoints.length > 3) {
      analysis.push(`${pattern.hesitationPoints.length} tveksamhetspunkter - osäkerhet om formulering`);
    }
    
    // Correction analysis
    if (pattern.backspaceCount > 3) {
      analysis.push(`${pattern.backspaceCount} raderingar - omformulerar ofta, kanske osäker eller perfektionist`);
      
      // Analyze correction patterns
      if (pattern.correctionPatterns.length > 0) {
        const corrections = pattern.correctionPatterns.slice(-3); // Last 3 corrections
        const correctionDetails = corrections.map(c => 
          `raderade "${c.deletedText}" → skrev "${c.newChars}"`
        ).join(', ');
        analysis.push(`Korrigeringar: ${correctionDetails}`);
      }
    }
    
    // Overall rhythm
    if (pattern.averageCharInterval > 300) {
      analysis.push("Långsam rytm mellan tecken - eftertänksam eller försiktig");
    } else if (pattern.averageCharInterval < 100) {
      analysis.push("Snabb rytm mellan tecken - flyter på eller stressad");
    }
    
    return analysis.length > 0 ? analysis.join('\n- ') : "Normala skrivmönster utan särskilda signaler.";
  }

  static formatTimingInformation(detailedTimestamps: Array<{
    char: string;
    timestamp: number;
    position: number;
    timeSinceStart: number;
    timeSinceLastChar: number;
  }>, inputStartTime: Date): string {
    if (!detailedTimestamps || detailedTimestamps.length === 0) {
      return 'Ingen timing-information tillgänglig';
    }

    const last15 = detailedTimestamps.slice(-15);
    const timingDetails = last15.map(t => 
      `"${t.char === ' ' ? '[MELLANSLAG]' : 
           t.char === '\n' ? '[ENTER]' : 
           t.char.startsWith('[BACKSPACE') ? t.char : 
           t.char}" - ${t.timeSinceStart}ms från start, ${t.timeSinceLastChar}ms sedan förra`
    ).join('\n');

    const totalTime = detailedTimestamps[detailedTimestamps.length - 1]?.timeSinceStart || 0;
    const startTime = new Date(inputStartTime).toLocaleTimeString('sv-SE', {
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      fractionalSecondDigits: 3
    });
    const endTime = detailedTimestamps.length > 0 ? 
      new Date(detailedTimestamps[detailedTimestamps.length - 1].timestamp).toLocaleTimeString('sv-SE', {
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        fractionalSecondDigits: 3
      }) : 'okänt';

    return `Tecken-för-tecken timing:
${timingDetails}

Totalt skrivtid: ${totalTime}ms
Startade: ${startTime}
Slutade: ${endTime}`;
  }
}