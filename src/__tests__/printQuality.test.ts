import { describe, expect, it } from 'vitest';
import { CollageCard, CollageImage, CollageText } from '../types';
import { imagePrintDpi, lowResImagesOnCard, PRINT_DPI_LOW } from '../utils/printQuality';

// Maps to CLAUDE.md → "Low-Resolution Print Warnings"

const card: CollageCard = {
  kind: 'card',
  id: 'card',
  name: 'Postcard',
  sizeId: 'postcard',
  includeBleed: true,
  x: 0,
  y: 0,
  width: 600,
  height: 400,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  zIndex: 1,
};

function image(overrides: Partial<CollageImage> = {}): CollageImage {
  return {
    kind: 'image',
    id: 'img',
    name: 'photo.png',
    src: 'data:image/png;base64,AAA',
    x: 0,
    y: 0,
    width: 1024,
    height: 1024,
    rotation: 0,
    scaleX: 0.25,
    scaleY: 0.25,
    opacity: 1,
    zIndex: 2,
    ...overrides,
  };
}

describe('imagePrintDpi', () => {
  it('is the image\'s own pixels over the inches it covers', () => {
    // 1024px shown 256 units (2.56in) wide → 400dpi.
    expect(imagePrintDpi(image())).toBeCloseTo(400);
    // 1024px stretched to 1024 units (10.24in) → 100dpi.
    expect(imagePrintDpi(image({ scaleX: 1, scaleY: 1 }))).toBeCloseTo(100);
  });

  it('takes the softer axis of a stretched image, and ignores flipping', () => {
    expect(imagePrintDpi(image({ scaleX: -0.25, scaleY: 0.5 }))).toBeCloseTo(200);
  });

  it('counts a cropped image by the pixels left after the crop', () => {
    // 200px of source shown 200 units wide: 100dpi, however big the original.
    const cropped = image({ width: 200, height: 100, scaleX: 1, scaleY: 1, crop: { x: 0, y: 0, width: 200, height: 100 } });
    expect(imagePrintDpi(cropped)).toBeCloseTo(100);
  });
});

describe('lowResImagesOnCard', () => {
  it('flags an image on the card that prints below the threshold', () => {
    const soft = image({ id: 'soft', scaleX: 0.9, scaleY: 0.9 });
    const result = lowResImagesOnCard(card, [card, soft]);
    expect(result.map((r) => r.image.id)).toEqual(['soft']);
    expect(result[0].dpi).toBeLessThan(PRINT_DPI_LOW);
  });

  it('leaves alone an image that prints sharply', () => {
    expect(lowResImagesOnCard(card, [card, image()])).toEqual([]);
  });

  it('ignores a low-res image that is off the card', () => {
    const offCard = image({ x: 2000, scaleX: 1, scaleY: 1, width: 300, height: 300 });
    expect(lowResImagesOnCard(card, [card, offCard])).toEqual([]);
  });

  it('counts an image that only reaches into the bleed', () => {
    // Card trim spans x -300..300; bleed reaches 312.5. This image spans 305..405.
    const inBleed = image({ x: 355, width: 100, height: 100, scaleX: 1, scaleY: 1 });
    expect(lowResImagesOnCard(card, [card, inBleed])).toHaveLength(1);
    expect(lowResImagesOnCard({ ...card, includeBleed: false }, [card, inBleed])).toEqual([]);
  });

  it('uses a rotated image\'s full footprint', () => {
    // A 400x20 bar centred at x=440 reaches the card lying flat (240..640).
    // Stood upright it's only 20 wide (430..450) and misses the bleed edge at
    // 312.5; tilted 45° its corner reaches back to ~291.5 and touches again.
    const bar = image({ x: 440, width: 400, height: 20, scaleX: 1, scaleY: 1 });
    expect(lowResImagesOnCard(card, [card, bar])).toHaveLength(1);
    expect(lowResImagesOnCard(card, [card, { ...bar, rotation: 90 }])).toEqual([]);
    expect(lowResImagesOnCard(card, [card, { ...bar, rotation: 45 }])).toHaveLength(1);
  });

  it('lists the softest image first and skips text', () => {
    const text: CollageText = {
      kind: 'text', id: 'txt', name: 'Text', text: 'Hi', x: 0, y: 0, width: 200, height: 40, rotation: 0,
      scaleX: 5, scaleY: 5, opacity: 1, zIndex: 3, fontFamily: 'Inter', fontSize: 32, bold: false,
      italic: false, underline: false, color: '#000',
    };
    const a = image({ id: 'a', scaleX: 0.8, scaleY: 0.8 });
    const b = image({ id: 'b', scaleX: 1.5, scaleY: 1.5 });
    expect(lowResImagesOnCard(card, [card, a, text, b]).map((r) => r.image.id)).toEqual(['b', 'a']);
  });
});
