import { useCallback, useState } from "react";
import type { ProjectEntry } from "../types/project";

export interface UseProjectResult {
  projectPath: string | null;
  entries: ProjectEntry[];
  isLoading: boolean;
  error: string | null;
  selectProject: () => Promise<string | null>;
  loadDirectory: (directoryPath?: string) => Promise<void>;
  refreshProject: () => Promise<void>;
  clearProject: () => void;
}

type ProjectSelectionResponse = {
  success?: boolean;
  canceled?: boolean;
  projectPath?: string;
  path?: string;
  error?: string;
};

type DirectoryResponse = {
  success?: boolean;
  entries?: ProjectEntry[];
  error?: string;
};

function getProjectAPI() {
  const api = window.kryomcode;

  if (!api) {
    throw new Error("KryomCode desktop API is unavailable.");
  }

  return api;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function useProject(): UseProjectResult {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (directoryPath?: string): Promise<void> => {
      const targetPath = directoryPath ?? projectPath;

      if (!targetPath) {
        setError("Select a project folder first.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const raw: unknown = await getProjectAPI().readDirectory(targetPath);

        if (Array.isArray(raw)) {
          setEntries(raw as ProjectEntry[]);
          return;
        }

        if (!isRecord(raw)) {
          throw new Error("Invalid directory response.");
        }

        const response = raw as DirectoryResponse;

        if (response.success === false) {
          throw new Error(response.error ?? "Unable to read project directory.");
        }

        if (!Array.isArray(response.entries)) {
          throw new Error("Directory response does not contain an entries list.");
        }

        setEntries(response.entries);
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath],
  );

  const selectProject = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const raw: unknown = await getProjectAPI().selectProject();

      if (raw == null) {
        return null;
      }

      if (typeof raw === "string") {
        setProjectPath(raw);
        return raw;
      }

      if (!isRecord(raw)) {
        throw new Error("Invalid project selection response.");
      }

      const response = raw as ProjectSelectionResponse;

      if (response.canceled) {
        return null;
      }

      if (response.success === false) {
        throw new Error(response.error ?? "Unable to select project folder.");
      }

      const selectedPath = response.projectPath ?? response.path;

      if (!selectedPath) {
        throw new Error("Project selection response did not include a path.");
      }

      setProjectPath(selectedPath);
      return selectedPath;
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProject = useCallback(async (): Promise<void> => {
    if (projectPath) {
      await loadDirectory(projectPath);
    }
  }, [projectPath, loadDirectory]);

  const clearProject = useCallback(() => {
    setProjectPath(null);
    setEntries([]);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    projectPath,
    entries,
    isLoading,
    error,
    selectProject,
    loadDirectory,
    refreshProject,
    clearProject,
  };
}

export default useProject;