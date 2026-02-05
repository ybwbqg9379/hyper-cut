import type {
  Message,
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
  private readonly requestTimeoutMs = 15000;

  constructor(
    baseUrl = 'http://localhost:1234/v1',
    model = 'qwen/qwen3-vl-8b'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs
    );

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: params.messages.map((message) =>
            mapMessageToOpenAIFormat(message)
          ),
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
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LM Studio request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

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
      choice.message?.tool_calls?.map((tc: OpenAIToolCall) => {
        let parsedArgs: Record<string, unknown> = {};
        if (tc.function.arguments) {
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = {};
          }
        }

        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        };
      }) ?? [];

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

interface OpenAICompatibleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

function mapMessageToOpenAIFormat(message: Message): OpenAICompatibleMessage {
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: message.role,
      content: message.content ?? null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      })),
    };
  }

  if (message.role === 'tool') {
    return {
      role: message.role,
      content: message.content ?? null,
      tool_call_id: message.toolCallId,
      name: message.name,
    };
  }

  return {
    role: message.role,
    content: message.content ?? null,
  };
}
