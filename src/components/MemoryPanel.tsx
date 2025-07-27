import React, { useState, useEffect } from 'react';
import { Database, Search, Trash2, Tag, Clock, Star, Zap, Activity } from 'lucide-react';
import { VectorMemoryService, MemoryEntry } from '../services/vectorMemory';
import { VectorDatabase } from '../services/vectorDatabase';
import { ConversationIndexer } from '../services/conversationIndexer';
import { EmbeddingService } from '../services/embeddingService';

interface MemoryPanelProps {
  isVisible: boolean;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isVisible }) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [vectorStats, setVectorStats] = useState<any>(null);
  const [indexerStats, setIndexerStats] = useState<any>(null);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);

  useEffect(() => {
    if (isVisible) {
      loadMemories();
      loadStats();
    }
  }, [isVisible]);

  const loadMemories = () => {
    const allMemories = VectorMemoryService.getAllMemories();
    setMemories(allMemories);
  };

  const loadStats = () => {
    const memoryStats = VectorMemoryService.getMemoryStats();
    setStats(memoryStats);
    
    const vectorDbStats = VectorDatabase.getStats();
    setVectorStats(vectorDbStats);
    
    const convIndexerStats = ConversationIndexer.getStats();
    setIndexerStats(convIndexerStats);
    
    const embeddingCacheStats = EmbeddingService.getCacheStats();
    setEmbeddingStats(embeddingCacheStats);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const results = await VectorMemoryService.searchMemories(
      searchQuery,
      10,
      0.2,
      selectedType === 'all' ? undefined : selectedType as any
    );
    setSearchResults(results);
  };

  const handleDeleteMemory = (id: string) => {
    if (confirm('Är du säker på att du vill ta bort detta minne?')) {
      VectorMemoryService.deleteMemory(id);
      loadMemories();
      loadStats();
      // Remove from search results if present
      setSearchResults(prev => prev.filter(result => result.entry.id !== id));
    }
  };

  const handleClearAllMemories = () => {
    if (confirm('Är du säker på att du vill rensa ALLA minnen och vektordata? Detta kan inte ångras.')) {
      VectorMemoryService.clearAllMemories();
      VectorDatabase.clearIndexVectors();
      EmbeddingService.clearCache();
      ConversationIndexer.clearQueue();
      loadMemories();
      loadStats();
      setSearchResults([]);
    }
  };

  const getTypeColor = (type: string) => {
    const colors = {
      conversation: 'bg-blue-100 text-blue-800',
      reflection: 'bg-purple-100 text-purple-800',
      insight: 'bg-green-100 text-green-800',
      preference: 'bg-yellow-100 text-yellow-800',
      fact: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getImportanceStars = (importance: number) => {
    const stars = Math.round(importance * 5);
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${i < stars ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  if (!isVisible) return null;

  return (
    <div className="w-96 bg-gradient-to-b from-blue-50 to-indigo-50 border-l border-blue-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-blue-200 bg-white/50">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-medium text-blue-900">AI Långtidsminne</h2>
        </div>
        <p className="text-xs text-blue-600 mt-1">Sparade minnen och insikter</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 bg-white/30 border-b border-blue-100">
          <div className="text-xs text-blue-800 space-y-2">
            <div className="flex justify-between">
              <span>Totalt minnen:</span>
              <span className="font-medium">{stats.totalEntries}</span>
            </div>
            {stats.totalEntries > 0 && (
              <div className="flex justify-between">
                <span>Genomsnittlig viktighet:</span>
                <div className="flex space-x-0.5">
                  {getImportanceStars(stats.averageImportance)}
                </div>
              </div>
            )}
            
            {/* Vector Database Stats */}
            {vectorStats && (
              <>
                <div className="border-t border-blue-200 pt-2">
                  <div className="flex items-center space-x-1 mb-1">
                    <Zap className="w-3 h-3" />
                    <span className="font-medium">Vektordatabas</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Index initialiserat:</span>
                    <span className={vectorStats.indexVectorsInitialized ? 'text-green-600' : 'text-red-600'}>
                      {vectorStats.indexVectorsInitialized ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Indexer Stats */}
            {indexerStats && (
              <div className="border-t border-blue-200 pt-2">
                <div className="flex items-center space-x-1 mb-1">
                  <Activity className="w-3 h-3" />
                  <span className="font-medium">Indexering</span>
                </div>
                <div className="flex justify-between">
                  <span>Kö:</span>
                  <span className="font-medium">{indexerStats.queueLength}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={indexerStats.isIndexing ? 'text-yellow-600' : 'text-green-600'}>
                    {indexerStats.isIndexing ? 'Indexerar...' : 'Klar'}
                  </span>
                </div>
              </div>
            )}

            {/* Embedding Cache Stats */}
            {embeddingStats && (
              <div className="border-t border-blue-200 pt-2">
                <div className="flex items-center space-x-1 mb-1">
                  <Database className="w-3 h-3" />
                  <span className="font-medium">Embedding Cache</span>
                </div>
                <div className="flex justify-between">
                  <span>Cachade embeddings:</span>
                  <span className="font-medium">{embeddingStats.size}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-3 border-b border-blue-100">
        <div className="flex space-x-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Sök i minnen..."
            className="flex-1 text-xs px-2 py-1 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleSearch}
            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
          >
            <Search className="w-3 h-3" />
          </button>
        </div>
        <div className="flex space-x-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="flex-1 text-xs px-2 py-1 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="all">Alla typer</option>
            <option value="conversation">Konversation</option>
            <option value="reflection">Reflektion</option>
            <option value="insight">Insikt</option>
            <option value="preference">Preferens</option>
            <option value="fact">Fakta</option>
          </select>
          <button
            onClick={handleClearAllMemories}
            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
            title="Rensa alla minnen"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {searchResults.length > 0 ? (
          <>
            <div className="text-xs text-blue-600 font-medium mb-2">
              Sökresultat ({searchResults.length})
            </div>
            {searchResults.map((result) => (
              <div
                key={result.entry.id}
                className="bg-white/70 rounded-lg p-3 shadow-sm border border-blue-100"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(result.entry.metadata.type)}`}>
                      {result.entry.metadata.type}
                    </span>
                    <div className="flex space-x-0.5">
                      {getImportanceStars(result.entry.metadata.importance)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-blue-600">
                      {Math.round(result.similarity * 100)}%
                    </span>
                    <button
                      onClick={() => handleDeleteMemory(result.entry.id)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-blue-900 mb-2 leading-relaxed">
                  {result.entry.content}
                </p>
                {result.entry.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {result.entry.metadata.tags.map((tag: string, index: number) => (
                      <span key={index} className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                        <Tag className="w-2 h-2 inline mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center text-xs text-blue-500">
                  <Clock className="w-3 h-3 mr-1" />
                  {new Date(result.entry.metadata.timestamp).toLocaleString('sv-SE')}
                </div>
              </div>
            ))}
          </>
        ) : memories.length > 0 ? (
          <>
            <div className="text-xs text-blue-600 font-medium mb-2">
              Alla minnen ({memories.length})
            </div>
            {memories
              .filter(memory => selectedType === 'all' || memory.metadata.type === selectedType)
              .sort((a, b) => b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime())
              .map((memory) => (
                <div
                  key={memory.id}
                  className="bg-white/70 rounded-lg p-3 shadow-sm border border-blue-100"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(memory.metadata.type)}`}>
                        {memory.metadata.type}
                      </span>
                      <div className="flex space-x-0.5">
                        {getImportanceStars(memory.metadata.importance)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMemory(memory.id)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-blue-900 mb-2 leading-relaxed">
                    {memory.content}
                  </p>
                  {memory.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {memory.metadata.tags.map((tag, index) => (
                        <span key={index} className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                          <Tag className="w-2 h-2 inline mr-1" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center text-xs text-blue-500">
                    <Clock className="w-3 h-3 mr-1" />
                    {memory.metadata.timestamp.toLocaleString('sv-SE')}
                  </div>
                </div>
              ))}
          </>
        ) : (
          <div className="text-center text-blue-400 text-sm py-8">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Inga minnen sparade än...</p>
            <p className="text-xs mt-1">AI:n kommer att spara viktiga saker automatiskt</p>
          </div>
        )}
      </div>
    </div>
  );
};
