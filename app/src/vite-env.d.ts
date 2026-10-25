/// <reference types="vite/client" />

/**
 * =========================================================
 * Project / Filesystem Types
 * =========================================================
 */

interface FileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
}

interface WriteFileResult {
  success: boolean;
  path?: string;
}

interface CreateFileResult {
  success: boolean;
  path: string;
}

interface CreateFolderResult {
  success: boolean;
  path: string;
}

interface RenameResult {
  success: boolean;
  oldPath: string;
  newPath: string;
}

interface DeleteResult {
  success: boolean;
  path: string;
}

/**
 * =========================================================
 * Terminal Types
 * =========================================================
 */

interface StartTerminalResult {
  success: boolean;
  alreadyRunning?: boolean;
}

interface WriteTerminalResult {
  success: boolean;
}

interface StopTerminalResult {
  success: boolean;
}

/**
 * =========================================================
 * Test Runner Types
 * =========================================================
 */

interface RunTestsResult {
  success: boolean;
  alreadyRunning?: boolean;
}

interface StopTestsResult {
  success: boolean;
  wasRunning?: boolean;
}

/**
 * =========================================================
 * Git Types
 * =========================================================
 */

type GitChange = {
  path: string;
  status: string;
  kind:
    | "modified"
    | "untracked"
    | "added"
    | "deleted"
    | "renamed";
  staged: boolean;
  unstaged: boolean;
};

type GitStatusResult = {
  success: true;
  branch: string;
  changes: GitChange[];
};

type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
};

/**
 * =========================================================
 * KryomCode API
 * =========================================================
 */

interface KryomCodeAPI {
  /**
   * Application version.
   */
  version: string;

  /**
   * =======================================================
   * Project / Filesystem
   * =======================================================
   */

  selectProject: () => Promise<string | null>;

  readDirectory: (
    directoryPath: string,
  ) => Promise<FileEntry[]>;

  readFile: (
    filePath: string,
  ) => Promise<string>;

  writeFile: (
    filePath: string,
    content: string,
  ) => Promise<WriteFileResult>;

  createFile: (
    filePath: string,
  ) => Promise<CreateFileResult>;

  createFolder: (
    directoryPath: string,
  ) => Promise<CreateFolderResult>;

  rename: (
    oldPath: string,
    newPath: string,
  ) => Promise<RenameResult>;

  delete: (
    targetPath: string,
    targetType: "file" | "directory",
  ) => Promise<DeleteResult>;

  /**
   * =======================================================
   * Terminal
   * =======================================================
   */

  startTerminal: (
    projectPath: string,
  ) => Promise<StartTerminalResult>;

  writeTerminal: (
    command: string,
  ) => Promise<WriteTerminalResult>;

  stopTerminal: () => Promise<StopTerminalResult>;

  onTerminalOutput: (
    callback: (data: string) => void,
  ) => () => void;

  onTerminalError: (
    callback: (data: string) => void,
  ) => () => void;

  onTerminalExit: (
    callback: (code: number | null) => void,
  ) => () => void;

  /**
   * =======================================================
   * Test Runner
   * =======================================================
   */

  runTests: (
    projectPath: string,
  ) => Promise<RunTestsResult>;

  stopTests: () => Promise<StopTestsResult>;

  onTestOutput: (
    callback: (data: string) => void,
  ) => () => void;

  onTestError: (
    callback: (data: string) => void,
  ) => () => void;

  onTestExit: (
    callback: (code: number | null) => void,
  ) => () => void;

  onTestProcessError: (
    callback: (message: string) => void,
  ) => () => void;

  /**
   * =======================================================
   * Git Integration
   * =======================================================
   */

  gitGetStatus: () => Promise<GitStatusResult>;

  gitGetHistory: (
    limit?: number,
  ) => Promise<GitCommit[]>;

  gitStageFiles: (
    paths: string[],
  ) => Promise<GitStatusResult>;

  gitUnstageFiles: (
    paths: string[],
  ) => Promise<GitStatusResult>;

  gitCommitChanges: (
    message: string,
  ) => Promise<GitStatusResult>;

  gitPushChanges: () => Promise<GitStatusResult>;

  gitPullChanges: () => Promise<GitStatusResult>;
}

/**
 * =========================================================
 * Browser Window API
 * =========================================================
 */

interface Window {
  kryomcode: KryomCodeAPI;
}