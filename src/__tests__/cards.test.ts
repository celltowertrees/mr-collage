import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { exportToICP, exportToStaticHTML, loadState, parseICP, saveState } from '../store';
import { CollageCard, CollageImage } from '../types';
import { cardExportSize, cardRect } from '../utils/card';

// Maps to CLAUDE.md → "Printable Card Frames"

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

const card: CollageCard = {
  kind: 'card',
  id: 'card-1',
  name: 'Postcard',
  sizeId: 'postcard',
  includeBleed: true,
  x: 300,
  y: 200,
  width: 600,
  height: 400,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  zIndex: 1,
};

const image: CollageImage = {
  kind: 'image',
  id: 'img',
  name: 'photo.png',
  src: 'data:image/png;base64,AAA',
  x: 300,
  y: 200,
  width: 100,
  height: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  zIndex: 2,
};

describe('card geometry', () => {
  it('a 4x6 postcard exports at 1875x1275 with bleed and 1800x1200 trimmed', () => {
    expect(cardExportSize(card)).toEqual({ width: 1875, height: 1275 });
    expect(cardExportSize({ ...card, includeBleed: false })).toEqual({ width: 1800, height: 1200 });
  });

  it('portrait swaps the exported dimensions', () => {
    expect(cardExportSize({ ...card, width: 400, height: 600 })).toEqual({ width: 1275, height: 1875 });
  });

  it('the export rect grows by 1/8 in on every side when bleed is on', () => {
    expect(cardRect(card)).toEqual({ x: -12.5, y: -12.5, width: 625, height: 425 });
    expect(cardRect({ ...card, includeBleed: false })).toEqual({ x: 0, y: 0, width: 600, height: 400 });
  });
});

describe('card persistence and interchange', () => {
  it('a card survives a save and reload', async () => {
    await saveState({ images: [card, image], stagePosition: { x: 0, y: 0 }, stageScale: 1 });
    const loaded = await loadState();
    expect(loaded?.images).toEqual([card, image]);
  });

  it('a card round-trips through ICP JSON', () => {
    const parsed = parseICP(JSON.stringify(exportToICP([card])));
    expect(parsed.objects).toEqual([card]);
  });

  it('a card is left out of the static HTML export', async () => {
    const html = await exportToStaticHTML(
      [card, image],
      { x: 0, y: 0, scale: 1, width: 1000, height: 800 },
      {},
      {}
    );
    expect(html).not.toContain('id="card-1"');
    expect(html.match(/class="collage-object"/g)).toHaveLength(1);
    expect(html).toContain('data:image/png;base64,AAA');
  });
});
