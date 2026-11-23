import type { SetStateAction } from "react";
import type { Doc } from "./types";

const MAX_HISTORY = 40;

export type DocumentHistory = {
  past: Doc[];
  current: Doc;
  future: Doc[];
  lastGroup?: string;
};

export type HistoryAction =
  | { type: "edit"; value: SetStateAction<Doc>; group?: string }
  | { type: "restore"; doc: Doc }
  | { type: "undo" }
  | { type: "redo" };

export function historyReducer(state: DocumentHistory, action: HistoryAction): DocumentHistory {
  if (action.type === "restore") return { past: [], current: action.doc, future: [] };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      current: state.past[state.past.length - 1],
      future: [state.current, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.current].slice(-MAX_HISTORY),
      current: state.future[0],
      future: state.future.slice(1),
    };
  }
  const next = typeof action.value === "function" ? action.value(state.current) : action.value;
  if (next === state.current) return state;
  const grouped = !!action.group && action.group === state.lastGroup;
  return { past: grouped ? state.past : [...state.past, state.current].slice(-MAX_HISTORY), current: next, future: [], lastGroup: action.group };
}
