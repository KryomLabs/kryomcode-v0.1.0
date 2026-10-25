import { useCallback, useMemo, useState } from "react";
import type { EditorTab } from "../types/editor";

export interface UseEditorResult {
  tabs: EditorTab[];
  activeTabPath: string | null;
  activeTab: EditorTab | null;
  openTab: (tab: EditorTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string, content?: string) => void;
  closeAllTabs: () => void;
  dirtyTabs: EditorTab[];
  hasUnsavedChanges: boolean;
}

export function useEditor(): UseEditorResult {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activeTabPath) ?? null,
    [tabs, activeTabPath],
  );

  const openTab = useCallback((newTab: EditorTab) => {
    setTabs((currentTabs) => {
      const existing = currentTabs.find((tab) => tab.path === newTab.path);

      if (existing) {
        return currentTabs;
      }

      const savedContent = newTab.savedContent ?? newTab.content;

      return [
        ...currentTabs,
        {
          ...newTab,
          savedContent,
          isDirty: newTab.content !== savedContent,
          saveStatus: newTab.content !== savedContent ? "unsaved" : "saved",
        },
      ];
    });

    setActiveTabPath(newTab.path);
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabs((currentTabs) => {
      const index = currentTabs.findIndex((tab) => tab.path === path);

      if (index === -1) {
        return currentTabs;
      }

      const remaining = currentTabs.filter((tab) => tab.path !== path);

      setActiveTabPath((currentActivePath) => {
        if (currentActivePath !== path) {
          return currentActivePath;
        }

        if (remaining.length === 0) {
          return null;
        }

        return remaining[Math.min(index, remaining.length - 1)].path;
      });

      return remaining;
    });
  }, []);

  const setActiveTab = useCallback((path: string | null) => {
    setActiveTabPath(path);
  }, []);

  const updateContent = useCallback((path: string, content: string) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.path !== path) {
          return tab;
        }

        const isDirty = content !== tab.savedContent;

        return {
          ...tab,
          content,
          isDirty,
          saveStatus: isDirty ? "unsaved" : "saved",
        };
      }),
    );
  }, []);

  const markSaved = useCallback(
    (path: string, content?: string) => {
      setTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.path !== path) {
            return tab;
          }

          const savedContent = content ?? tab.content;
          const isDirty = tab.content !== savedContent;

          return {
            ...tab,
            savedContent,
            isDirty,
            saveStatus: isDirty ? "unsaved" : "saved",
          };
        }),
      );
    },
    [],
  );

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabPath(null);
  }, []);

  const dirtyTabs = useMemo(
    () => tabs.filter((tab) => tab.isDirty ?? tab.content !== tab.savedContent),
    [tabs],
  );

  return {
    tabs,
    activeTabPath,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
    updateContent,
    markSaved,
    closeAllTabs,
    dirtyTabs,
    hasUnsavedChanges: dirtyTabs.length > 0,
  };
}

export default useEditor;