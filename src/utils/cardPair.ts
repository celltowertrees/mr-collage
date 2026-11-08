import { CARD_UNITS_PER_INCH, CardSide, CollageCard, CollageObject, ObjectChanges } from '../types';
import { cardFileExtension, cardSizeSlug } from './card';

// Front/back card pairs. Each side carries `pair: { id, side }` pointing at
// the other; everything here treats a link as real only while it's mutual,
// so a half-broken link (a side deleted, a file with one side missing) reads
// as a plain card rather than as something half-paired.

// Space left between a front and the back placed beside it.
export const CARD_PAIR_GAP_UNITS = 0.5 * CARD_UNITS_PER_INCH;

// What both sides of a pair always share: they print as one sheet, so a size,
// orientation or bleed change on either side applies to both.
const SHARED_FIELDS = ['width', 'height', 'sizeId', 'includeBleed'] as const;

export function cardPartner(card: CollageCard, objects: readonly CollageObject[]): CollageCard | null {
  if (!card.pair) return null;
  const other = objects.find((obj) => obj.id === card.pair!.id);
  if (!other || other.kind !== 'card' || other.pair?.id !== card.id || other.pair.side === card.pair.side) {
    return null;
  }
  return other;
}

export function cardSide(card: CollageCard, objects: readonly CollageObject[]): CardSide | null {
  return cardPartner(card, objects) ? card.pair!.side : null;
}

// A back for `frontId`, the same size and orientation, beside it on the right.
export function linkCardBack(
  objects: CollageObject[],
  frontId: string,
  backId: string,
  zIndex: number
): CollageObject[] {
  const front = objects.find((obj) => obj.id === frontId);
  if (!front || front.kind !== 'card' || cardPartner(front, objects)) return objects;
  const back: CollageCard = {
    ...front,
    id: backId,
    x: front.x + front.width + CARD_PAIR_GAP_UNITS,
    zIndex,
    pair: { id: frontId, side: 'back' },
  };
  delete back.addressGuides;
  return [
    ...objects.map((obj) => (obj.id === frontId ? { ...front, pair: { id: backId, side: 'front' as const } } : obj)),
    back,
  ];
}

// Applies `changes` to one object, carrying any shared card fields over to
// its partner in the same update — so it's one undo step for both.
export function applyObjectChanges(
  objects: CollageObject[],
  id: string,
  changes: ObjectChanges
): CollageObject[] {
  const target = objects.find((obj) => obj.id === id);
  const partner = target?.kind === 'card' ? cardPartner(target, objects) : null;
  const shared: ObjectChanges = {};
  if (partner) {
    for (const key of SHARED_FIELDS) {
      if (key in changes) (shared as Record<string, unknown>)[key] = changes[key];
    }
  }
  const sharesAny = Object.keys(shared).length > 0;
  return objects.map((obj) => {
    if (obj.id === id) return { ...obj, ...changes } as CollageObject;
    if (sharesAny && obj.id === partner!.id) return { ...obj, ...shared } as CollageObject;
    return obj;
  });
}

// Strips links (and the back-only address guides) from cards whose partner
// is gone, returning the same array when nothing needed it.
export function unlinkOrphanedCards(objects: CollageObject[]): CollageObject[] {
  let changed = false;
  const result = objects.map((obj) => {
    if (obj.kind !== 'card' || !obj.pair || cardPartner(obj, objects)) return obj;
    changed = true;
    return plainCard(obj);
  });
  return changed ? result : objects;
}

// Deleting one side leaves the other as an ordinary card: it keeps its place
// and whatever artwork sits on it, and can take a new back later.
export function removeObjects(objects: CollageObject[], ids: readonly string[]): CollageObject[] {
  return unlinkOrphanedCards(objects.filter((obj) => !ids.includes(obj.id)));
}

// A copy nudged down-right. A copy of one side is a plain card — a pair is
// exactly two cards, and the original pair stays as it was.
export function duplicateObject(source: CollageObject, id: string, zIndex: number): CollageObject {
  const copy = { ...source, id, x: source.x + 20, y: source.y + 20, zIndex };
  return copy.kind === 'card' ? plainCard(copy) : copy;
}

// Fresh ids for a batch of objects (an import), with pair links following
// their partner to its new id. A side whose partner wasn't in the batch ends
// up a plain card.
export function remapIds(objects: CollageObject[], newId: (oldId: string) => string): CollageObject[] {
  const ids = new Map(objects.map((obj) => [obj.id, newId(obj.id)]));
  return unlinkOrphanedCards(
    objects.map((obj) => {
      const fresh = { ...obj, id: ids.get(obj.id)! };
      if (fresh.kind === 'card' && fresh.pair) {
        fresh.pair = { ...fresh.pair, id: ids.get(fresh.pair.id) ?? fresh.pair.id };
      }
      return fresh;
    })
  );
}

// Exporting either side of a pair exports both.
export function expandCardPairs(ids: readonly string[], objects: readonly CollageObject[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const card = objects.find((obj) => obj.id === id);
    const partner = card?.kind === 'card' ? cardPartner(card, objects) : null;
    if (partner) out.add(partner.id);
  }
  return [...out];
}

// Every card's export filename. Cards are numbered in canvas order, a pair
// taking one number between its two sides: `card-2-front.png` and
// `card-2-back.png`, next to an unpaired `card-1-4x6in.png`. Each file takes
// its own card's export format for the extension.
export function cardExportFilenames(objects: readonly CollageObject[]): Map<string, string> {
  const ext = (card: CollageCard) => cardFileExtension(card.exportFormat ?? 'png');
  const names = new Map<string, string>();
  let n = 0;
  for (const obj of objects) {
    if (obj.kind !== 'card' || names.has(obj.id)) continue;
    n++;
    const partner = cardPartner(obj, objects);
    if (!partner) {
      names.set(obj.id, `card-${n}-${cardSizeSlug(obj)}.${ext(obj)}`);
      continue;
    }
    names.set(obj.id, `card-${n}-${obj.pair!.side}.${ext(obj)}`);
    names.set(partner.id, `card-${n}-${partner.pair!.side}.${ext(partner)}`);
  }
  return names;
}

function plainCard(card: CollageCard): CollageCard {
  const plain = { ...card };
  delete plain.pair;
  delete plain.addressGuides;
  return plain;
}

const IN = CARD_UNITS_PER_INCH;
// USPS keeps a strip along the bottom of the address side, 5/8 in tall and
// 4 3/4 in in from the right edge, clear for its barcode.
const BARCODE_ZONE = { width: 4.75 * IN, height: 0.625 * IN };
const STAMP = { width: 0.875 * IN, height: 1 * IN, inset: 0.25 * IN };
const ADDRESS_LINE_SPACING = 0.35 * IN;
const ADDRESS_INSET = 0.375 * IN;

// Where a postcard's address side needs room, in card-local units for a
// landscape card `long` wide and `short` tall: message on the left half,
// address on the right, a stamp in the top-right corner, and the barcode
// strip along the bottom. A portrait back draws this turned a quarter-turn,
// since the address always runs along the long side.
export function addressGuideLayout(long: number, short: number) {
  const barcodeWidth = Math.min(BARCODE_ZONE.width, long);
  const barcodeZone = {
    x: long - barcodeWidth,
    y: short - BARCODE_ZONE.height,
    width: barcodeWidth,
    height: BARCODE_ZONE.height,
  };
  const addressLines: { x1: number; x2: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const y = short * 0.5 + i * ADDRESS_LINE_SPACING;
    if (y > barcodeZone.y - 0.1 * IN) break;
    addressLines.push({ x1: long / 2 + ADDRESS_INSET, x2: long - ADDRESS_INSET, y });
  }
  return {
    divider: { x: long / 2, y1: ADDRESS_INSET, y2: barcodeZone.y - 0.25 * IN },
    stamp: {
      x: long - STAMP.inset - STAMP.width,
      y: STAMP.inset,
      width: STAMP.width,
      height: STAMP.height,
    },
    addressLines,
    barcodeZone,
  };
}
