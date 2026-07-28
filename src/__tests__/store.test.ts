import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { exportToICP, loadState, saveState } from '../store';
import { CollageImage, CanvasState } from '../types';

// fake-indexeddb gives each test a clean database; jsdom's built-in
// localStorage is cleared separately below.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

interface ICPNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  zIndex: number;
  data: { src: string; name: string; mask?: unknown; shadow?: unknown };
}

interface ICPExport {
  'infinite-canvas': { version: string; nodes: ICPNode[] };
}

function makeImage(overrides: Partial<CollageImage> = {}): CollageImage {
  return {
    kind: 'image',
    id: 'img-1',
    src: 'data:image/png;base64,AAA',
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'test.png',
    ...overrides,
  };
}

// Maps to CLAUDE.md → "Export the collage as ICP JSON"
describe('exportToICP', () => {
  it('describes each image position, size, rotation, opacity, and z-index', () => {
    const image = makeImage({ scaleX: 2, scaleY: 0.5 });
    const result = exportToICP([image]) as unknown as ICPExport;

    const node = result['infinite-canvas'].nodes[0];
    expect(node.position).toEqual({ x: 100, y: 200 });
    expect(node.size).toEqual({ width: 600, height: 75 }); // width/height * scale
    expect(node.rotation).toBe(0);
    expect(node.opacity).toBe(1);
    expect(node.zIndex).toBe(1);
    expect(node.data).toMatchObject({ src: image.src, name: image.name });
  });

  it('includes mask data only when a mask is set', () => {
    const withMask = makeImage({ mask: { type: 'circle', cx: 10, cy: 10, radius: 5 } });
    const withoutMask = makeImage({ id: 'img-2' });

    const result = exportToICP([withMask, withoutMask]) as unknown as ICPExport;
    const [maskedNode, unmaskedNode] = result['infinite-canvas'].nodes;

    expect(maskedNode.data.mask).toEqual({ type: 'circle', cx: 10, cy: 10, radius: 5 });
    expect(unmaskedNode.data.mask).toBeUndefined();
  });

  it('includes shadow data only when the shadow is enabled', () => {
    const enabled = makeImage({
      id: 'img-enabled',
      shadow: { enabled: true, color: '#000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
    });
    const disabled = makeImage({
      id: 'img-disabled',
      shadow: { enabled: false, color: '#000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
    });

    const result = exportToICP([enabled, disabled]) as unknown as ICPExport;
    const [enabledNode, disabledNode] = result['infinite-canvas'].nodes;

    expect(enabledNode.data.shadow).toEqual(enabled.shadow);
    expect(disabledNode.data.shadow).toBeUndefined();
  });
});

// Maps to CLAUDE.md → "IndexedDB Image Storage" feature scenarios
describe('saveState / loadState', () => {
  it('round-trips a collage through localStorage metadata + IndexedDB blobs', async () => {
    const image = makeImage();
    const state: CanvasState = {
      images: [image],
      stagePosition: { x: 12, y: -34 },
      stageScale: 1.5,
    };

    await saveState(state);
    const loaded = await loadState();

    expect(loaded).toEqual(state);
  });

  it('skips an image whose blob is missing from IndexedDB instead of failing to load', async () => {
    const present = makeImage({ id: 'present' });
    const missing = makeImage({ id: 'missing' });
    await saveState({ images: [present, missing], stagePosition: { x: 0, y: 0 }, stageScale: 1 });

    // Simulate a lost IndexedDB blob for one image without touching the other.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('mr-collage-db');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').delete('missing');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const loaded = await loadState();

    expect(loaded?.images.map((i) => i.id)).toEqual(['present']);
  });

  it('prunes IndexedDB blobs for images no longer in the collage on save', async () => {
    const first = makeImage({ id: 'first' });
    const second = makeImage({ id: 'second' });
    await saveState({ images: [first, second], stagePosition: { x: 0, y: 0 }, stageScale: 1 });

    // Save again without "second" — its blob should be pruned, not just orphaned.
    await saveState({ images: [first], stagePosition: { x: 0, y: 0 }, stageScale: 1 });

    const remainingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = indexedDB.open('mr-collage-db');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('images', 'readonly');
        const getAll = tx.objectStore('images').getAllKeys();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
      };
      req.onerror = () => reject(req.error);
    });

    expect(remainingKeys).toEqual(['first']);
  });

  it('returns null when nothing has been saved yet', async () => {
    expect(await loadState()).toBeNull();
  });
});
