import type { AgentConfig, ProviderPrivacyMode, ProviderType } from "../types";

export type ProviderTaskType = "planning" | "semantic" | "vision";

export interface ProviderRouteDecision {
	taskType: ProviderTaskType;
	privacyMode: ProviderPrivacyMode;
	providerOrder: ProviderType[];
}

function normalizePrivacyMode(value: unknown): ProviderPrivacyMode | undefined {
	if (
		value === "local-only" ||
		value === "hybrid" ||
		value === "cloud-preferred"
	) {
		return value;
	}
	return undefined;
}

function normalizeProviderType(value: unknown): ProviderType | undefined {
	if (value === "lm-studio" || value === "gemini") {
		return value;
	}
	return undefined;
}

export function resolveProviderPrivacyMode(
	config?: Partial<AgentConfig>,
): ProviderPrivacyMode {
	const explicitMode =
		normalizePrivacyMode(config?.providerPrivacyMode) ??
		normalizePrivacyMode(process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE);
	if (explicitMode) {
		return explicitMode;
	}

	const preferredProvider =
		normalizeProviderType(config?.provider) ??
		normalizeProviderType(process.env.NEXT_PUBLIC_LLM_PROVIDER) ??
		"lm-studio";
	return preferredProvider === "gemini" ? "cloud-preferred" : "local-only";
}

export function resolveProviderRoute({
	taskType,
	config,
}: {
	taskType: ProviderTaskType;
	config?: Partial<AgentConfig>;
}): ProviderRouteDecision {
	const privacyMode = resolveProviderPrivacyMode(config);
	if (privacyMode === "local-only") {
		return {
			taskType,
			privacyMode,
			providerOrder: ["lm-studio"],
		};
	}

	if (privacyMode === "cloud-preferred") {
		return {
			taskType,
			privacyMode,
			providerOrder: ["gemini", "lm-studio"],
		};
	}

	// hybrid: privacy-first local routing with cloud fallback.
	return {
		taskType,
		privacyMode,
		providerOrder: ["lm-studio", "gemini"],
	};
}
