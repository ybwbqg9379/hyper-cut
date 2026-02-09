import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoutedProvider } from "../index";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
	vi.unstubAllGlobals();
});

describe("routed provider", () => {
	it("should fallback from gemini to lm-studio in cloud-preferred mode", async () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "cloud-preferred";
		process.env.NEXT_PUBLIC_LLM_PROVIDER = "gemini";
		process.env.GEMINI_API_KEY = "test-key";
		process.env.NEXT_PUBLIC_LM_STUDIO_URL = "http://localhost:1234/v1";

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (
				url.includes("generativelanguage.googleapis.com") &&
				url.includes("/models?")
			) {
				return new Response("{}", { status: 503 });
			}
			if (url.endsWith("/models")) {
				return new Response(JSON.stringify({ data: [] }), { status: 200 });
			}
			if (url.endsWith("/chat/completions")) {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: { content: "from-lm" },
								finish_reason: "stop",
							},
						],
					}),
					{ status: 200 },
				);
			}
			return new Response("{}", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const provider = createRoutedProvider({ taskType: "planning" });
		const available = await provider.isAvailable();
		const response = await provider.chat({
			messages: [{ role: "user", content: "hello" }],
			tools: [],
		});

		expect(available).toBe(true);
		expect(response.content).toBe("from-lm");
		expect(fetchMock).toHaveBeenCalled();
	});

	it("should block fallback when privacy mode is local-only", async () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "local-only";
		process.env.NEXT_PUBLIC_LM_STUDIO_URL = "http://localhost:1234/v1";

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/models")) {
				return new Response("{}", { status: 503 });
			}
			return new Response("{}", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const provider = createRoutedProvider({ taskType: "semantic" });
		const available = await provider.isAvailable();

		expect(available).toBe(false);
		await expect(
			provider.chat({
				messages: [{ role: "user", content: "hello" }],
				tools: [],
			}),
		).rejects.toThrow("No provider route available");
	});

	it("should not fallback when request is cancelled", async () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "cloud-preferred";
		process.env.NEXT_PUBLIC_LLM_PROVIDER = "gemini";
		process.env.GEMINI_API_KEY = "test-key";
		process.env.NEXT_PUBLIC_LM_STUDIO_URL = "http://localhost:1234/v1";

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (
				url.includes("generativelanguage.googleapis.com") &&
				url.includes("/models?")
			) {
				return new Response("{}", { status: 200 });
			}
			if (url.includes(":generateContent?key=")) {
				throw new Error("Gemini request cancelled");
			}
			if (url.endsWith("/models")) {
				return new Response(JSON.stringify({ data: [] }), { status: 200 });
			}
			if (url.endsWith("/chat/completions")) {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: { content: "should-not-fallback" },
								finish_reason: "stop",
							},
						],
					}),
					{ status: 200 },
				);
			}
			return new Response("{}", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const provider = createRoutedProvider({ taskType: "planning" });
		await expect(
			provider.chat({
				messages: [{ role: "user", content: "hello" }],
				tools: [],
			}),
		).rejects.toThrow("Gemini request cancelled");

		const lmCalls = fetchMock.mock.calls.filter(([input]) =>
			String(input).endsWith("/chat/completions"),
		);
		expect(lmCalls.length).toBe(0);
	});
});
