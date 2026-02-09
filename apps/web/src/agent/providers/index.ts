import type {
	AgentConfig,
	ChatParams,
	ChatResponse,
	LLMProvider,
	ProviderChatOptions,
	ProviderType,
} from "../types";
import { LMStudioProvider } from "./lm-studio-provider";
import { GeminiProvider } from "./gemini-provider";
import { parseEnvNumber } from "../utils/values";
import { resolveProviderRoute, type ProviderTaskType } from "./router";

/**
 * Create an LLM provider instance based on configuration
 */
export function createProvider(
	type: ProviderType,
	config?: Partial<AgentConfig>,
): LLMProvider {
	switch (type) {
		case "lm-studio": {
			const lmConfig = config?.lmStudio ?? {};
			return new LMStudioProvider({
				url:
					lmConfig.url ??
					config?.lmStudioUrl ??
					process.env.NEXT_PUBLIC_LM_STUDIO_URL,
				model:
					lmConfig.model ??
					config?.lmStudioModel ??
					process.env.NEXT_PUBLIC_LM_STUDIO_MODEL,
				timeoutMs:
					lmConfig.timeoutMs ??
					config?.lmStudioTimeoutMs ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TIMEOUT_MS),
				maxTokens:
					lmConfig.maxTokens ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_MAX_TOKENS),
				temperature:
					lmConfig.temperature ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TEMPERATURE),
				topP:
					lmConfig.topP ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TOP_P),
				topK:
					lmConfig.topK ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_TOP_K),
				repeatPenalty:
					lmConfig.repeatPenalty ??
					parseEnvNumber(process.env.NEXT_PUBLIC_LM_STUDIO_REPEAT_PENALTY),
				stop: lmConfig.stop,
			});
		}
		case "gemini":
			return new GeminiProvider(
				config?.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
			);
		default:
			throw new Error(`Unknown provider type: ${type}`);
	}
}

class RoutedProvider implements LLMProvider {
	name: string;
	private taskType: ProviderTaskType;
	private config?: Partial<AgentConfig>;
	private providerCache = new Map<ProviderType, LLMProvider>();

	constructor({
		taskType,
		config,
	}: {
		taskType: ProviderTaskType;
		config?: Partial<AgentConfig>;
	}) {
		this.taskType = taskType;
		this.config = config;
		this.name = `provider-router:${taskType}`;
	}

	private getProvider(type: ProviderType): LLMProvider {
		const existing = this.providerCache.get(type);
		if (existing) return existing;
		const created = createProvider(type, this.config);
		this.providerCache.set(type, created);
		return created;
	}

	private getRouteProviders(): Array<{
		type: ProviderType;
		provider: LLMProvider;
	}> {
		const route = resolveProviderRoute({
			taskType: this.taskType,
			config: this.config,
		});
		return route.providerOrder.map((type) => ({
			type,
			provider: this.getProvider(type),
		}));
	}

	async chat(
		params: ChatParams,
		options?: ProviderChatOptions,
	): Promise<ChatResponse> {
		const routeProviders = this.getRouteProviders();
		const errors: string[] = [];

		for (const { type, provider } of routeProviders) {
			const available = await provider.isAvailable();
			if (!available) {
				errors.push(`${type}: unavailable`);
				continue;
			}
			try {
				return await provider.chat(params, options);
			} catch (error) {
				errors.push(
					`${type}: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}

		throw new Error(
			`No provider route available for ${this.taskType}. ${errors.join(" | ")}`,
		);
	}

	async isAvailable(): Promise<boolean> {
		for (const { provider } of this.getRouteProviders()) {
			if (await provider.isAvailable()) {
				return true;
			}
		}
		return false;
	}
}

export function createRoutedProvider({
	taskType,
	config,
}: {
	taskType: ProviderTaskType;
	config?: Partial<AgentConfig>;
}): LLMProvider {
	return new RoutedProvider({ taskType, config });
}

/**
 * Get the configured provider type from environment
 */
export function getConfiguredProviderType(
	config?: Partial<AgentConfig>,
): ProviderType {
	if (config?.provider) {
		return config.provider;
	}
	const envProvider = process.env.NEXT_PUBLIC_LLM_PROVIDER;
	if (envProvider === "gemini") {
		return "gemini";
	}
	return "lm-studio"; // Default to LM Studio for MVP
}

export { resolveProviderRoute, resolveProviderPrivacyMode } from "./router";
export type { ProviderTaskType } from "./router";
