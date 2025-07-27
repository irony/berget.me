import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReflectionPanel } from '../../components/ReflectionPanel';
import { ReflectionMessage, EmotionalContext } from '../../types/chat';

describe('ReflectionPanel', () => {
  const mockEmotionalContext: EmotionalContext = {
    currentEmotions: ['😊', '🤔'],
    emotionalTrend: 'positive',
    userNeeds: ['stöd', 'förståelse'],
    conversationMood: 'positiv nyfikenhet',
    recentEmotions: [],
    shouldInterrupt: false,
    interruptReason: ''
  };

  const mockReflections: ReflectionMessage[] = [
    {
      id: '1',
      content: 'Du verkar glad och nyfiken idag',
      timestamp: new Date(),
      isVisible: true,
      emotions: ['😊', '🤔'],
      emotionalState: 'Positiv nyfikenhet'
    }
  ];

  it('ska rendera när den är synlig', () => {
    render(
      <ReflectionPanel
        reflections={mockReflections}
        isReflecting={false}
        isVisible={true}
        emotionalContext={mockEmotionalContext}
      />
    );

    expect(screen.getByText('Realtidsreflektion')).toBeInTheDocument();
    expect(screen.getByText('Du verkar glad och nyfiken idag')).toBeInTheDocument();
  });

  it('ska inte rendera när den är dold', () => {
    render(
      <ReflectionPanel
        reflections={mockReflections}
        isReflecting={false}
        isVisible={false}
        emotionalContext={mockEmotionalContext}
      />
    );

    expect(screen.queryByText('Realtidsreflektion')).not.toBeInTheDocument();
  });

  it('ska visa emotionell kontext', () => {
    render(
      <ReflectionPanel
        reflections={[]}
        isReflecting={false}
        isVisible={true}
        emotionalContext={mockEmotionalContext}
      />
    );

    expect(screen.getByText('Emotionell kontext')).toBeInTheDocument();
    expect(screen.getByText('positiv nyfikenhet')).toBeInTheDocument();
    expect(screen.getByText('stöd, förståelse')).toBeInTheDocument();
  });

  it('ska visa reflekteringsindikator', () => {
    render(
      <ReflectionPanel
        reflections={[]}
        isReflecting={true}
        isVisible={true}
        emotionalContext={mockEmotionalContext}
      />
    );

    expect(screen.getByText('Reflekterar...')).toBeInTheDocument();
  });

  it('ska visa placeholder när inga reflektioner finns', () => {
    render(
      <ReflectionPanel
        reflections={[]}
        isReflecting={false}
        isVisible={true}
        emotionalContext={{ ...mockEmotionalContext, currentEmotions: [] }}
      />
    );

    expect(screen.getByText(/Börja skriva så reflekterar AI:n/)).toBeInTheDocument();
  });
});
