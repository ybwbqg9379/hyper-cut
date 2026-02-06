import type {
	ChatParams,
	ChatResponse,
	ContentPart,
	LLMProvider,
	Message,
	ToolCall,
} from "../types";

interface GeminiProviderOptions {
	model?: string;
	baseUrl?: string;
	timeoutMs?: number;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 30_000;

interface GeminiPartText {
	text: string;
}

interface GeminiPartInlineData {
	inlineData: {
		mimeType: string;
		data: string;
	};
}

interface GeminiPartFunctionCall {
	functionCall: {
		name: string;
		args?: Record<string, unknown>;
	};
}

type GeminiPart =
	| GeminiPartText
	| GeminiPartInlineData
	| GeminiPartFunctionCall;

interface GeminiContent {
	role: "user" | "model";
	parts: GeminiPart[];
}

interface GeminiResponse {
	candidates?: Array<{
		content?: {
			parts?: GeminiPart[];
		};
		finishReason?: string;
	}>;
}

function parseDataUrl(
	dataUrl: string,
): { mimeType: string; base64: string } | null {
	const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
	if (!match) return null;
	return {
		mimeType: match[1],
		base64: match[2],
	};
}

function normalizeContentPart(part: ContentPart): GeminiPart | null {
	if (part.type === "text") {
		return { text: part.text };
	}

	const parsed = parseDataUrl(part.image_url.url);
	if (!parsed) {
		// Gemini 原生接口更适合 base64 inlineData。若不是 data URL，降级为文本提示。
		return { text: `[image_url] ${part.image_url.url}` };
	}

	return {
		inlineData: {
			mimeType: parsed.mimeType,
			data: parsed.base64,
		},
	};
}

function normalizeMessageContent(content: Message["content"]): GeminiPart[] {
	if (typeof content === "string") {
		return content.trim().length > 0 ? [{ text: content }] : [];
	}
	if (!Array.isArray(content)) return [];
	return content
		.map((part) => normalizeContentPart(part))
		.filter((part): part is GeminiPart => part !== null);
}

function normalizeMessagesForGemini(messages: Message[]): {
	contents: GeminiContent[];
	systemInstruction: string | null;
} {
	const contents: GeminiContent[] = [];
	const systemParts: string[] = [];

	for (const message of messages) {
		if (message.role === "system") {
			const textParts = normalizeMessageContent(message.content)
				.filter((part): part is GeminiPartText => "text" in part)
				.map((part) => part.text)
				.filter((text) => text.trim().length > 0);
			systemParts.push(...textParts);
			continue;
		}

		if (message.role === "tool") {
			const payload =
				typeof message.content === "string"
					? message.content
					: JSON.stringify(message.content ?? null);
			contents.push({
				role: "user",
				parts: [{ text: `[tool:${message.name ?? "unknown"}] ${payload}` }],
			});
			continue;
		}

		const role: GeminiContent["role"] =
			message.role === "assistant" ? "model" : "user";
		const parts = normalizeMessageContent(message.content);
		if (parts.length === 0) continue;
		contents.push({ role, parts });
	}

	return {
		contents,
		systemInstruction: systemParts.length > 0 ? systemParts.join("\n\n") : null,
	};
}

function extractToolCalls(parts: GeminiPart[] | undefined): ToolCall[] {
	if (!parts) return [];
	const calls: ToolCall[] = [];
	for (const part of parts) {
		if (!("functionCall" in part)) continue;
		calls.push({
			id:
				typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
					? crypto.randomUUID()
					: `${Date.now()}-${calls.length + 1}`,
			name: part.functionCall.name,
			arguments: part.functionCall.args ?? {},
		});
	}
	return calls;
}

function extractText(parts: GeminiPart[] | undefined): string | null {
	if (!parts) return null;
	const texts = parts
		.filter((part): part is GeminiPartText => "text" in part)
		.map((part) => part.text.trim())
		.filter((text) => text.length > 0);
	return texts.length > 0 ? texts.join("\n") : null;
}

export class GeminiProvider implements LLMProvider {
	name = "gemini";
	private apiKey: string;
	private options: Required<GeminiProviderOptions>;

	constructor(apiKey: string, options: GeminiProviderOptions = {}) {
		this.apiKey = apiKey;
		this.options = {
			model: options.model ?? DEFAULT_MODEL,
			baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
			timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		};
	}

	async chat(
		params: ChatParams,
		options?: { signal?: AbortSignal },
	): Promise<ChatResponse> {
		if (!this.apiKey) {
			throw new Error("Gemini API key is missing");
		}

		const normalized = normalizeMessagesForGemini(params.messages);
		if (normalized.contents.length === 0) {
			return {
				content: null,
				toolCalls: [],
				finishReason: "stop",
			};
		}

		const body: Record<string, unknown> = {
			contents: normalized.contents,
			generationConfig: {
				temperature: params.temperature ?? 0.7,
			},
		};

		if (normalized.systemInstruction) {
			body.systemInstruction = {
				parts: [{ text: normalized.systemInstruction }],
			};
		}

		if (params.tools.length > 0) {
			body.tools = [
				{
					functionDeclarations: params.tools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						parameters: tool.parameters,
					})),
				},
			];
		}

		const controller = new AbortController();
		let abortedByCaller = false;
		const onCallerAbort = () => {
			abortedByCaller = true;
			controller.abort();
		};
		if (options?.signal) {
			if (options.signal.aborted) {
				onCallerAbort();
			} else {
				options.signal.addEventListener("abort", onCallerAbort, {
					once: true,
				});
			}
		}
		const timeout = setTimeout(
			() => controller.abort(),
			this.options.timeoutMs,
		);

		try {
			const response = await fetch(
				`${this.options.baseUrl}/models/${this.options.model}:generateContent?key=${this.apiKey}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal: controller.signal,
				},
			);

			if (!response.ok) {
				throw new Error(
					`Gemini API error: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as GeminiResponse;
			const candidate = data.candidates?.[0];
			const parts = candidate?.content?.parts;
			const toolCalls = extractToolCalls(parts);
			const content = extractText(parts);

			return {
				content,
				toolCalls,
				finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
			};
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error(
						abortedByCaller ? "Gemini request cancelled" : "Gemini request timed out",
					);
				}
				throw error;
			} finally {
				clearTimeout(timeout);
				if (options?.signal) {
					options.signal.removeEventListener("abort", onCallerAbort);
				}
			}
	}

	async isAvailable(): Promise<boolean> {
		if (!this.apiKey) return false;
		try {
			const response = await fetch(
				`${this.options.baseUrl}/models?key=${this.apiKey}`,
				{
					method: "GET",
					signal: AbortSignal.timeout(3000),
				},
			);
			return response.ok;
		} catch {
			return false;
		}
	}
}
