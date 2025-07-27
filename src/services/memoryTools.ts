import { VectorMemoryService, MemoryEntry } from './vectorMemory';

export interface MemoryTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

export class MemoryToolService {
  static getAvailableTools(): MemoryTool[] {
    return [
      {
        name: 'save_memory',
        description: 'Spara viktig information till långtidsminnet. Använd för att komma ihåg användarens preferenser, viktiga fakta, eller insikter från konversationen.',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Innehållet som ska sparas i minnet'
            },
            type: {
              type: 'string',
              enum: ['conversation', 'reflection', 'insight', 'preference', 'fact'],
              description: 'Typ av minne: conversation (samtal), reflection (reflektion), insight (insikt), preference (preferens), fact (fakta)'
            },
            importance: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Hur viktigt detta minne är (0-1, där 1 är mycket viktigt)'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Taggar för att kategorisera minnet'
            },
            context: {
              type: 'string',
              description: 'Valfri kontext eller bakgrund för minnet'
            }
          },
          required: ['content', 'type']
        },
        execute: async (params) => {
          const { content, type, importance = 0.5, tags = [], context } = params;
          const id = await VectorMemoryService.saveMemory(content, type, importance, tags, context);
          return {
            success: true,
            id,
            message: `Minne sparat med ID: ${id}`
          };
        }
      },
      {
        name: 'search_memory',
        description: 'Sök i långtidsminnet efter relevant information baserat på en fråga eller ämne.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Sökfråga för att hitta relevanta minnen'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 20,
              default: 5,
              description: 'Maximalt antal resultat att returnera'
            },
            type_filter: {
              type: 'string',
              enum: ['conversation', 'reflection', 'insight', 'preference', 'fact'],
              description: 'Filtrera resultat efter typ av minne'
            },
            min_similarity: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.3,
              description: 'Minimum likhet för att inkludera resultat (0-1)'
            }
          },
          required: ['query']
        },
        execute: async (params) => {
          const { query, limit = 5, type_filter, min_similarity = 0.3 } = params;
          const results = await VectorMemoryService.searchMemories(query, limit, min_similarity, type_filter);
          
          return {
            success: true,
            results: results.map(result => ({
              id: result.entry.id,
              content: result.entry.content,
              similarity: result.similarity,
              type: result.entry.metadata.type,
              importance: result.entry.metadata.importance,
              timestamp: result.entry.metadata.timestamp,
              tags: result.entry.metadata.tags,
              context: result.entry.metadata.context
            })),
            message: `Hittade ${results.length} relevanta minnen`
          };
        }
      },
      {
        name: 'get_memory_stats',
        description: 'Få statistik över det sparade minnet - hur många minnen som finns, typer, etc.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        execute: async () => {
          const stats = VectorMemoryService.getMemoryStats();
          return {
            success: true,
            stats,
            message: `Totalt ${stats.totalEntries} minnen sparade`
          };
        }
      },
      {
        name: 'delete_memory',
        description: 'Ta bort ett specifikt minne från långtidsminnet.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID för minnet som ska tas bort'
            }
          },
          required: ['id']
        },
        execute: async (params) => {
          const { id } = params;
          const success = VectorMemoryService.deleteMemory(id);
          return {
            success,
            message: success ? `Minne ${id} borttaget` : `Kunde inte hitta minne ${id}`
          };
        }
      }
    ];
  }

  static async executeTool(toolName: string, parameters: any): Promise<any> {
    const tools = this.getAvailableTools();
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Okänt verktyg: ${toolName}`);
    }

    try {
      return await tool.execute(parameters);
    } catch (error) {
      console.error(`❌ Tool execution failed for ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Okänt fel',
        message: `Fel vid körning av verktyg ${toolName}`
      };
    }
  }

  static getToolsForPrompt(): string {
    const tools = this.getAvailableTools();
    return `TILLGÄNGLIGA MINNESVERKTYG:

${tools.map(tool => `
**${tool.name}**
${tool.description}

Parametrar: ${JSON.stringify(tool.parameters, null, 2)}
`).join('\n')}

För att använda ett verktyg, svara med JSON i detta format:
{
  "tool_call": {
    "name": "verktygsnamn",
    "parameters": { ... }
  },
  "message": "Ditt vanliga svar till användaren"
}

KRITISKT: Använd STRIKT VALID JSON:
- Inga kommentarer (// eller /* */)
- Alla egenskapsnamn i dubbla citattecken
- Inga extra tecken utanför JSON-strukturen
- Inga markdown-kodblock

ANVÄND MINNESVERKTYGEN OFTA! Spara nästan allt användaren berättar om sig själva.

Exempel:
{
  "tool_call": {
    "name": "save_memory",
    "parameters": {
      "content": "Användaren gillar kaffe på morgonen",
      "type": "preference",
      "importance": 0.7,
      "tags": ["kaffe", "morgon", "preferens"]
    }
  },
  "message": "Jag kommer ihåg att du gillar kaffe på morgonen! Det har jag sparat i mitt minne."
}

SPARA MINNEN FÖR:
- Allt användaren berättar om sig själv
- Preferenser och åsikter
- Viktiga händelser
- Känslomässiga reaktioner
- Personliga mål och drömmar
- Problem de arbetar med

Var generös med att spara - det är bättre att spara för mycket än för lite!`;
  }
}