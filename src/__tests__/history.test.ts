import { describe, expect, it } from 'vitest';
import { createHistoryState, historyReducer } from '../hooks/useHistory';

// Maps to CLAUDE.md → "Undo/Redo History"
describe('historyReducer', () => {
  it('undo reverts to the state before the last set, and redo reapplies it', () => {
    let state = createHistoryState(0);
    state = historyReducer(state, { type: 'set', updater: 1, coalesce: false });
    state = historyReducer(state, { type: 'set', updater: 2, coalesce: false });
    expect(state.present).toBe(2);

    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(1);

    state = historyReducer(state, { type: 'redo' });
    expect(state.present).toBe(2);
  });

  it('making a new change after an undo clears the redo history', () => {
    let state = createHistoryState(0);
    state = historyReducer(state, { type: 'set', updater: 1, coalesce: false });
    state = historyReducer(state, { type: 'set', updater: 2, coalesce: false });
    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(1);
    expect(state.future).toEqual([2]);

    state = historyReducer(state, { type: 'set', updater: 99, coalesce: false });
    expect(state.present).toBe(99);
    expect(state.future).toEqual([]);

    // The old "2" branch is gone — redo has nothing to reapply.
    state = historyReducer(state, { type: 'redo' });
    expect(state.present).toBe(99);
  });

  it('undo/redo is a no-op when there is nothing to undo/redo', () => {
    const initial = createHistoryState(0);

    const afterUndo = historyReducer(initial, { type: 'undo' });
    expect(afterUndo.present).toBe(0);
    expect(afterUndo).toBe(initial); // no-op returns the same reference, nothing thrown

    const afterRedo = historyReducer(initial, { type: 'redo' });
    expect(afterRedo.present).toBe(0);
    expect(afterRedo).toBe(initial);
  });

  it('coalesced sets merge into the same undo step as the one before them', () => {
    let state = createHistoryState(0);
    // Simulates dragging a slider: one discrete set, then a burst of
    // coalesced sets for each intermediate value while dragging.
    state = historyReducer(state, { type: 'set', updater: 10, coalesce: false });
    state = historyReducer(state, { type: 'set', updater: 11, coalesce: true });
    state = historyReducer(state, { type: 'set', updater: 12, coalesce: true });
    state = historyReducer(state, { type: 'set', updater: 13, coalesce: true });
    expect(state.present).toBe(13);
    expect(state.past).toEqual([0]); // only one undo step recorded for the whole burst

    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(0); // one undo removes the entire drag, not one value at a time
  });

  it('supports functional updaters, like useState', () => {
    let state = createHistoryState([1, 2, 3]);
    state = historyReducer(state, {
      type: 'set',
      updater: (prev: number[]) => [...prev, 4],
      coalesce: false,
    });
    expect(state.present).toEqual([1, 2, 3, 4]);
  });

  it('reset reinitializes present and discards past/future without pushing an undo step', () => {
    let state = createHistoryState(0);
    state = historyReducer(state, { type: 'set', updater: 1, coalesce: false });
    state = historyReducer(state, { type: 'reset', value: 42 });

    expect(state.present).toBe(42);
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
  });
});
