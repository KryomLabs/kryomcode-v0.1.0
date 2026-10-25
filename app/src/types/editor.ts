/**
 * KryomCode Editor Types
 *
 * Shared types for editor tabs, cursor positions,
 * save states, and editor actions.
 */

export type EditorSaveStatus =
  | "saved"
  | "saving"
  | "unsaved"
  | "error";

export interface EditorPosition {
  lineNumber: number;
  column: number;
}

export interface EditorSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language?: string;
  isDirty?: boolean;
  saveStatus?: EditorSaveStatus;
}

export interface EditorState {
  tabs: EditorTab[];
  activeTabPath: string | null;
  cursorPosition: EditorPosition;
  selection: EditorSelection | null;
}

export type EditorAction =
  | { type: "open-tab"; tab: EditorTab }
  | { type: "close-tab"; path: string }
  | {
      type: "update-content";
      path: string;
      content: string;
    }
  | {
      type: "mark-saved";
      path: string;
      content: string;
    }
  | {
      type: "set-active-tab";
      path: string | null;
    }
  | {
      type: "set-cursor";
      position: EditorPosition;
    }
  | {
      type: "set-selection";
      selection: EditorSelection | null;
    };