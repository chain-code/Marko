import type { ContinuousEditorViewState } from "./continuousEditor";
import { isPathInsideTreeRoot, normalizeTreePath } from "./fileTree";

export interface EditorViewStateCache {
  remember: (path: string | null | undefined, state: ContinuousEditorViewState | null | undefined) => void;
  recall: (path: string | null | undefined) => ContinuousEditorViewState | null;
  move: (oldPath: string | null | undefined, newPath: string | null | undefined) => void;
  remove: (path: string | null | undefined, includeChildren?: boolean) => void;
}

export const initialEditorViewState: ContinuousEditorViewState = {
  anchor: 0,
  head: 0,
  scrollTop: 0,
};

export function createEditorViewStateCache(): EditorViewStateCache {
  const states = new Map<string, ContinuousEditorViewState>();

  return {
    remember(path, state) {
      const key = normalizeTreePath(path);
      if (!key || !state) return;
      states.set(key, { ...state });
    },
    recall(path) {
      const key = normalizeTreePath(path);
      const state = key ? states.get(key) : undefined;
      return state ? { ...state } : null;
    },
    move(oldPath, newPath) {
      const oldKey = normalizeTreePath(oldPath);
      const newKey = normalizeTreePath(newPath);
      if (!oldKey || !newKey || oldKey === newKey) return;
      const state = states.get(oldKey);
      states.delete(oldKey);
      if (state) states.set(newKey, state);
    },
    remove(path, includeChildren = false) {
      const key = normalizeTreePath(path);
      if (!key) return;
      for (const candidate of states.keys()) {
        if (candidate === key || (includeChildren && isPathInsideTreeRoot(candidate, key))) {
          states.delete(candidate);
        }
      }
    },
  };
}
