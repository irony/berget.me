import React from 'react';
import { Brain, Sparkles, Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ReflectionMessage, EmotionalContext } from '../types/chat';

interface ReflectionPanelProps {
  reflections: ReflectionMessage[];
  isReflecting: boolean;
  isVisible: boolean;
  emotionalContext: EmotionalContext;
}

export const ReflectionPanel: React.FC<ReflectionPanelProps> = ({
  reflections,
  isReflecting,
  isVisible,
  emotionalContext,
}) => {
  if (!isVisible) return null;

  const getTrendIcon = () => {
    switch (emotionalContext.emotionalTrend) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'mixed': return <Heart className="w-4 h-4 text-yellow-500" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };
  return (
    <div className="w-80 bg-gradient-to-b from-purple-50 to-blue-50 border-l border-purple-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-200 bg-white/50">
        <div className="flex items-center space-x-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <h2 className="text-sm font-medium text-purple-900">Realtidsreflektion</h2>
        </div>
        <p className="text-xs text-purple-600 mt-1">AI:n reflekterar över dina tankar</p>
      </div>

      {/* Emotional Context Summary */}
      {emotionalContext.currentEmotions.length > 0 && (
        <div className="px-4 py-3 bg-white/30 border-b border-purple-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-800">Emotionell kontext</span>
            {getTrendIcon()}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {emotionalContext.currentEmotions.slice(0, 6).map((emotion, index) => (
              <span key={index} className="text-lg">{emotion}</span>
            ))}
          </div>
          <div className="text-xs text-purple-700">
            <div className="mb-1">
              <strong>Känsla:</strong> {emotionalContext.conversationMood}
            </div>
            {emotionalContext.userNeeds.length > 0 && (
              <div>
                <strong>Behov:</strong> {emotionalContext.userNeeds.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Reflections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {reflections.length === 0 && !isReflecting && (
          <div className="text-center text-purple-400 text-sm py-8">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Börja skriva så reflekterar AI:n över dina tankar...</p>
          </div>
        )}

        {reflections.map((reflection) => (
          <div
            key={reflection.id}
            className="bg-white/70 rounded-lg p-3 shadow-sm border border-purple-100 animate-fade-in"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex space-x-1">
                {reflection.emotions.map((emotion, index) => (
                  <span key={index} className="text-lg">{emotion}</span>
                ))}
              </div>
              <span className="text-xs text-purple-500 font-medium">
                {reflection.emotionalState}
              </span>
            </div>
            <p className="text-sm text-purple-900 leading-relaxed">
              {reflection.content}
            </p>
            <p className="text-xs text-purple-500 mt-2">
              {reflection.timestamp.toLocaleTimeString('sv-SE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ))}

        {isReflecting && (
          <div className="bg-white/70 rounded-lg p-3 shadow-sm border border-purple-100">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-xs text-purple-600">Reflekterar...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};