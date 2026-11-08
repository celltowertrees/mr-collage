import {
  CARD_BLEED_IN,
  CARD_EXPORT_DPI,
  CARD_SIZES,
  CARD_UNITS_PER_INCH,
  CardExportFormat,
  CardSide,
  CardSizeId,
  CollageCard,
} from '../types';

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

// The physical size a card prints at, in inches: trim, plus bleed when on.
export function cardPrintSizeIn(card: Pick<CollageCard, 'width' | 'height' | 'includeBleed'>) {
  const rect = cardRect(card);
  return { width: rect.width / CARD_UNITS_PER_INCH, height: rect.height / CARD_UNITS_PER_INCH };
}

// Short side first, in the size's own units: "4.25×6 in", "105×148 mm".
function cardDimensions(sizeId: CardSizeId, times: string) {
  const size = CARD_SIZES[sizeId];
  if (size.mm) return { text: `${size.mm.height}${times}${size.mm.width}`, unit: 'mm' };
  return { text: `${size.heightIn}${times}${size.widthIn}`, unit: 'in' };
}

// "4x6in", the short form used in filenames.
export function cardSizeSlug(card: Pick<CollageCard, 'sizeId'>) {
  const { text, unit } = cardDimensions(card.sizeId, 'x');
  return `${text}${unit}`;
}

// "4×6 in", as the Add Card menu and the frame label show it.
export function cardSizeText(sizeId: CardSizeId) {
  const { text, unit } = cardDimensions(sizeId, '×');
  return `${text} ${unit}`;
}

export function cardLabel(card: Pick<CollageCard, 'sizeId'>, side?: CardSide | null) {
  const label = `${CARD_SIZES[card.sizeId].label} ${cardSizeText(card.sizeId)}`;
  return side ? `${label} · ${side === 'front' ? 'Front' : 'Back'}` : label;
}

const FORMAT_EXTENSIONS: Record<CardExportFormat, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf' };

export function cardFileExtension(format: CardExportFormat) {
  return FORMAT_EXTENSIONS[format];
}

// "card-2-5x7in.jpg": numbered by the card's place among all cards.
export function cardFileName(card: Pick<CollageCard, 'sizeId'>, index: number, format: CardExportFormat) {
  return `card-${index + 1}-${cardSizeSlug(card)}.${FORMAT_EXTENSIONS[format]}`;
}

// The id of the white sheet drawn under a card in the content layer.
export function cardPaperId(cardId: string) {
  return `${cardId}-paper`;
}
