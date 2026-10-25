/**
 * KryomCode Terminal Service
 *
 * Renderer-side wrapper for the existing Electron preload terminal API.
 * Terminal process management remains in the Electron main process.
 */

function getTerminalAPI() {
  const api = window.kryomcode;

  if (!api) {
    throw new Error("KryomCode desktop API is unavailable.");
  }

  return api;
}

/**
 * Start a terminal in the selected project directory.
 */
export async function startTerminal(
  projectPath: string,
): Promise<unknown> {
  if (!projectPath.trim()) {
    throw new Error("A project path is required to start the terminal.");
  }

  return getTerminalAPI().startTerminal(projectPath);
}

/**
 * Send a command to the running terminal.
 */
export async function writeTerminal(
  command: string,
): Promise<unknown> {
  if (!command.trim()) {
    throw new Error("Terminal command cannot be empty.");
  }

  return getTerminalAPI().writeTerminal(command);
}

/**
 * Stop the active terminal process.
 */
export async function stopTerminal(): Promise<unknown> {
  return getTerminalAPI().stopTerminal();
}

/**
 * Subscribe to terminal output.
 * Returns an unsubscribe function.
 */
export function onTerminalOutput(
  callback: (...args: any[]) => void,
): () => void {
  return getTerminalAPI().onTerminalOutput(callback);
}

/**
 * Subscribe to terminal errors.
 * Returns an unsubscribe function.
 */
export function onTerminalError(
  callback: (...args: any[]) => void,
): () => void {
  return getTerminalAPI().onTerminalError(callback);
}

/**
 * Subscribe to terminal exit events.
 * Returns an unsubscribe function.
 */
export function onTerminalExit(
  callback: (...args: any[]) => void,
): () => void {
  return getTerminalAPI().onTerminalExit(callback);
}

export const terminalService = {
  start: startTerminal,
  write: writeTerminal,
  stop: stopTerminal,
  onOutput: onTerminalOutput,
  onError: onTerminalError,
  onExit: onTerminalExit,
};