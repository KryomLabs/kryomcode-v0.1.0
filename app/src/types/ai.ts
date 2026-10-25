/**
 * KryomCode AI Types
 *
 * Provider-independent contracts for AI requests,
 * generation tasks, proposed file changes, and results.
 *
 * No AI provider or API integration is implemented here.
 */

export type AITaskType =
  | "generate"
  | "explain"
  | "analyze"
  | "refactor"
  | "debug"
  | "test"
  | "plan";

export type AITaskStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AIChangeType =
  | "create"
  | "modify"
  | "delete";

export interface AIContextFile {
  path: string;
  content: string;
}

export interface AIRequest {
  prompt: string;
  taskType: AITaskType;
  projectPath?: string;
  activeFilePath?: string;
  contextFiles?: AIContextFile[];
}

export interface AIProposedFileChange {
  path: string;
  type: AIChangeType;
  content?: string;
  originalContent?: string;
  language?: string;
}

export interface AIPlanStep {
  id: string;
  title: string;
  description?: string;
  status: AITaskStatus;
}

export interface AIResponse {
  success: boolean;
  message?: string;
  changes?: AIProposedFileChange[];
  plan?: AIPlanStep[];
  error?: string;
}

export interface AITask {
  id: string;
  request: AIRequest;
  status: AITaskStatus;
  progress: number;
  response?: AIResponse;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AIServiceStatus {
  configured: boolean;
  available: boolean;
  providerName?: string;
  message?: string;
}