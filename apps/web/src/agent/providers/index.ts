import type { LLMProvider, ProviderType } from '../types';
import { LMStudioProvider } from './lm-studio-provider';
import { GeminiProvider } from './gemini-provider';

/**
 * Create an LLM provider instance based on configuration
 */
export function createProvider(type: ProviderType): LLMProvider {
  switch (type) {
    case 'lm-studio':
      return new LMStudioProvider(
        process.env.NEXT_PUBLIC_LM_STUDIO_URL ?? 'http://localhost:1234/v1',
        process.env.NEXT_PUBLIC_LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-8b'
      );
    case 'gemini':
      return new GeminiProvider(process.env.GEMINI_API_KEY ?? '');
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the configured provider type from environment
 */
export function getConfiguredProviderType(): ProviderType {
  const envProvider = process.env.NEXT_PUBLIC_LLM_PROVIDER;
  if (envProvider === 'gemini') {
    return 'gemini';
  }
  return 'lm-studio'; // Default to LM Studio for MVP
}
