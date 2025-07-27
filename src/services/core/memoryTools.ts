export class MemoryToolsAPI {
  static getMemoryToolsForAPI() {
    return [
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: 'Spara viktig information till långtidsminnet',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Innehållet som ska sparas' },
              type: { 
                type: 'string', 
                enum: ['conversation', 'reflection', 'insight', 'preference', 'fact'],
                description: 'Typ av minne'
              },
              importance: { type: 'number', minimum: 0, maximum: 1, description: 'Viktighet 0-1', default: 0.5 },
              tags: { type: 'array', items: { type: 'string' }, description: 'Taggar' }
            },
            required: ['content', 'type']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_memory',
          description: 'Sök i långtidsminnet',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Sökfråga' },
              limit: { type: 'number', default: 5, description: 'Max antal resultat' },
              type_filter: { 
                type: 'string', 
                enum: ['conversation', 'reflection', 'insight', 'preference', 'fact'],
                description: 'Filtrera efter typ'
              }
            },
            required: ['query']
          }
        }
      }
    ];
  }

  static async executeMemoryTool(toolCall: any): Promise<any> {
    const { MemoryToolService } = await import('../memoryTools');
    
    try {
      const result = await MemoryToolService.executeTool(
        toolCall.function.name,
        toolCall.function.arguments
      );
      
      console.log('🧠 Memory tool executed:', {
        tool: toolCall.function.name,
        success: result.success,
        message: result.message
      });
      
      return result;
    } catch (error) {
      console.error('❌ Memory tool execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Failed to execute ${toolCall.function.name}`
      };
    }
  }
}