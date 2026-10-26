/**
 * KryomCode AI Service
 *
 * Renderer-side service for validated AI requests. Actual provider calls
 * must go through the Electron preload bridge; provider credentials should
 * never be stored in this renderer service.
 */

import type {
  AIPlanStep,
  AIProposedFileChange,
  AIRequest,
  AIResponse,
  AIServiceStatus,
  AITaskStatus,
  AITaskType,
} from "../types/ai";

export interface AIService {
  generate(request: AIRequest): Promise<AIResponse>;
  getStatus(): Promise<AIServiceStatus>;
}

/**
 * Methods that the Electron preload bridge will expose in a later step.
 */
export interface AIServiceBridge {
  aiGenerate(request: AIRequest): Promise<AIResponse>;
  aiGetStatus(): Promise<AIServiceStatus>;
}

type PartialDesktopAIAPI = Partial<AIServiceBridge>;

const AI_NOT_CONFIGURED_MESSAGE =
  "AI service is not connected yet. Connect the Electron AI bridge before sending requests.";

const TASK_TYPES: readonly AITaskType[] = [
  "generate",
  "explain",
  "analyze",
  "refactor",
  "debug",
  "test",
  "plan",
];

const TASK_STATUSES: readonly AITaskStatus[] = [
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
];

const CHANGE_TYPES: readonly AIProposedFileChange["type"][] = [
  "create",
  "modify",
  "delete",
];

export class AIServiceNotConfiguredError extends Error {
  constructor(message = AI_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "AIServiceNotConfiguredError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred while contacting the AI service.";
}

function validateRequest(request: AIRequest): string | null {
  if (!isRecord(request)) {
    return "AI request must be an object.";
  }

  if (typeof request.prompt !== "string" || !request.prompt.trim()) {
    return "Enter a prompt before sending the request.";
  }

  if (
    typeof request.taskType !== "string" ||
    !TASK_TYPES.includes(request.taskType as AITaskType)
  ) {
    return "The AI task type is not supported.";
  }

  if (
    request.projectPath !== undefined &&
    typeof request.projectPath !== "string"
  ) {
    return "Project path must be a string.";
  }

  if (
    request.activeFilePath !== undefined &&
    typeof request.activeFilePath !== "string"
  ) {
    return "Active file path must be a string.";
  }

  if (request.contextFiles !== undefined) {
    if (!Array.isArray(request.contextFiles)) {
      return "Context files must be an array.";
    }

    const hasInvalidContextFile = request.contextFiles.some(
      (file) =>
        !isRecord(file) ||
        typeof file.path !== "string" ||
        typeof file.content !== "string",
    );

    if (hasInvalidContextFile) {
      return "Each context file must include a path and string content.";
    }
  }

  return null;
}

function isProposedFileChange(
  value: unknown,
): value is AIProposedFileChange {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.path === "string" &&
    typeof value.type === "string" &&
    CHANGE_TYPES.includes(
      value.type as AIProposedFileChange["type"],
    ) &&
    (value.content === undefined || typeof value.content === "string") &&
    (value.originalContent === undefined ||
      typeof value.originalContent === "string") &&
    (value.language === undefined || typeof value.language === "string")
  );
}

function isPlanStep(value: unknown): value is AIPlanStep {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.description === undefined ||
      typeof value.description === "string") &&
    typeof value.status === "string" &&
    TASK_STATUSES.includes(value.status as AITaskStatus)
  );
}

function isAIResponse(value: unknown): value is AIResponse {
  if (!isRecord(value) || typeof value.success !== "boolean") {
    return false;
  }

  if (
    value.message !== undefined &&
    typeof value.message !== "string"
  ) {
    return false;
  }

  if (value.error !== undefined && typeof value.error !== "string") {
    return false;
  }

  if (
    value.changes !== undefined &&
    (!Array.isArray(value.changes) ||
      !value.changes.every(isProposedFileChange))
  ) {
    return false;
  }

  if (
    value.plan !== undefined &&
    (!Array.isArray(value.plan) || !value.plan.every(isPlanStep))
  ) {
    return false;
  }

  return true;
}

function isAIServiceStatus(value: unknown): value is AIServiceStatus {
  if (
    !isRecord(value) ||
    typeof value.configured !== "boolean" ||
    typeof value.available !== "boolean"
  ) {
    return false;
  }

  return (
    (value.providerName === undefined ||
      typeof value.providerName === "string") &&
    (value.message === undefined || typeof value.message === "string")
  );
}

/**
 * Return the AI methods exposed by Electron preload, if available.
 * The current preload does not expose them yet, so this safely returns null.
 */
function getDesktopAIServiceBridge(): AIServiceBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  const api = window.kryomcode as unknown as
    | PartialDesktopAIAPI
    | undefined;

  if (
    !api ||
    typeof api.aiGenerate !== "function" ||
    typeof api.aiGetStatus !== "function"
  ) {
    return null;
  }

  return {
    aiGenerate: (request) => api.aiGenerate!(request),
    aiGetStatus: () => api.aiGetStatus!(),
  };
}

export function createUnavailableAIService(
  message = AI_NOT_CONFIGURED_MESSAGE,
): AIService {
  return {
    async generate(): Promise<AIResponse> {
      return {
        success: false,
        error: message,
      };
    },

    async getStatus(): Promise<AIServiceStatus> {
      return {
        configured: false,
        available: false,
        message,
      };
    },
  };
}

/**
 * Create a service backed by an Electron bridge.
 *
 * The optional resolver also makes it possible to provide a test or
 * alternate bridge without changing the chat component.
 */
export function createAIService(
  resolveBridge: () => AIServiceBridge | null =
    getDesktopAIServiceBridge,
): AIService {
  return {
    async generate(request: AIRequest): Promise<AIResponse> {
      const validationError = validateRequest(request);

      if (validationError) {
        return {
          success: false,
          error: validationError,
        };
      }

      try {
        const bridge = resolveBridge();

        if (!bridge) {
          return {
            success: false,
            error: AI_NOT_CONFIGURED_MESSAGE,
          };
        }

        const response: unknown = await bridge.aiGenerate(request);

        if (!isAIResponse(response)) {
          return {
            success: false,
            error: "The AI bridge returned an invalid response.",
          };
        }

        return response;
      } catch (error) {
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    },

    async getStatus(): Promise<AIServiceStatus> {
      try {
        const bridge = resolveBridge();

        if (!bridge) {
          return {
            configured: false,
            available: false,
            message: AI_NOT_CONFIGURED_MESSAGE,
          };
        }

        const status: unknown = await bridge.aiGetStatus();

        if (!isAIServiceStatus(status)) {
          return {
            configured: false,
            available: false,
            message: "The AI bridge returned an invalid status.",
          };
        }

        return status;
      } catch (error) {
        return {
          configured: false,
          available: false,
          message: getErrorMessage(error),
        };
      }
    },
  };
}

/**
 * Shared renderer-side service. The Electron methods it expects will be
 * added to preload.cjs and main.cjs in the next integration steps.
 */
export const aiService = createAIService();