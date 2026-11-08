import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { exportToICP, loadState, parseICP, saveState } from '../store';
import { CollageCard, CollageImage, CollageObject } from '../types';
import { cardLabel } from '../utils/card';
import {
  CARD_PAIR_GAP_UNITS,
  addressGuideLayout,
  applyObjectChanges,
  cardExportFilenames,
  cardPartner,
  cardSide,
  duplicateObject,
  expandCardPairs,
  linkCardBack,
  remapIds,
  removeObjects,
} from '../utils/cardPair';

// Maps to CLAUDE.md → "Front and Back Cards"

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

const front: CollageCard = {
  kind: 'card',
  id: 'front',
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

function paired(): CollageObject[] {
  return linkCardBack([front, image], 'front', 'back', 3);
}

function card(objects: CollageObject[], id: string) {
  const found = objects.find((o) => o.id === id);
  if (!found || found.kind !== 'card') throw new Error(`no card ${id}`);
  return found;
}

describe('adding a back', () => {
  it('creates a linked card beside the front, same size and orientation', () => {
    const objects = paired();
    const back = card(objects, 'back');
    expect(back.width).toBe(600);
    expect(back.height).toBe(400);
    expect(back.includeBleed).toBe(true);
    expect(back.y).toBe(front.y);
    expect(back.x).toBe(front.x + front.width + CARD_PAIR_GAP_UNITS);
    expect(cardPartner(card(objects, 'front'), objects)?.id).toBe('back');
    expect(cardPartner(back, objects)?.id).toBe('front');
    expect(cardSide(card(objects, 'front'), objects)).toBe('front');
    expect(cardSide(back, objects)).toBe('back');
  });

  it('a portrait front gets a portrait back', () => {
    const objects = linkCardBack([{ ...front, width: 400, height: 600 }], 'front', 'back', 2);
    expect(card(objects, 'back')).toMatchObject({ width: 400, height: 600 });
  });

  it('labels each side', () => {
    const objects = paired();
    expect(cardLabel(front, 'front')).toBe('Postcard 4×6 in · Front');
    expect(cardLabel(card(objects, 'back'), 'back')).toBe('Postcard 4×6 in · Back');
    expect(cardLabel(front)).toBe('Postcard 4×6 in');
  });
});

describe('keeping the two sides in step', () => {
  it('switching either side to portrait switches both', () => {
    const objects = applyObjectChanges(paired(), 'back', { width: 400, height: 600 });
    expect(card(objects, 'front')).toMatchObject({ width: 400, height: 600 });
    expect(card(objects, 'back')).toMatchObject({ width: 400, height: 600 });
  });

  it('the bleed setting follows across', () => {
    const objects = applyObjectChanges(paired(), 'front', { includeBleed: false });
    expect(card(objects, 'back').includeBleed).toBe(false);
  });

  it('moving one side leaves the other where it is', () => {
    const objects = applyObjectChanges(paired(), 'front', { x: 0, y: 0 });
    expect(card(objects, 'back')).toMatchObject({ x: 950, y: 200 });
  });
});

describe('deleting one side', () => {
  it('leaves the other as a plain, unlinked card', () => {
    const objects = removeObjects(applyObjectChanges(paired(), 'back', { addressGuides: true }), ['front']);
    const back = card(objects, 'back');
    expect(back.pair).toBeUndefined();
    expect(back.addressGuides).toBeUndefined();
    expect(cardSide(back, objects)).toBeNull();
  });

  it('deleting both removes both', () => {
    expect(removeObjects(paired(), ['front', 'back']).map((o) => o.id)).toEqual(['img']);
  });

  it('a link to a missing card is ignored', () => {
    const lonely: CollageCard = { ...front, pair: { id: 'gone', side: 'front' } };
    expect(cardPartner(lonely, [lonely])).toBeNull();
    expect(cardSide(lonely, [lonely])).toBeNull();
  });
});

describe('duplicating a side', () => {
  it('makes a plain card, leaving the original pair intact', () => {
    const objects = paired();
    const copy = duplicateObject(card(objects, 'back'), 'copy', 9) as CollageCard;
    const after = [...objects, copy];
    expect(copy.pair).toBeUndefined();
    expect(cardPartner(card(after, 'front'), after)?.id).toBe('back');
  });
});

describe('exporting a pair', () => {
  it('exporting either side exports both', () => {
    const objects = paired();
    expect(expandCardPairs(['back'], objects).sort()).toEqual(['back', 'front']);
    expect(expandCardPairs(['front'], objects).sort()).toEqual(['back', 'front']);
  });

  it('names the files by card number and side', () => {
    const solo: CollageCard = { ...front, id: 'solo' };
    const objects = [solo, ...paired()];
    const names = cardExportFilenames(objects);
    expect(names.get('solo')).toBe('card-1-4x6in.png');
    expect(names.get('front')).toBe('card-2-front.png');
    expect(names.get('back')).toBe('card-2-back.png');
  });
});

describe('a pair persists and round-trips', () => {
  it('survives a save and reload', async () => {
    const objects = paired();
    await saveState({ images: objects, stagePosition: { x: 0, y: 0 }, stageScale: 1 });
    const loaded = await loadState();
    expect(loaded?.images).toEqual(objects);
  });

  it('survives ICP export and import, address layout included', () => {
    const objects = applyObjectChanges(paired(), 'back', { addressGuides: true });
    const parsed = parseICP(JSON.stringify(exportToICP(objects)));
    expect(parsed.objects).toEqual(objects);
  });

  it('stays linked when imported objects get fresh ids', () => {
    const fresh = remapIds(paired(), (id) => `new-${id}`);
    const f = card(fresh, 'new-front');
    expect(cardPartner(f, fresh)?.id).toBe('new-back');
    expect(cardSide(card(fresh, 'new-back'), fresh)).toBe('back');
  });
});

describe('postcard address layout', () => {
  it('puts the divider, stamp box and address lines on the right half of a landscape back', () => {
    const layout = addressGuideLayout(600, 400);
    expect(layout.divider.x).toBe(300);
    expect(layout.stamp.x + layout.stamp.width).toBeLessThanOrEqual(600);
    expect(layout.stamp.y).toBeGreaterThanOrEqual(0);
    expect(layout.stamp.x).toBeGreaterThan(300);
    expect(layout.addressLines.length).toBeGreaterThanOrEqual(3);
    for (const line of layout.addressLines) {
      expect(line.x1).toBeGreaterThan(300);
      expect(line.x2).toBeLessThan(600);
    }
    // USPS keeps the bottom 5/8 in clear for the barcode.
    expect(layout.barcodeZone).toEqual({ x: 600 - 475, y: 400 - 62.5, width: 475, height: 62.5 });
  });
});
