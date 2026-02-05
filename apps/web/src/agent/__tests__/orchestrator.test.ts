/**
 * AgentOrchestrator Tests
 * Verifies tool-call loop behavior and system prompt overrides
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentTool, LLMProvider } from '../types';
import { AgentOrchestrator } from '../orchestrator';

vi.mock('../providers', () => ({
  createProvider: vi.fn(),
  getConfiguredProviderType: vi.fn(() => 'lm-studio'),
}));

import { createProvider } from '../providers';

describe('AgentOrchestrator', () => {
  const buildProvider = () => {
    const provider: LLMProvider = {
      name: 'mock-provider',
      chat: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    };
    return provider;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute tool calls and return final response', async () => {
    const provider = buildProvider();
    const toolExecute = vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
    });

    (provider.chat as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'call-1', name: 'test_tool', arguments: { value: 1 } },
        ],
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '已完成',
        toolCalls: [],
        finishReason: 'stop',
      });

    (createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

    const tools: AgentTool[] = [
      {
        name: 'test_tool',
        description: 'test tool',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: toolExecute,
      },
    ];

    const orchestrator = new AgentOrchestrator(tools, {
      systemPrompt: 'CUSTOM',
      maxToolIterations: 3,
    });

    const result = await orchestrator.process('do it');

    expect(toolExecute).toHaveBeenCalledWith({ value: 1 });
    expect(provider.chat).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.message).toBe('已完成');
    expect(result.toolCalls?.length).toBe(1);
  });

  it('should stop after max tool iterations', async () => {
    const provider = buildProvider();
    const toolExecute = vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
    });

    (provider.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: null,
      toolCalls: [
        { id: 'call-1', name: 'test_tool', arguments: { value: 1 } },
      ],
      finishReason: 'tool_calls',
    });

    (createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

    const tools: AgentTool[] = [
      {
        name: 'test_tool',
        description: 'test tool',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: toolExecute,
      },
    ];

    const orchestrator = new AgentOrchestrator(tools, {
      maxToolIterations: 1,
    });

    const result = await orchestrator.process('do it');

    expect(result.success).toBe(false);
    expect(result.message).toContain('工具调用次数已达上限');
    expect(toolExecute).toHaveBeenCalledTimes(1);
  });

  it('should use custom system prompt', async () => {
    const provider = buildProvider();

    (provider.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'ok',
      toolCalls: [],
      finishReason: 'stop',
    });

    (createProvider as ReturnType<typeof vi.fn>).mockReturnValue(provider);

    const orchestrator = new AgentOrchestrator([], {
      systemPrompt: 'CUSTOM-SYSTEM',
    });

    await orchestrator.process('hi');

    const firstCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const firstMessages = firstCall?.[0]?.messages ?? [];
    expect(firstMessages[0]?.content).toBe('CUSTOM-SYSTEM');
  });
});
