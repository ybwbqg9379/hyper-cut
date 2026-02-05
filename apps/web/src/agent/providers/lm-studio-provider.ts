import type {
	ContentPart,
	Message,
	LLMProvider,
	ChatParams,
	ChatResponse,
	ToolCall,
} from "../types";

export interface LMStudioProviderOptions {
	url?: string;
	model?: string;
	timeoutMs?: number;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
	repeatPenalty?: number;
	stop?: string[];
}

const DEFAULT_OPTIONS: Required<Omit<LMStudioProviderOptions, "stop">> & {
	stop?: string[];
} = {
	url: "http://localhost:1234/v1",
	model: "qwen/qwen3-vl-8b",
	timeoutMs: 120000,
	maxTokens: 4096,
	temperature: 0.7,
	topP: 0.9,
	topK: 40,
	repeatPenalty: 1.1,
	stop: undefined,
};

/**
 * LM Studio Provider
 * Uses OpenAI-compatible API
 * Current model: Qwen3 VL 8B (qwen/qwen3-vl-8b)
 */
export class LMStudioProvider implements LLMProvider {
	name = "lm-studio";
	private options: typeof DEFAULT_OPTIONS;

	constructor(options?: LMStudioProviderOptions);
	/** @deprecated Use constructor with options object instead */
	constructor(baseUrl?: string, model?: string, timeoutMs?: number);
	constructor(
		optionsOrBaseUrl: LMStudioProviderOptions | string = {},
		model?: string,
		timeoutMs?: number,
	) {
		const normalizedOptions =
			typeof optionsOrBaseUrl === "string"
				? { url: optionsOrBaseUrl, model, timeoutMs }
				: optionsOrBaseUrl;
		this.options = { ...DEFAULT_OPTIONS, ...normalizedOptions };
	}

	/** @deprecated Use constructor with options object instead */
	static fromLegacyParams(
		baseUrl?: string,
		model?: string,
		timeoutMs?: number,
	): LMStudioProvider {
		return new LMStudioProvider({
			url: baseUrl,
			model: model,
			timeoutMs: timeoutMs,
		});
	}

	async chat(params: ChatParams): Promise<ChatResponse> {
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			this.options.timeoutMs,
		);

		const requestBody: Record<string, unknown> = {
			model: this.options.model,
			messages: params.messages.map((message) =>
				mapMessageToOpenAIFormat(message),
			),
			tools: params.tools.map((t) => ({
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			})),
			max_tokens: this.options.maxTokens,
			temperature: params.temperature ?? this.options.temperature,
			top_p: this.options.topP,
			top_k: this.options.topK,
			repeat_penalty: this.options.repeatPenalty,
		};

		if (this.options.stop?.length) {
			requestBody.stop = this.options.stop;
		}

		let response: Response;
		try {
			response = await fetch(`${this.options.url}/chat/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error("LM Studio request timed out");
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
				finishReason: "error",
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
			content: normalizeOpenAIResponseContent(choice.message?.content),
			toolCalls,
			finishReason:
				choice.finish_reason === "tool_calls" ? "tool_calls" : "stop",
		};
	}

	async isAvailable(): Promise<boolean> {
		try {
			const res = await fetch(`${this.options.url}/models`, {
				method: "GET",
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
			content?: OpenAICompatibleContent | null;
			tool_calls?: OpenAIToolCall[];
		};
		finish_reason?: string;
	}>;
}

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAICompatibleMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: OpenAICompatibleContent | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	name?: string;
}

type OpenAICompatibleContent =
	| string
	| Array<
			| {
					type: "text";
					text: string;
			  }
			| {
					type: "image_url";
					image_url: {
						url: string;
					};
			  }
	  >;

function isContentParts(content: Message["content"]): content is ContentPart[] {
	return Array.isArray(content);
}

function toOpenAIContentParts(
	contentParts: ContentPart[],
): OpenAICompatibleContent {
	return contentParts.map((part) => {
		if (part.type === "text") {
			return {
				type: "text" as const,
				text: part.text,
			};
		}
		return {
			type: "image_url" as const,
			image_url: {
				url: part.image_url.url,
			},
		};
	});
}

function contentPartsToPlainText(contentParts: ContentPart[]): string {
	return contentParts
		.map((part) => {
			if (part.type === "text") {
				return part.text;
			}
			return `[image: ${part.image_url.url.slice(0, 32)}...]`;
		})
		.join("\n")
		.trim();
}

function normalizeOpenAIResponseContent(
	content: OpenAICompatibleContent | null | undefined,
): string | null {
	if (!content) {
		return null;
	}

	if (typeof content === "string") {
		return content;
	}

	const text = content
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("")
		.trim();
	return text || null;
}

function mapMessageToOpenAIFormat(message: Message): OpenAICompatibleMessage {
	const normalizedContent: OpenAICompatibleContent | null = isContentParts(
		message.content,
	)
		? toOpenAIContentParts(message.content)
		: (message.content ?? null);

	if (message.role === "assistant" && message.toolCalls?.length) {
		const contentForToolCallMessage = isContentParts(message.content)
			? contentPartsToPlainText(message.content) || null
			: (message.content ?? null);
		return {
			role: message.role,
			content: contentForToolCallMessage,
			tool_calls: message.toolCalls.map((call) => ({
				id: call.id,
				type: "function",
				function: {
					name: call.name,
					arguments:
						typeof call.arguments === "string"
							? call.arguments
							: JSON.stringify(call.arguments ?? {}),
				},
			})),
		};
	}

	if (message.role === "tool") {
		const toolContent = isContentParts(message.content)
			? contentPartsToPlainText(message.content)
			: (message.content ?? null);
		return {
			role: message.role,
			content: toolContent,
			tool_call_id: message.toolCallId,
			name: message.name,
		};
	}

	return {
		role: message.role,
		content: normalizedContent,
	};
}
