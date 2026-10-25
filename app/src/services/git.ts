/**
 * KryomCode Git Service
 *
 * Renderer-side service wrapper for the existing Electron
 * preload Git API. This file does not create new IPC channels.
 */

import type {
  GitCommitOptions,
  GitOperationResult,
  GitPushPullResult,
  GitRepositoryStatus,
} from "../types/git";

function getGitAPI() {
  const api = window.kryomcode;

  if (!api) {
    throw new Error("KryomCode desktop API is unavailable.");
  }

  return api;
}

/**
 * Read the current repository status.
 */
export async function getGitStatus(): Promise<GitRepositoryStatus> {
  return getGitAPI().gitGetStatus() as unknown as Promise<GitRepositoryStatus>;
}

/**
 * Read recent repository history.
 */
export async function getGitHistory(
  limit = 20,
): Promise<unknown> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Git history limit must be a positive integer.");
  }

  return getGitAPI().gitGetHistory(limit);
}

/**
 * Stage selected files.
 */
export async function stageGitFiles(
  paths: string[],
): Promise<GitOperationResult> {
  if (paths.length === 0) {
    throw new Error("Select at least one file to stage.");
  }

  return getGitAPI().gitStageFiles(paths) as Promise<GitOperationResult>;
}

/**
 * Unstage selected files.
 */
export async function unstageGitFiles(
  paths: string[],
): Promise<GitOperationResult> {
  if (paths.length === 0) {
    throw new Error("Select at least one file to unstage.");
  }

  return getGitAPI().gitUnstageFiles(paths) as Promise<GitOperationResult>;
}

/**
 * Commit staged changes.
 */
export async function commitGitChanges(
  options: GitCommitOptions | string,
): Promise<GitOperationResult> {
  const message =
    typeof options === "string" ? options : options.message;

  if (!message.trim()) {
    throw new Error("Commit message cannot be empty.");
  }

  return getGitAPI().gitCommitChanges(
    message.trim(),
  ) as Promise<GitOperationResult>;
}

/**
 * Push local commits to the configured remote.
 */
export async function pushGitChanges(): Promise<GitPushPullResult> {
  return getGitAPI().gitPushChanges() as Promise<GitPushPullResult>;
}

/**
 * Pull changes from the configured remote.
 */
export async function pullGitChanges(): Promise<GitPushPullResult> {
  return getGitAPI().gitPullChanges() as Promise<GitPushPullResult>;
}

/**
 * Group the supported operations for convenient imports.
 */
export const gitService = {
  getStatus: getGitStatus,
  getHistory: getGitHistory,
  stageFiles: stageGitFiles,
  unstageFiles: unstageGitFiles,
  commitChanges: commitGitChanges,
  pushChanges: pushGitChanges,
  pullChanges: pullGitChanges,
};

