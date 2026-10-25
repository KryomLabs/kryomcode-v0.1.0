import { useCallback, useEffect, useRef, useState } from "react";

type TerminalAPI = typeof window.kryomcode;

export interface UseTerminalResult {
  output: string[];
  isRunning: boolean;
  error: string | null;
  start: (projectPath: string) => Promise<void>;
  write: (command: string) => Promise<void>;
  stop: () => Promise<void>;
  clearOutput: () => void;
}

function getTerminalAPI(): TerminalAPI {
  const api = window.kryomcode;

  if (!api) {
    throw new Error("KryomCode desktop API is unavailable.");
  }

  return api;
}

function formatOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : formatOutput(value);
}

export function useTerminal(): UseTerminalResult {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    let unsubscribeOutput: (() => void) | undefined;
    let unsubscribeError: (() => void) | undefined;
    let unsubscribeExit: (() => void) | undefined;

    try {
      const api = getTerminalAPI();

      unsubscribeOutput = api.onTerminalOutput((data: unknown) => {
        if (mountedRef.current) {
          const text = formatOutput(data);
          if (text) {
            setOutput((current) => [...current, text]);
          }
        }
      });

      unsubscribeError = api.onTerminalError((data: unknown) => {
        if (mountedRef.current) {
          const message = getErrorMessage(data);
          setError(message);
          setOutput((current) => [...current, message]);
        }
      });

      unsubscribeExit = api.onTerminalExit((data: unknown) => {
        if (mountedRef.current) {
          setIsRunning(false);
          const message = data == null ? "" : formatOutput(data);
          if (message) {
            setOutput((current) => [...current, message]);
          }
        }
      });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }

    return () => {
      mountedRef.current = false;
      unsubscribeOutput?.();
      unsubscribeError?.();
      unsubscribeExit?.();
    };
  }, []);

  const start = useCallback(async (projectPath: string): Promise<void> => {
    if (!projectPath.trim()) {
      setError("Select a project folder before starting the terminal.");
      return;
    }

    setError(null);

    try {
      await getTerminalAPI().startTerminal(projectPath);
      setIsRunning(true);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }, []);

  const write = useCallback(async (command: string): Promise<void> => {
    if (!command.trim()) {
      return;
    }

    setError(null);

    try {
      await getTerminalAPI().writeTerminal(command);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    try {
      await getTerminalAPI().stopTerminal();
      setIsRunning(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }, []);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setError(null);
  }, []);

  return {
    output,
    isRunning,
    error,
    start,
    write,
    stop,
    clearOutput,
  };
}

export default useTerminal;