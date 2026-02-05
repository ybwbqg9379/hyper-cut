import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../gemini-provider";

describe("GeminiProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("isAvailable should return false without api key", async () => {
		const provider = new GeminiProvider("");
		const available = await provider.isAvailable();
		expect(available).toBe(false);
	});

	it("chat should parse text and function calls", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				candidates: [
					{
						content: {
							parts: [
								{ text: "ok" },
								{
									functionCall: {
										name: "split_at_time",
										args: { time: 12 },
									},
								},
							],
						},
					},
				],
			}),
		}));
		vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

		const provider = new GeminiProvider("test-key");
		const result = await provider.chat({
			messages: [{ role: "user", content: "hello" }],
			tools: [
				{
					name: "split_at_time",
					description: "split",
					parameters: {
						type: "object",
						properties: {
							time: { type: "number" },
						},
						required: ["time"],
					},
				},
			],
		});

		expect(result.content).toBe("ok");
		expect(result.finishReason).toBe("tool_calls");
		expect(result.toolCalls[0]?.name).toBe("split_at_time");
		expect(result.toolCalls[0]?.arguments).toEqual({ time: 12 });
	});
});
