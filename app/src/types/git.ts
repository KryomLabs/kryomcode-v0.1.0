/**
 * KryomCode Git Types
 *
 * Shared types for repository status, file changes,
 * commits, branches, and Git operations.
 */

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "unknown";

export type GitOperationStatus =
  | "idle"
  | "running"
  | "success"
  | "error";

export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitRepositoryStatus {
  isRepository: boolean;
  rootPath?: string;
  branch?: string;
  changes: GitFileChange[];
  ahead?: number;
  behind?: number;
  error?: string;
}

export interface GitOperationResult {
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}

export interface GitCommitOptions {
  message: string;
  amend?: boolean;
}

export interface GitPushPullResult
  extends GitOperationResult {
  branch?: string;
  commitsTransferred?: number;
}

export interface GitState {
  repository: GitRepositoryStatus | null;
  branches: GitBranch[];
  commits: GitCommit[];
  status: GitOperationStatus;
  error: string | null;
}