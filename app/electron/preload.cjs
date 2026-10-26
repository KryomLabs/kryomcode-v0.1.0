const {
  contextBridge,
  ipcRenderer,
} = require("electron");

/**
 * =========================================================
 * Event Subscription Helper
 * =========================================================
 *
 * Creates a safe renderer-side subscription
 * without exposing ipcRenderer directly.
 */
function createEventSubscription(channel, callback) {
  const listener = (_event, ...args) => {
    callback(...args);
  };

  ipcRenderer.on(channel, listener);

  // Return cleanup function.
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

/**
 * =========================================================
 * KryomCode Renderer API
 * =========================================================
 *
 * Only explicitly approved APIs are exposed
 * to the renderer process.
 *
 * ipcRenderer itself is NEVER exposed.
 * =========================================================
 */

const kryomcodeAPI = {
  /**
   * Application version.
   */
  version: "0.1.0",

  /**
   * =======================================================
   * Project
   * =======================================================
   */

  selectProject: () =>
    ipcRenderer.invoke("project:select"),

  readDirectory: (directoryPath) =>
    ipcRenderer.invoke(
      "project:read-directory",
      directoryPath,
    ),

  readFile: (filePath) =>
    ipcRenderer.invoke(
      "project:read-file",
      filePath,
    ),

  writeFile: (filePath, content) =>
    ipcRenderer.invoke(
      "project:write-file",
      filePath,
      content,
    ),

  createFile: (filePath) =>
    ipcRenderer.invoke(
      "project:create-file",
      filePath,
    ),

  createFolder: (directoryPath) =>
    ipcRenderer.invoke(
      "project:create-folder",
      directoryPath,
    ),

  rename: (oldPath, newPath) =>
    ipcRenderer.invoke(
      "project:rename",
      oldPath,
      newPath,
    ),

  delete: (targetPath, targetType) =>
    ipcRenderer.invoke(
      "project:delete",
      targetPath,
      targetType,
    ),

  /**
   * =======================================================
   * AI Integration
   * =======================================================
   *
   * AI requests go through the Electron main process.
   * Keep provider credentials out of the renderer.
   * Matching handlers must be added to main.cjs.
   */

  aiGenerate: (request) =>
    ipcRenderer.invoke(
      "ai:generate",
      request,
    ),

  aiGetStatus: () =>
    ipcRenderer.invoke("ai:getStatus"),

  /**
   * =======================================================
   * Terminal
   * =======================================================
   */

  startTerminal: (projectPath) =>
    ipcRenderer.invoke(
      "terminal:start",
      projectPath,
    ),

  writeTerminal: (command) =>
    ipcRenderer.invoke(
      "terminal:write",
      command,
    ),

  stopTerminal: () =>
    ipcRenderer.invoke("terminal:stop"),

  onTerminalOutput: (callback) =>
    createEventSubscription(
      "terminal:output",
      callback,
    ),

  onTerminalError: (callback) =>
    createEventSubscription(
      "terminal:error",
      callback,
    ),

  onTerminalExit: (callback) =>
    createEventSubscription(
      "terminal:exit",
      callback,
    ),

  /**
   * =======================================================
   * Test Runner
   * =======================================================
   */

  runTests: (projectPath) =>
    ipcRenderer.invoke(
      "tests:run",
      projectPath,
    ),

  stopTests: () =>
    ipcRenderer.invoke("tests:stop"),

  onTestOutput: (callback) =>
    createEventSubscription(
      "tests:output",
      callback,
    ),

  onTestError: (callback) =>
    createEventSubscription(
      "tests:error",
      callback,
    ),

  onTestExit: (callback) =>
    createEventSubscription(
      "tests:exit",
      callback,
    ),

  onTestProcessError: (callback) =>
    createEventSubscription(
      "tests:process-error",
      callback,
    ),

  /**
   * =======================================================
   * Git Integration
   * =======================================================
   *
   * These methods communicate with the main process.
   * Corresponding Git IPC handlers must exist in main.cjs.
   */

  gitGetStatus: () =>
    ipcRenderer.invoke("git:getStatus"),

  gitGetHistory: (limit = 20) =>
    ipcRenderer.invoke(
      "git:getHistory",
      limit,
    ),

  gitStageFiles: (paths) =>
    ipcRenderer.invoke(
      "git:stageFiles",
      paths,
    ),

  gitUnstageFiles: (paths) =>
    ipcRenderer.invoke(
      "git:unstageFiles",
      paths,
    ),

  gitCommitChanges: (message) =>
    ipcRenderer.invoke(
      "git:commitChanges",
      message,
    ),

  gitPushChanges: () =>
    ipcRenderer.invoke("git:pushChanges"),

  gitPullChanges: () =>
    ipcRenderer.invoke("git:pullChanges"),
};

/**
 * =========================================================
 * Expose API
 * =========================================================
 */

contextBridge.exposeInMainWorld(
  "kryomcode",
  kryomcodeAPI,
);