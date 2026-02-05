import type {
  AgentTool,
  AgentResponse,
  LLMProvider,
  Message,
  ToolDefinition,
  ToolResult,
} from './types';
import { createProvider, getConfiguredProviderType } from './providers';

/**
 * System prompt for the video editing agent
 */
const SYSTEM_PROMPT = `You are an AI assistant for HyperCut video editor. You help users edit videos by understanding their natural language commands and executing the appropriate editing tools.

Available capabilities:
- Timeline editing: split clips, delete selections, move/trim/resize elements, track management
- Text: generate captions, update text styles, insert text
- Transform: update element position/scale/rotation/opacity
- Audio cleanup: remove silence segments
- Playback control: play, pause, seek to specific times, volume/mute
- Selection control: select/clear specific elements
- Project: update project settings, export the project to video
- Query information: get timeline info, current position, selected elements

When the user asks you to do something:
1. Understand their intent
2. Call the appropriate tool(s) with correct parameters
3. Confirm what you did in a concise response

Always be helpful and explain what actions you're taking.`;

const MAX_HISTORY_MESSAGES = 30;

/**
 * AgentOrchestrator
 * Core orchestration layer that connects user input → LLM → Tools → EditorCore
 */
export class AgentOrchestrator {
  private provider: LLMProvider;
  private tools: Map<string, AgentTool> = new Map();
  private conversationHistory: Message[] = [];

  constructor(tools: AgentTool[] = []) {
    this.provider = createProvider(getConfiguredProviderType());
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Register a tool that can be called by the agent
   */
  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  private appendHistory(message: Message): void {
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > MAX_HISTORY_MESSAGES) {
      this.conversationHistory.splice(
        0,
        this.conversationHistory.length - MAX_HISTORY_MESSAGES
      );
    }
  }

  /**
   * Get all registered tools as definitions for the LLM
   */
  private getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Process a user message and return the agent's response
   */
  async process(userMessage: string): Promise<AgentResponse> {
    // Add user message to history
    this.appendHistory({
      role: 'user',
      content: userMessage,
    });

    // Build messages with system prompt
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversationHistory,
    ];

    try {
      // Check if provider is available
      const isAvailable = await this.provider.isAvailable();
      if (!isAvailable) {
        return {
          message: `LLM provider (${this.provider.name}) is not available. Please ensure LM Studio is running.`,
          success: false,
        };
      }

      // Call LLM
      const response = await this.provider.chat({
        messages,
        tools: this.getToolDefinitions(),
      });

      // Handle tool calls if any
      const executedTools: Array<{ name: string; result: ToolResult }> = [];
      
      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const tool = this.tools.get(toolCall.name);
          if (tool) {
            const result = await tool.execute(toolCall.arguments);
            executedTools.push({ name: toolCall.name, result });

            // Add tool result to history for context
            this.appendHistory({
              role: 'tool',
              content: JSON.stringify(result),
              toolCallId: toolCall.id,
              name: toolCall.name,
            });
          }
        }
      }

      // Build response message
      let responseMessage = response.content ?? '';
      if (executedTools.length > 0 && !responseMessage) {
        responseMessage = executedTools
          .map((t) => `${t.name}: ${t.result.message}`)
          .join('\n');
      }

      // Add assistant response to history
      this.appendHistory({
        role: 'assistant',
        content: responseMessage,
      });

      return {
        message: responseMessage,
        toolCalls: executedTools.length > 0 ? executedTools : undefined,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        message: `Error processing request: ${errorMessage}`,
        success: false,
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Check if the LLM provider is available
   */
  async checkProviderStatus(): Promise<{
    available: boolean;
    provider: string;
  }> {
    const available = await this.provider.isAvailable();
    return { available, provider: this.provider.name };
  }
}
