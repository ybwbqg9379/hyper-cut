import type {
  LLMProvider,
  ChatParams,
  ChatResponse,
} from '../types';

/**
 * Gemini Provider (Placeholder)
 * Reserved for Gemini-3-flash-preview multimodal model
 * Features: parallel function calls, video frame analysis
 */
export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(_params: ChatParams): Promise<ChatResponse> {
    // TODO: Implement Gemini API integration
    // Gemini 3 supports:
    // - Parallel function calls
    // - Thought Signatures (maintain reasoning context)
    // - Multimodal input (analyze video frames)
    throw new Error(
      'Gemini provider not yet implemented. Use LM Studio for MVP.'
    );
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}
