/**
 * KryomCode Project Types
 *
 * Shared types for project metadata, directory entries,
 * workspace state, and project operations.
 */

export type ProjectLoadStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error";

export type ProjectEntryType =
  | "file"
  | "directory";

export interface ProjectEntry {
  name: string;
  path: string;
  type: ProjectEntryType;
  children?: ProjectEntry[];
  extension?: string;
  isExpanded?: boolean;
}

export interface ProjectMetadata {
  name: string;
  path: string;
  rootPath: string;
  createdAt?: string;
  lastOpenedAt?: string;
}

export interface ProjectState {
  project: ProjectMetadata | null;
  entries: ProjectEntry[];
  status: ProjectLoadStatus;
  error: string | null;
}

export interface OpenProjectResult {
  success: boolean;
  projectPath?: string;
  error?: string;
}

export interface ReadDirectoryResult {
  success: boolean;
  entries?: ProjectEntry[];
  error?: string;
}

export interface ProjectOperationResult {
  success: boolean;
  path?: string;
  error?: string;
}