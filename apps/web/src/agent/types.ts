/**
 * Agent Module Types
 * Core type definitions for the Agentic Video Editing system
 */

// ============================================================================
// LLM Provider Types
// ============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCallId?: string;
  name?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatParams {
  messages: Message[];
  tools: ToolDefinition[];
  temperature?: number;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'error';
}

export interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Agent Tool Types
// ============================================================================

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

// ============================================================================
// Agent Response Types
// ============================================================================

export interface AgentResponse {
  message: string;
  toolCalls?: Array<{
    name: string;
    result: ToolResult;
  }>;
  success: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

export type ProviderType = 'lm-studio' | 'gemini';

export interface AgentConfig {
  provider: ProviderType;
  lmStudioUrl?: string;
  geminiApiKey?: string;
  systemPrompt?: string;
}

export interface AgentOrchestratorOptions {
  systemPrompt?: string;
  maxHistoryMessages?: number;
  maxToolIterations?: number;
  toolTimeoutMs?: number;
  debug?: boolean;
  config?: Partial<AgentConfig>;
}
