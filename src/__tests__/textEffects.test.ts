import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportToICP, exportToStaticHTML, ExportViewport } from '../store';
import { CollageText } from '../types';

function makeText(overrides: Partial<CollageText> = {}): CollageText {
  return {
    kind: 'text',
    id: 'text-1',
    text: 'Hello',
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'Text',
    fontFamily: 'Roboto',
    fontSize: 32,
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
    ...overrides,
  };
}

function parseFrame(html: string, id: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById(id);
  if (!el) throw new Error(`no element with id ${id} in exported HTML`);
  return el;
}

// Maps to CLAUDE.md → "Add Text to the Canvas" effect-parity extension.
// Shape masks and vignettes are deliberately NOT part of this parity — both
// stay image-only (CollageText has no `mask`/`vignette` fields at all), since
// there's no real-world case for clipping or vignetting a text object the way
// there is for a photo.
describe('exportToICP text effect data', () => {
  it('includes gradient fade, shadow, blend mode, and flip only when set', () => {
    const plain = makeText({ id: 'plain' });
    const styled = makeText({
      id: 'styled',
      gradientMask: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      shadow: { enabled: true, color: '#000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
      blendMode: 'multiply',
      flipX: true,
      flipY: true,
    });

    const result = exportToICP([plain, styled]) as unknown as {
      'infinite-canvas': { nodes: { id: string; data: Record<string, unknown> }[] };
    };
    const [plainNode, styledNode] = result['infinite-canvas'].nodes;

    expect(plainNode.data.shadow).toBeUndefined();
    expect(plainNode.data.blendMode).toBeUndefined();
    expect(plainNode.data.flipX).toBeUndefined();

    expect(styledNode.data).toMatchObject({
      gradientMask: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      shadow: { enabled: true, color: '#000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
      blendMode: 'multiply',
      flipX: true,
      flipY: true,
    });
  });
});

describe('exportToStaticHTML text effect styling', () => {
  const viewport: ExportViewport = { x: 0, y: 0, scale: 1, width: 1024, height: 768 };

  // These tests only care about the CSS an effect produces, not font
  // embedding — stub fetch to fail fast instead of hitting the real Google
  // Fonts network on every run (exportToStaticHTML falls back gracefully,
  // see textObjects.test.ts).
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in these tests')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reproduces blend mode and z-order', async () => {
    const text = makeText({ blendMode: 'multiply', zIndex: 7 });
    const html = await exportToStaticHTML([text], viewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.mixBlendMode).toBe('multiply');
    expect(frame.style.zIndex).toBe('7');
  });

  // Unlike images (whose wrapping transform is flip-only), CSS applies
  // `transform` to an element's already-filtered output, so a text frame's
  // enclosing `scale()` stretches its drop-shadow for free — verified
  // empirically (a sibling div with filter + transform:scale(3) showed a 3x
  // wider shadow strip than an identical unscaled one). Only the viewport's
  // own zoom needs to be multiplied in by hand, not the object's own scale.
  it('scales shadow blur/offset by the viewport zoom only, not by the object\'s own scale', async () => {
    const text = makeText({
      scaleX: 2,
      scaleY: 0.5,
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 4, offsetY: 4, opacity: 1 },
    });
    const zoomedViewport: ExportViewport = { ...viewport, scale: 3 };
    const html = await exportToStaticHTML([text], zoomedViewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.filter).toBe('drop-shadow(12px 12px 30px rgba(0, 0, 0, 1))');
  });

  it('folds flip directly into the same scale() transform used for resizing', async () => {
    const text = makeText({ flipX: true });
    const html = await exportToStaticHTML([text], viewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.transform).toBe('rotate(0deg) scale(-1, 1)');
  });

  it('reproduces a gradient fade using the text\'s own unscaled width/height, with no scaleX/scaleY pre-multiplication', async () => {
    // Same geometry as the equivalent image-export test: width=200, height=100,
    // horizontal line (50,50)->(150,50) -> 90deg, 25%/75% stops.
    const text = makeText({
      width: 200,
      height: 100,
      gradientMask: { start: { x: 50, y: 50 }, end: { x: 150, y: 50 } },
    });
    const html = await exportToStaticHTML([text], viewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.maskImage).toBe(
      'linear-gradient(90deg, rgba(0, 0, 0, 1) 25%, rgba(0, 0, 0, 0) 75%)'
    );
  });

  it('omits shadow/blend-mode/gradient-fade styling when unset', async () => {
    const text = makeText();
    const html = await exportToStaticHTML([text], viewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.filter).toBe('');
    expect(frame.style.mixBlendMode).toBe('');
    expect(frame.style.maskImage).toBe('');
  });
});
