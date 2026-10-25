/**
 * KryomCode Terminal Types
 *
 * Shared types for terminal sessions, command execution,
 * terminal output, and process lifecycle.
 */

export type TerminalStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export type TerminalOutputType =
  | "stdout"
  | "stderr"
  | "system";

export interface TerminalOutput {
  id: string;
  text: string;
  type: TerminalOutputType;
  timestamp: number;
}

export interface TerminalSession {
  id: string;
  cwd: string;
  shell?: string;
  status: TerminalStatus;
  exitCode?: number | null;
  createdAt: number;
}

export interface TerminalCommand {
  command: string;
  cwd?: string;
  sessionId?: string;
}

export interface TerminalCommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
}

export interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  output: TerminalOutput[];
  status: TerminalStatus;
}

export interface TerminalClearOptions {
  sessionId?: string;
  clearHistory?: boolean;
}