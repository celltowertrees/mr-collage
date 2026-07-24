import { useCallback, useReducer, useRef } from 'react';

// Rapid, continuous edits (e.g. dragging a slider) fire many `set` calls in
// quick succession. Coalescing calls made within this window of the previous
// one into the same undo step means one Ctrl+Z undoes the whole drag instead
// of one intermediate value at a time.
const COALESCE_WINDOW_MS = 500;

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export type HistoryAction<T> =
  | { type: 'set'; updater: T | ((prev: T) => T); coalesce: boolean }
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
      const past = action.coalesce ? state.past : [...state.past, state.present];
      return { past, present: value, future: [] };
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

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, initial, createHistoryState);
  const lastSetAt = useRef(0);
  // Only true when the previous set() was itself a coalescible (continuous)
  // one — otherwise a continuous edit right after a discrete action (e.g. the
  // first slider tick after adding an image) would merge into that discrete
  // action's step just because it landed inside the time window.
  const lastWasCoalescible = useRef(false);

  // `coalesce: true` opts in to merging with the previous set if it happened
  // recently — for continuous input (e.g. dragging a slider), not discrete
  // actions (add/delete/drag-end), which must always be their own undo step
  // regardless of how close together they land in time.
  const set = useCallback((updater: T | ((prev: T) => T), options?: { coalesce?: boolean }) => {
    const requestCoalesce = options?.coalesce ?? false;
    const now = Date.now();
    const coalesce =
      requestCoalesce && lastWasCoalescible.current && now - lastSetAt.current < COALESCE_WINDOW_MS;
    lastSetAt.current = now;
    lastWasCoalescible.current = requestCoalesce;
    dispatch({ type: 'set', updater, coalesce });
  }, []);

  const undo = useCallback(() => {
    lastSetAt.current = 0;
    lastWasCoalescible.current = false;
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback(() => {
    lastSetAt.current = 0;
    lastWasCoalescible.current = false;
    dispatch({ type: 'redo' });
  }, []);

  const reset = useCallback((value: T) => {
    lastSetAt.current = 0;
    lastWasCoalescible.current = false;
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
