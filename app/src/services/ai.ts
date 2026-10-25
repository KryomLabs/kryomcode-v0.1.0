/**
 * KryomCode AI Service
 *
 * Provider-independent service contract.
 * Real provider integration will be added later.
 */

import type {
  AIRequest,
  AIResponse,
  AIServiceStatus,
} from "../types/ai";

export interface AIService {
  generate(request: AIRequest): Promise<AIResponse>;
  getStatus(): Promise<AIServiceStatus>;
}

export class AIServiceNotConfiguredError extends Error {
  constructor(message = "AI service is not configured yet.") {
    super(message);
    this.name = "AIServiceNotConfiguredError";
  }
}

export function createUnavailableAIService(): AIService {
  return {
    async generate(): Promise<AIResponse> {
      return {
        success: false,
        error:
          "AI integration is not available yet. Configure the selected provider when integration begins.",
      };
    },

    async getStatus(): Promise<AIServiceStatus> {
      return {
        configured: false,
        available: false,
        message: "AI provider integration has not been configured.",
      };
    },
  };
}