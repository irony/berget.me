import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryToolService } from '../../services/memoryTools';

// Mock VectorMemoryService
vi.mock('../../services/vectorMemory', () => ({
  VectorMemoryService: {
    saveMemory: vi.fn().mockResolvedValue('test-id-123'),
    searchMemories: vi.fn().mockResolvedValue([
      {
        entry: {
          id: 'test-id-123',
          content: 'Test memory content',
          metadata: {
            type: 'fact',
            importance: 0.8,
            timestamp: new Date(),
            tags: ['test']
          }
        },
        similarity: 0.9
      }
    ]),
    getMemoryStats: vi.fn().mockReturnValue({
      totalEntries: 5,
      byType: { fact: 3, preference: 2 },
      averageImportance: 0.7
    }),
    deleteMemory: vi.fn().mockReturnValue(true)
  }
}));

describe('MemoryToolService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableTools', () => {
    it('ska returnera alla tillgängliga verktyg', () => {
      const tools = MemoryToolService.getAvailableTools();

      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name)).toEqual([
        'save_memory',
        'search_memory',
        'get_memory_stats',
        'delete_memory'
      ]);
    });

    it('ska ha korrekt struktur för save_memory verktyget', () => {
      const tools = MemoryToolService.getAvailableTools();
      const saveTool = tools.find(t => t.name === 'save_memory');

      expect(saveTool).toBeDefined();
      expect(saveTool?.description).toContain('Spara viktig information');
      expect(saveTool?.parameters.properties.content).toBeDefined();
      expect(saveTool?.parameters.properties.type).toBeDefined();
      expect(saveTool?.parameters.required).toContain('content');
      expect(saveTool?.parameters.required).toContain('type');
    });
  });

  describe('executeTool', () => {
    it('ska köra save_memory verktyget', async () => {
      const result = await MemoryToolService.executeTool('save_memory', {
        content: 'Test content',
        type: 'fact',
        importance: 0.8,
        tags: ['test']
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('test-id-123');
      expect(result.message).toContain('Minne sparat');
    });

    it('ska köra search_memory verktyget', async () => {
      const result = await MemoryToolService.executeTool('search_memory', {
        query: 'test query',
        limit: 5
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content).toBe('Test memory content');
      expect(result.results[0].similarity).toBe(0.9);
    });

    it('ska köra get_memory_stats verktyget', async () => {
      const result = await MemoryToolService.executeTool('get_memory_stats', {});

      expect(result.success).toBe(true);
      expect(result.stats.totalEntries).toBe(5);
      expect(result.message).toContain('5 minnen sparade');
    });

    it('ska köra delete_memory verktyget', async () => {
      const result = await MemoryToolService.executeTool('delete_memory', {
        id: 'test-id-123'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('borttaget');
    });

    it('ska hantera okända verktyg', async () => {
      await expect(
        MemoryToolService.executeTool('unknown_tool', {})
      ).rejects.toThrow('Okänt verktyg: unknown_tool');
    });
  });

  describe('getToolsForPrompt', () => {
    it('ska returnera formaterad prompt-text', () => {
      const prompt = MemoryToolService.getToolsForPrompt();

      expect(prompt).toContain('TILLGÄNGLIGA MINNESVERKTYG');
      expect(prompt).toContain('save_memory');
      expect(prompt).toContain('search_memory');
      expect(prompt).toContain('ASYNKRON VERKTYGSANVÄNDNING');
      expect(prompt).toContain('SPARA MINNEN FÖR:');
    });
  });
});
