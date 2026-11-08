import { CARD_UNITS_PER_INCH, CollageCard, CollageImage, CollageObject } from '../types';
import { cardRect } from './card';

// Below this an image visibly softens in print; 300 is ideal, but 150 is
// where most photo labs stop complaining.
export const PRINT_DPI_LOW = 150;
// Below this it looks blocky, not just soft.
export const PRINT_DPI_VERY_LOW = 100;

// How many of the image's own pixels land on each printed inch. An image's
// `width` is always its source pixels across — its natural width, or what's
// left of it after a crop — and it covers `width * scale` canvas units, so the
// width cancels out and only the scale matters. The softer axis wins when the
// image has been stretched.
export function imagePrintDpi(image: Pick<CollageImage, 'scaleX' | 'scaleY'>): number {
  return CARD_UNITS_PER_INCH / Math.max(Math.abs(image.scaleX), Math.abs(image.scaleY));
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The axis-aligned box around an object's rotated footprint, in canvas units.
function footprint(obj: CollageObject): Box {
  const w = obj.width * Math.abs(obj.scaleX);
  const h = obj.height * Math.abs(obj.scaleY);
  const rad = (obj.rotation * Math.PI) / 180;
  const halfW = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  const halfH = (Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) / 2;
  return { left: obj.x - halfW, top: obj.y - halfH, right: obj.x + halfW, bottom: obj.y + halfH };
}

// What the card exports: its trim, plus the bleed when that's included.
function cardBox(card: CollageCard): Box {
  const rect = cardRect(card);
  const left = card.x - card.width / 2 + rect.x;
  const top = card.y - card.height / 2 + rect.y;
  return { left, top, right: left + rect.width, bottom: top + rect.height };
}

function overlaps(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export interface LowResImage {
  image: CollageImage;
  dpi: number;
}

// Every image that reaches into the card's printed area and prints below
// PRINT_DPI_LOW, softest first. Text is vector and prints sharp at any size.
export function lowResImagesOnCard(card: CollageCard, objects: CollageObject[]): LowResImage[] {
  const box = cardBox(card);
  return objects
    .filter((obj): obj is CollageImage => obj.kind === 'image' && overlaps(footprint(obj), box))
    .map((image) => ({ image, dpi: imagePrintDpi(image) }))
    .filter(({ dpi }) => dpi < PRINT_DPI_LOW)
    .sort((a, b) => a.dpi - b.dpi);
}

// Whether an image prints soft on any card it touches.
export function lowResOnAnyCard(image: CollageImage, objects: CollageObject[]): boolean {
  if (imagePrintDpi(image) >= PRINT_DPI_LOW) return false;
  const box = footprint(image);
  return objects.some((obj) => obj.kind === 'card' && overlaps(box, cardBox(obj)));
}
