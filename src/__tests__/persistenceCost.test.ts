import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { loadState, saveState } from '../store';
import { CanvasState, CollageImage } from '../types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

function makeImage(id: string, overrides: Partial<CollageImage> = {}): CollageImage {
  return {
    kind: 'image',
    id,
    src: `data:image/png;base64,${'A'.repeat(2048)}`,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: `${id}.png`,
    ...overrides,
  };
}

function state(images: CollageImage[]): CanvasState {
  return { images, stagePosition: { x: 0, y: 0 }, stageScale: 1 };
}

// Counts blob writes and connection opens across a run, so the cost of saving
// is measured rather than assumed.
function instrument() {
  const puts = vi.spyOn(IDBObjectStore.prototype, 'put');
  const opens = vi.spyOn(globalThis.indexedDB, 'open');
  return {
    puts: () => puts.mock.calls.length,
    opens: () => opens.mock.calls.length,
    restore: () => {
      puts.mockRestore();
      opens.mockRestore();
    },
  };
}

// Maps to CLAUDE.md → "Cheap Incremental Saves"
describe('saveState cost', () => {
  it('writes each image blob once, not again on every later save', async () => {
    const images = [makeImage('a'), makeImage('b'), makeImage('c')];
    await saveState(state(images));

    const spy = instrument();
    // Ten metadata-only changes, the shape a slider drag or an orbit produces.
    for (let i = 1; i <= 10; i++) {
      await saveState(state(images.map((img) => ({ ...img, rotation: i }))));
    }
    const puts = spy.puts();
    spy.restore();

    expect(puts).toBe(0);
  });

  it('writes the blob for a newly added image, and only that one', async () => {
    const images = [makeImage('a'), makeImage('b')];
    await saveState(state(images));

    const spy = instrument();
    await saveState(state([...images, makeImage('c')]));
    const puts = spy.puts();
    spy.restore();

    expect(puts).toBe(1);
  });

  it('reuses one database connection instead of opening one per operation', async () => {
    const images = [makeImage('a'), makeImage('b'), makeImage('c'), makeImage('d')];
    await saveState(state(images));

    const spy = instrument();
    await saveState(state(images));
    await saveState(state(images));
    const opens = spy.opens();
    spy.restore();

    expect(opens).toBe(0);
  });

  it('still restores a blob that was deleted and then brought back by undo', async () => {
    const a = makeImage('a');
    const b = makeImage('b');
    await saveState(state([a, b]));
    await saveState(state([a]));            // b deleted, its blob pruned
    await saveState(state([a, b]));         // undo brings b back

    const loaded = await loadState();
    expect(loaded?.images.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect((loaded?.images.find((i) => i.id === 'b') as CollageImage).src).toBe(b.src);
  });
});
