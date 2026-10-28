import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { exportToICP, loadState, saveState } from '../store';
import { parseICP } from '../store/importICP';
import { CollageImage } from '../types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

const sticker: CollageImage = {
  kind: 'image',
  id: 'sticker-1',
  src: 'data:image/png;base64,iVBORw0KGgo=',
  x: 10,
  y: 20,
  width: 1024,
  height: 1024,
  rotation: 0,
  scaleX: 0.39,
  scaleY: 0.39,
  opacity: 1,
  zIndex: 1,
  name: 'cat smoking a cigar',
  generation: { prompt: 'cat smoking a cigar', style: 'Real Photograph' },
};

// Maps to CLAUDE.md → "Regenerate a Sticker from Its Prompt"
describe('generation prompt storage', () => {
  it('survives a save and reload', async () => {
    await saveState({ images: [sticker], stagePosition: { x: 0, y: 0 }, stageScale: 1 });
    const loaded = await loadState();
    expect((loaded?.images[0] as CollageImage).generation).toEqual(sticker.generation);
  });

  it('is included in the ICP JSON export and restored on import', () => {
    const exported = exportToICP([sticker]) as {
      'infinite-canvas': { nodes: { data: Record<string, unknown> }[] };
    };
    expect(exported['infinite-canvas'].nodes[0].data.generation).toEqual(sticker.generation);

    const { objects } = parseICP(JSON.stringify(exported));
    expect((objects[0] as CollageImage).generation).toEqual(sticker.generation);
  });

  it('is left out for images that were not generated', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { generation: _g, ...uploaded } = sticker;
    const exported = exportToICP([uploaded]) as {
      'infinite-canvas': { nodes: { data: Record<string, unknown> }[] };
    };
    expect('generation' in exported['infinite-canvas'].nodes[0].data).toBe(false);
  });
});
