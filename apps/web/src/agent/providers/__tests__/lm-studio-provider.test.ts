/**
 * LMStudioProvider Unit Tests
 * Tests for response parsing logic without real LM Studio connection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LMStudioProvider } from "../lm-studio-provider";

describe("LMStudioProvider", () => {
	let provider: LMStudioProvider;

	beforeEach(() => {
		provider = new LMStudioProvider("http://localhost:1234/v1", "test-model");
	});

	describe("parseResponse", () => {
		// Access private method for testing
		const callParseResponse = (provider: LMStudioProvider, data: unknown) => {
			return (
				provider as unknown as { parseResponse: (data: unknown) => unknown }
			).parseResponse(data);
		};

		it("should parse normal tool_calls response", () => {
			const response = {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_123",
									type: "function",
									function: {
										name: "split_at_playhead",
										arguments: "{}",
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [
					{
						id: "call_123",
						name: "split_at_playhead",
						arguments: {},
					},
				],
				finishReason: "tool_calls",
			});
		});

		it("should parse tool_calls with JSON arguments", () => {
			const response = {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_456",
									type: "function",
									function: {
										name: "seek_forward",
										arguments: '{"seconds": 5}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [
					{
						id: "call_456",
						name: "seek_forward",
						arguments: { seconds: 5 },
					},
				],
				finishReason: "tool_calls",
			});
		});

		it("should parse text-only response without tool_calls", () => {
			const response = {
				choices: [
					{
						message: {
							content: "I will help you edit the video.",
							tool_calls: undefined,
						},
						finish_reason: "stop",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: "I will help you edit the video.",
				toolCalls: [],
				finishReason: "stop",
			});
		});

		it("should parse multimodal response content array into text", () => {
			const response = {
				choices: [
					{
						message: {
							content: [
								{ type: "text", text: "Scene looks calm. " },
								{
									type: "image_url",
									image_url: { url: "data:image/jpeg;base64,abc" },
								},
								{ type: "text", text: "A person is speaking." },
							],
						},
						finish_reason: "stop",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: "Scene looks calm. A person is speaking.",
				toolCalls: [],
				finishReason: "stop",
			});
		});

		it("should handle malformed JSON in tool arguments gracefully", () => {
			const response = {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_789",
									type: "function",
									function: {
										name: "seek_forward",
										arguments: "{invalid json}",
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [
					{
						id: "call_789",
						name: "seek_forward",
						arguments: {}, // Falls back to empty object
					},
				],
				finishReason: "tool_calls",
			});
		});

		it("should handle empty arguments string", () => {
			const response = {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_empty",
									type: "function",
									function: {
										name: "toggle_play",
										arguments: "",
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [
					{
						id: "call_empty",
						name: "toggle_play",
						arguments: {},
					},
				],
				finishReason: "tool_calls",
			});
		});

		it("should handle empty choices array", () => {
			const response = {
				choices: [],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [],
				finishReason: "error",
			});
		});

		it("should handle null choices", () => {
			const response = {
				choices: null,
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [],
				finishReason: "error",
			});
		});

		it("should handle undefined choices", () => {
			const response = {};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [],
				finishReason: "error",
			});
		});

		it("should handle missing message in choice", () => {
			const response = {
				choices: [
					{
						finish_reason: "stop",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [],
				finishReason: "stop",
			});
		});

		it("should parse multiple tool_calls", () => {
			const response = {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [
								{
									id: "call_1",
									type: "function",
									function: {
										name: "split_at_playhead",
										arguments: "{}",
									},
								},
								{
									id: "call_2",
									type: "function",
									function: {
										name: "delete_selected",
										arguments: "{}",
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: null,
				toolCalls: [
					{ id: "call_1", name: "split_at_playhead", arguments: {} },
					{ id: "call_2", name: "delete_selected", arguments: {} },
				],
				finishReason: "tool_calls",
			});
		});

		it("should handle response with both content and tool_calls", () => {
			const response = {
				choices: [
					{
						message: {
							content: "I will split the clip now.",
							tool_calls: [
								{
									id: "call_mixed",
									type: "function",
									function: {
										name: "split_at_playhead",
										arguments: "{}",
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			};

			const result = callParseResponse(provider, response);

			expect(result).toEqual({
				content: "I will split the clip now.",
				toolCalls: [
					{
						id: "call_mixed",
						name: "split_at_playhead",
						arguments: {},
					},
				],
				finishReason: "tool_calls",
			});
		});
	});

	describe("chat", () => {
		it("should throw timeout error when request is aborted", async () => {
			// Mock fetch to simulate abort error
			const originalFetch = global.fetch;
			const abortError = new Error("Aborted");
			abortError.name = "AbortError";
			global.fetch = vi.fn(() =>
				Promise.reject(abortError),
			) as unknown as typeof fetch;

			await expect(
				provider.chat({
					messages: [{ role: "user", content: "test" }],
					tools: [],
				}),
			).rejects.toThrow("LM Studio request timed out");

			global.fetch = originalFetch;
		});

		it("should throw error on HTTP error response", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					statusText: "Internal Server Error",
				}),
			) as unknown as typeof fetch;

			await expect(
				provider.chat({
					messages: [{ role: "user", content: "test" }],
					tools: [],
				}),
			).rejects.toThrow("LM Studio API error: Internal Server Error");

			global.fetch = originalFetch;
		});

		it("should send multimodal content parts to OpenAI-compatible API", async () => {
			const originalFetch = global.fetch;
			let capturedBody: Record<string, unknown> | null = null;
			global.fetch = vi.fn((_url, init) => {
				const rawBody = typeof init?.body === "string" ? init.body : "{}";
				capturedBody = JSON.parse(rawBody) as Record<string, unknown>;
				return Promise.resolve({
					ok: true,
					json: async () => ({
						choices: [
							{
								message: { content: "ok" },
								finish_reason: "stop",
							},
						],
					}),
				});
			}) as unknown as typeof fetch;

			await provider.chat({
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Describe this frame" },
							{
								type: "image_url",
								image_url: { url: "data:image/jpeg;base64,abc123" },
							},
						],
					},
				],
				tools: [],
			});

			expect(capturedBody).not.toBeNull();
			const requestMessages = (capturedBody as { messages?: unknown } | null)
				?.messages;
			expect(requestMessages).toEqual([
				{
					role: "user",
					content: [
						{ type: "text", text: "Describe this frame" },
						{
							type: "image_url",
							image_url: { url: "data:image/jpeg;base64,abc123" },
						},
					],
				},
			]);

			global.fetch = originalFetch;
		});
	});

	describe("isAvailable", () => {
		it("should return true when LM Studio responds with ok", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn(() =>
				Promise.resolve({ ok: true }),
			) as unknown as typeof fetch;

			const result = await provider.isAvailable();
			expect(result).toBe(true);

			global.fetch = originalFetch;
		});

		it("should return false when LM Studio responds with error", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn(() =>
				Promise.resolve({ ok: false }),
			) as unknown as typeof fetch;

			const result = await provider.isAvailable();
			expect(result).toBe(false);

			global.fetch = originalFetch;
		});

		it("should return false when fetch throws", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn(() =>
				Promise.reject(new Error("Network error")),
			) as unknown as typeof fetch;

			const result = await provider.isAvailable();
			expect(result).toBe(false);

			global.fetch = originalFetch;
		});
	});
});
