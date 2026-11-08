import { CARD_BLEED_IN, CARD_EXPORT_DPI, CARD_SIZES, CARD_UNITS_PER_INCH, CollageCard } from '../types';

export const CARD_BLEED_UNITS = CARD_BLEED_IN * CARD_UNITS_PER_INCH;
// Canvas units → printed pixels.
export const CARD_EXPORT_SCALE = CARD_EXPORT_DPI / CARD_UNITS_PER_INCH;

// The region a card exports, in the card's own coordinates (trim top-left at
// 0,0): the trim itself, or the trim plus bleed on every side.
export function cardRect(card: Pick<CollageCard, 'width' | 'height' | 'includeBleed'>) {
  const bleed = card.includeBleed ? CARD_BLEED_UNITS : 0;
  return { x: 0 - bleed, y: 0 - bleed, width: card.width + bleed * 2, height: card.height + bleed * 2 };
}

export function cardExportSize(card: Pick<CollageCard, 'width' | 'height' | 'includeBleed'>) {
  const rect = cardRect(card);
  return {
    width: Math.round(rect.width * CARD_EXPORT_SCALE),
    height: Math.round(rect.height * CARD_EXPORT_SCALE),
  };
}

// "4x6in", the short form used in filenames.
export function cardSizeSlug(card: Pick<CollageCard, 'sizeId'>) {
  const size = CARD_SIZES[card.sizeId];
  return `${size.heightIn}x${size.widthIn}in`;
}

export function cardLabel(card: Pick<CollageCard, 'sizeId'>) {
  const size = CARD_SIZES[card.sizeId];
  return `${size.label} ${size.heightIn}×${size.widthIn} in`;
}

// The id of the white sheet drawn under a card in the content layer.
export function cardPaperId(cardId: string) {
  return `${cardId}-paper`;
}
