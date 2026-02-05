import type {
  LLMProvider,
  ChatParams,
  ChatResponse,
  ToolCall,
} from '../types';

/**
 * LM Studio Provider
 * Uses OpenAI-compatible API
 * Current model: Qwen3 VL 8B (qwen/qwen3-vl-8b)
 */
export class LMStudioProvider implements LLMProvider {
  name = 'lm-studio';
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl = 'http://localhost:1234/v1',
    model = 'qwen/qwen3-vl-8b'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: params.messages,
        tools: params.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        temperature: params.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  private parseResponse(data: OpenAICompatibleResponse): ChatResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
      };
    }

    const toolCalls: ToolCall[] =
      choice.message?.tool_calls?.map((tc: OpenAIToolCall) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      })) ?? [];

    return {
      content: choice.message?.content ?? null,
      toolCalls,
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// OpenAI-compatible response types
interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string;
  }>;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
