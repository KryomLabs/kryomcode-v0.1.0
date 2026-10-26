/**
 * KryomCode AI contracts.
 *
 * Shared types for renderer, Electron bridge, and Meta AI integration.
 * File changes returned by the model are proposals only; the application
 * must preview them and wait for explicit user approval before writing files.
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

export type AIConversationRole =
  | "user"
  | "assistant";

export interface AIContextFile {
  /** Relative path inside the currently opened project. */
  path: string;

  /** Text contents of the file. Sensitive files must be excluded. */
  content: string;
}

export interface AIConversationMessage {
  role: AIConversationRole;
  content: string;
}

export interface AIRequest {
  /** The user's current prompt. */
  prompt: string;

  /** The kind of task requested from the model. */
  taskType: AITaskType;

  /** Local project path used by the desktop app; do not send as file content. */
  projectPath?: string;

  /** Relative path of the active editor file. */
  activeFilePath?: string;

  /**
   * Project files and the active file may be sent to the model only when
   * this is explicitly true. Missing or false means prompt-only context.
   */
  includeProjectContext?: boolean;

  /** Additional user-selected project files, sent only with consent. */
  contextFiles?: AIContextFile[];

  /** Earlier chat messages included for conversational continuity. */
  conversationHistory?: AIConversationMessage[];
}

export interface AIProposedFileChange {
  /** Relative path within the opened project. */
  path: string;

  type: AIChangeType;

  /**
   * Complete proposed file contents for create/modify operations.
   * This is not an instruction to write the file automatically.
   */
  content?: string;

  /**
   * Original contents used to detect whether a file changed after
   * the proposal was generated.
   */
  originalContent?: string;

  /** Optional language identifier for display in the diff preview. */
  language?: string;

  /** Short explanation of why this file change is proposed. */
  summary?: string;
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
  modelName?: string;
  message?: string;
}