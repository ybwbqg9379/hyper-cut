import type { AgentConfig, LLMProvider, ProviderType } from '../types';
import { LMStudioProvider } from './lm-studio-provider';
import { GeminiProvider } from './gemini-provider';

function parseEnvNumber(envVar: string | undefined): number | undefined {
  if (!envVar) return undefined;
  const num = Number(envVar);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Create an LLM provider instance based on configuration
 */
export function createProvider(
  type: ProviderType,
  config?: Partial<AgentConfig>
): LLMProvider {
  switch (type) {
    case 'lm-studio': {
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
    case 'gemini':
      return new GeminiProvider(
        config?.geminiApiKey ?? process.env.GEMINI_API_KEY ?? ''
      );
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the configured provider type from environment
 */
export function getConfiguredProviderType(
  config?: Partial<AgentConfig>
): ProviderType {
  if (config?.provider) {
    return config.provider;
  }
  const envProvider = process.env.NEXT_PUBLIC_LLM_PROVIDER;
  if (envProvider === 'gemini') {
    return 'gemini';
  }
  return 'lm-studio'; // Default to LM Studio for MVP
}
