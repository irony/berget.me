import { describe, it, expect } from 'vitest';
import { ConversationStateBuilder } from '../../services/stateBuilder';
import { Message } from '../../types/chat';

describe('ConversationStateBuilder', () => {
  it('ska bygga en komplett ConversationState', () => {
    const messages: Message[] = [
      {
        id: '1',
        content: 'Hej, hur mår du?',
        sender: 'user',
        timestamp: new Date('2024-01-01T10:00:00')
      },
      {
        id: '2',
        content: 'Hej! Jag mår bra, tack för att du frågar.',
        sender: 'assistant',
        timestamp: new Date('2024-01-01T10:00:30')
      }
    ];

    const state = ConversationStateBuilder
      .create()
      .withCurrentInput('Vad gör du idag?')
      .withConversationHistory(messages)
      .withTemporalContext(new Date('2024-01-01T14:30:00'))
      .withWindowState(true, new Date(), null)
      .withEngagementMetrics()
      .build();

    expect(state.currentInput).toBe('Vad gör du idag?');
    expect(state.conversationHistory).toHaveLength(2);
    expect(state.conversationHistory[0].role).toBe('user');
    expect(state.conversationHistory[1].role).toBe('assistant');
    expect(state.timeOfDay).toBe('afternoon');
    expect(state.windowFocused).toBe(true);
    expect(state.engagementLevel).toBeDefined();
  });

  it('ska beräkna korrekt tid på dagen', () => {
    const morningState = ConversationStateBuilder
      .create()
      .withTemporalContext(new Date('2024-01-01T08:00:00'))
      .build();

    const eveningState = ConversationStateBuilder
      .create()
      .withTemporalContext(new Date('2024-01-01T19:00:00'))
      .build();

    const nightState = ConversationStateBuilder
      .create()
      .withTemporalContext(new Date('2024-01-01T23:00:00'))
      .build();

    expect(morningState.timeOfDay).toBe('morning');
    expect(eveningState.timeOfDay).toBe('evening');
    expect(nightState.timeOfDay).toBe('night');
  });

  it('ska beräkna engagemangsnivå baserat på meddelandefrekvens', () => {
    const highEngagementMessages: Message[] = Array.from({ length: 10 }, (_, i) => ({
      id: i.toString(),
      content: 'Detta är ett längre meddelande med mycket innehåll som visar högt engagemang',
      sender: 'user',
      timestamp: new Date(Date.now() - (10 - i) * 30000) // Ett meddelande var 30:e sekund
    }));

    const lowEngagementMessages: Message[] = [
      {
        id: '1',
        content: 'ok',
        sender: 'user',
        timestamp: new Date(Date.now() - 600000) // 10 minuter sedan
      }
    ];

    const highState = ConversationStateBuilder
      .create()
      .withConversationHistory(highEngagementMessages)
      .withEngagementMetrics()
      .build();

    const lowState = ConversationStateBuilder
      .create()
      .withConversationHistory(lowEngagementMessages)
      .withEngagementMetrics()
      .build();

    expect(highState.engagementLevel).toBe('high');
    expect(lowState.engagementLevel).toBe('low');
  });

  it('ska hantera tomma konversationer', () => {
    const state = ConversationStateBuilder
      .create()
      .withConversationHistory([])
      .withEngagementMetrics()
      .build();

    expect(state.conversationHistory).toHaveLength(0);
    expect(state.messageFrequency).toBe(0);
    expect(state.averageMessageLength).toBe(0);
    expect(state.conversationDuration).toBe(0);
  });
});
