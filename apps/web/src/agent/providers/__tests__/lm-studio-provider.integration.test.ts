/**
 * LMStudioProvider Integration Tests
 * Tests against a real LM Studio instance
 *
 * Run with: INTEGRATION_TEST=1 bun run test
 * Requires LM Studio running at localhost:1234 with a model loaded
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LMStudioProvider } from '../lm-studio-provider';
import { getAllTools } from '../../tools';

const SKIP_INTEGRATION = !process.env.INTEGRATION_TEST;

describe.skipIf(SKIP_INTEGRATION)('LMStudioProvider Integration', () => {
  let provider: LMStudioProvider;

  beforeAll(async () => {
    provider = new LMStudioProvider(
      process.env.NEXT_PUBLIC_LM_STUDIO_URL ?? 'http://localhost:1234/v1',
      process.env.NEXT_PUBLIC_LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-8b'
    );

    // Verify LM Studio is available
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(
        'LM Studio is not available. Please start LM Studio and load a model.'
      );
    }
  });

  describe('isAvailable', () => {
    it('should return true when LM Studio is running', async () => {
      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('chat - basic responses', () => {
    it('should return a text response for simple question', async () => {
      const response = await provider.chat({
        messages: [
          { role: 'user', content: 'Say "hello" and nothing else.' },
        ],
        tools: [],
      });

      expect(response.content).toBeDefined();
      expect(response.content?.toLowerCase()).toContain('hello');
      expect(response.toolCalls).toEqual([]);
      expect(response.finishReason).toBe('stop');
    }, 30000);

    it('should handle Chinese language input', async () => {
      const response = await provider.chat({
        messages: [
          { role: 'user', content: '用中文说"你好"，不要说其他的。' },
        ],
        tools: [],
      });

      expect(response.content).toBeDefined();
      expect(response.content).toContain('你好');
      expect(response.finishReason).toBe('stop');
    }, 30000);
  });

  describe('chat - tool calling', () => {
    const toolDefinitions = getAllTools().slice(0, 5).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    it('should call split_at_playhead tool when asked to split', async () => {
      const response = await provider.chat({
        messages: [
          {
            role: 'system',
            content: 'You are a video editor assistant. Use tools to help users edit videos.',
          },
          { role: 'user', content: 'Split the video at the current position' },
        ],
        tools: toolDefinitions,
      });

      // Model should either call a tool or respond with text
      if (response.toolCalls.length > 0) {
        expect(response.finishReason).toBe('tool_calls');
        const toolNames = response.toolCalls.map((tc) => tc.name);
        // Should call split-related tool
        expect(
          toolNames.some((name) => name.includes('split'))
        ).toBe(true);
      } else {
        // Some models may not call tools, just verify response is valid
        expect(response.content).toBeDefined();
      }
    }, 30000);

    it('should call delete_selected tool when asked to delete', async () => {
      const response = await provider.chat({
        messages: [
          {
            role: 'system',
            content: 'You are a video editor assistant. Use tools to help users edit videos.',
          },
          { role: 'user', content: 'Delete the selected clips' },
        ],
        tools: toolDefinitions,
      });

      if (response.toolCalls.length > 0) {
        expect(response.finishReason).toBe('tool_calls');
        const toolNames = response.toolCalls.map((tc) => tc.name);
        expect(
          toolNames.some((name) => name.includes('delete'))
        ).toBe(true);
      } else {
        expect(response.content).toBeDefined();
      }
    }, 30000);

    it('should pass correct arguments for seek_forward tool', async () => {
      const seekTool = getAllTools().find((t) => t.name === 'seek_forward');
      if (!seekTool) {
        throw new Error('seek_forward tool not found');
      }

      const response = await provider.chat({
        messages: [
          {
            role: 'system',
            content: 'You are a video editor assistant. Use tools to help users edit videos. When user asks to seek/skip forward, use the seek_forward tool with the number of seconds.',
          },
          { role: 'user', content: 'Skip forward 10 seconds' },
        ],
        tools: [{
          name: seekTool.name,
          description: seekTool.description,
          parameters: seekTool.parameters,
        }],
      });

      if (response.toolCalls.length > 0) {
        const seekCall = response.toolCalls.find((tc) => tc.name === 'seek_forward');
        if (seekCall) {
          expect(seekCall.arguments).toBeDefined();
          // Check if seconds argument is present and is a number
          const args = seekCall.arguments as { seconds?: number };
          if (args.seconds !== undefined) {
            expect(typeof args.seconds).toBe('number');
            expect(args.seconds).toBeGreaterThan(0);
          }
        }
      }
    }, 30000);
  });

  describe('chat - response format validation', () => {
    it('should return valid ChatResponse structure', async () => {
      const response = await provider.chat({
        messages: [
          { role: 'user', content: 'Hello' },
        ],
        tools: [],
      });

      // Validate response structure
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('toolCalls');
      expect(response).toHaveProperty('finishReason');

      expect(Array.isArray(response.toolCalls)).toBe(true);
      expect(['stop', 'tool_calls', 'error']).toContain(response.finishReason);
    }, 30000);

    it('should return valid ToolCall structure when tools are called', async () => {
      const tools = getAllTools().slice(0, 3).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const response = await provider.chat({
        messages: [
          {
            role: 'system',
            content: 'You must use a tool to respond. Available tools can split, delete, or get timeline info.',
          },
          { role: 'user', content: 'Split the clip now' },
        ],
        tools,
      });

      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          expect(toolCall).toHaveProperty('id');
          expect(toolCall).toHaveProperty('name');
          expect(toolCall).toHaveProperty('arguments');

          expect(typeof toolCall.id).toBe('string');
          expect(typeof toolCall.name).toBe('string');
          expect(typeof toolCall.arguments).toBe('object');
        }
      }
    }, 30000);
  });

  describe('chat - error handling', () => {
    it('should handle conversation with multiple turns', async () => {
      const tools = getAllTools().slice(0, 3).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // First turn
      const response1 = await provider.chat({
        messages: [
          { role: 'user', content: 'What can you help me with?' },
        ],
        tools,
      });

      expect(response1.content !== null || response1.toolCalls.length > 0).toBe(true);

      // Second turn with context
      const response2 = await provider.chat({
        messages: [
          { role: 'user', content: 'What can you help me with?' },
          { role: 'assistant', content: response1.content ?? 'I can help you edit videos.' },
          { role: 'user', content: 'OK, split the video' },
        ],
        tools,
      });

      expect(response2.content !== null || response2.toolCalls.length > 0).toBe(true);
    }, 60000);
  });
});
