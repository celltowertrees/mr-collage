import { useCallback, useReducer, useRef } from 'react';

// Rapid, continuous edits (e.g. dragging a slider) fire many `set` calls in
// quick succession. Coalescing calls made within this window of the previous
// one into the same undo step means one Ctrl+Z undoes the whole drag instead
// of one intermediate value at a time.
const COALESCE_WINDOW_MS = 500;

// How many undo steps to keep. Each step holds a full snapshot array, and the
// objects in it stay reachable for as long as the step does — so without a cap
// an image deleted an hour ago keeps its multi-megabyte data URL alive for the
// rest of the session. Deep enough that hitting the limit in real editing is
// unlikely, shallow enough to bound what a long session retains.
export const MAX_HISTORY_STEPS = 100;

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export type HistoryAction<T> =
  | { type: 'set'; updater: T | ((prev: T) => T); coalesce: boolean }
  | { type: 'amend'; updater: T | ((prev: T) => T) }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: T };

export function createHistoryState<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

export function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
  switch (action.type) {
    case 'set': {
      const value =
        typeof action.updater === 'function'
          ? (action.updater as (prev: T) => T)(state.present)
          : action.updater;
      if (value === state.present) return state;
      const grown = action.coalesce ? state.past : [...state.past, state.present];
      const past = grown.length > MAX_HISTORY_STEPS ? grown.slice(grown.length - MAX_HISTORY_STEPS) : grown;
      return { past, present: value, future: [] };
    }
    // Rewrites the present in place: no step is added and the redo stack
    // survives. For updates the app derives on its own rather than ones the
    // user made, which would otherwise each eat a Ctrl+Z.
    case 'amend': {
      const value =
        typeof action.updater === 'function'
          ? (action.updater as (prev: T) => T)(state.present)
          : action.updater;
      if (value === state.present) return state;
      return { ...state, present: value };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case 'reset':
      return createHistoryState(action.value);
  }
}

// Who the last set() came from, for deciding whether the next one joins its
// undo step.
export interface CoalesceTracker {
  lastSetAt: number;
  lastWasCoalescible: boolean;
  lastGroup: string | null;
}

export interface SetOptions {
  coalesce?: boolean;
  amend?: boolean;
  // Sets sharing a group key merge into one undo step for as long as nothing
  // else is set in between, however far apart they land — a text editing
  // session typed slowly is still one step.
  group?: string;
}

export function freshTracker(): CoalesceTracker {
  return { lastSetAt: 0, lastWasCoalescible: false, lastGroup: null };
}

export function decideCoalesce(
  tracker: CoalesceTracker,
  options: SetOptions,
  now: number
): { coalesce: boolean; tracker: CoalesceTracker } {
  const group = options.group ?? null;
  const requestCoalesce = options.coalesce ?? false;
  const coalesce =
    group !== null
      ? tracker.lastGroup === group
      : requestCoalesce && tracker.lastWasCoalescible && now - tracker.lastSetAt < COALESCE_WINDOW_MS;
  return { coalesce, tracker: { lastSetAt: now, lastWasCoalescible: requestCoalesce, lastGroup: group } };
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, initial, createHistoryState);
  // Only coalesce with the previous set() when it was itself coalescible
  // (continuous) — otherwise a continuous edit right after a discrete action
  // (e.g. the first slider tick after adding an image) would merge into that
  // discrete action's step just because it landed inside the time window.
  const tracker = useRef<CoalesceTracker>(freshTracker());

  // `coalesce: true` opts in to merging with the previous set if it happened
  // recently — for continuous input (e.g. dragging a slider), not discrete
  // actions (add/delete/drag-end), which must always be their own undo step
  // regardless of how close together they land in time.
  const set = useCallback((updater: T | ((prev: T) => T), options?: SetOptions) => {
    if (options?.amend) {
      dispatch({ type: 'amend', updater });
      return;
    }
    const decision = decideCoalesce(tracker.current, options ?? {}, Date.now());
    tracker.current = decision.tracker;
    dispatch({ type: 'set', updater, coalesce: decision.coalesce });
  }, []);

  const undo = useCallback(() => {
    tracker.current = freshTracker();
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback(() => {
    tracker.current = freshTracker();
    dispatch({ type: 'redo' });
  }, []);

  const reset = useCallback((value: T) => {
    tracker.current = freshTracker();
    dispatch({ type: 'reset', value });
  }, []);

  return {
    present: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
