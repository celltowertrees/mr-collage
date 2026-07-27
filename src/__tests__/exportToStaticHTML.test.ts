import { describe, expect, it } from 'vitest';
import { exportToStaticHTML, ExportViewport } from '../store';
import { CollageImage } from '../types';

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

function parseFrame(html: string, id: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById(id);
  if (!el) throw new Error(`no element with id ${id} in exported HTML`);
  return el;
}

// Maps to CLAUDE.md → "Export Scene to Static HTML"
describe('exportToStaticHTML', () => {
  const viewport: ExportViewport = { x: -50, y: -20, scale: 2, width: 1024, height: 768 };

  it('positions and sizes each image relative to the current viewport', async () => {
    const image = makeImage();
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    // screen size = width/height * scale ; center = x/y * scale + viewport offset
    expect(frame.style.width).toBe('600px'); // 300 * 2
    expect(frame.style.height).toBe('300px'); // 150 * 2
    // center = (100*2 - 50, 200*2 - 20) = (150, 380); left/top = center - size/2
    expect(frame.style.left).toBe('-150px');
    expect(frame.style.top).toBe('230px');
  });

  it('sizes the page to the viewport', async () => {
    const image = makeImage();
    const html = await exportToStaticHTML([image], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container = doc.querySelector('.collage-viewport') as HTMLElement;

    expect(container.style.width).toBe('1024px');
    expect(container.style.height).toBe('768px');
    expect(container.style.overflow).toBe('hidden');
  });

  // Without its own stacking context, a negative-zIndex image (e.g. "send to
  // back") escapes past .collage-viewport into the page's root stacking
  // context, where <body>'s own opaque background — painted at the
  // "in-flow, non-positioned" tier — sits above it and hides it completely.
  // Konva has no such notion (it's just draw order on one canvas), so an
  // image sent to back renders fine there but vanished from the HTML export.
  it('gives the viewport its own stacking context so negative z-index images aren\'t hidden behind the page background', async () => {
    const image = makeImage({ zIndex: -2 });
    const html = await exportToStaticHTML([image], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container = doc.querySelector('.collage-viewport') as HTMLElement;

    expect(container.style.isolation).toBe('isolate');
    expect(doc.getElementById(image.id)).not.toBeNull();
  });

  it('omits images entirely outside the viewport from the markup', async () => {
    // screen center = (100*2 - 50, 200*2 - 20) = (150, 380); comfortably inside 1024x768
    const inside = makeImage({ id: 'inside' });
    // screen center way past the right/bottom edge of the 1024x768 viewport
    const outside = makeImage({ id: 'outside', x: 5000, y: 5000, width: 50, height: 50 });
    const html = await exportToStaticHTML([inside, outside], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.getElementById('inside')).not.toBeNull();
    expect(doc.getElementById('outside')).toBeNull();
  });

  it('keeps images that only partially overlap the viewport', async () => {
    // screen center = (-75*2 - 50, 200*2 - 20) = (-200, 380): left of the
    // viewport's x=0 edge, but wide enough (600px) that its right side
    // (-200 + 300 = 100) still pokes into frame
    const straddling = makeImage({ id: 'straddling', x: -75, y: 200, width: 300, height: 150 });
    const html = await exportToStaticHTML([straddling], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.getElementById('straddling')).not.toBeNull();
  });

  it('embeds each image inline as its data URL, with no external references', async () => {
    const image = makeImage({ src: 'data:image/png;base64,ZZZZ' });
    const html = await exportToStaticHTML([image], viewport);

    expect(html).toContain('data:image/png;base64,ZZZZ');
    expect(html).not.toMatch(/src=["'](?!data:)/);
  });

  it('reproduces mask, shadow, blend mode, and z-order styling', async () => {
    const image = makeImage({
      mask: { type: 'circle', cx: 150, cy: 75, radius: 50 },
      shadow: { enabled: true, color: '#ff0000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
      blendMode: 'multiply',
      zIndex: 7,
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.clipPath).toContain('ellipse');
    expect(frame.style.filter).toContain('drop-shadow');
    expect(frame.style.filter).toContain('rgba(255, 0, 0, 0.5)');
    expect(frame.style.mixBlendMode).toBe('multiply');
    expect(frame.style.zIndex).toBe('7');
  });

  // On the canvas, Konva's shadow is drawn through the image's full transform
  // matrix, so resizing an image (scaleX/scaleY) scales its shadow right
  // along with it — verified empirically against Canvas 2D's own
  // ctx.scale(n,n) behavior. The CSS export has to replicate that by hand
  // since drop-shadow's offset/blur are otherwise in pre-transform space.
  it('scales shadow blur and offset by the image scale as well as the viewport zoom', async () => {
    const image = makeImage({
      scaleX: 2,
      scaleY: 0.5,
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 4, offsetY: 4, opacity: 1 },
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    // viewport.scale = 2, so effective per-axis scale = (2*2, 2*0.5) = (4, 1);
    // offsetX 4*4=16, offsetY 4*1=4, blur 10*avg(4,1)=25
    expect(frame.style.filter).toBe('drop-shadow(16px 4px 25px rgba(0, 0, 0, 1))');
  });

  it('scales the crop region to the natural image size and hides the rest', async () => {
    const image = makeImage({
      width: 100,
      height: 100,
      crop: { x: 20, y: 20, width: 50, height: 50 },
    });
    const html = await exportToStaticHTML([image], viewport, {
      [image.id]: { width: 400, height: 400 },
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const img = doc.getElementById(image.id)?.querySelector('img') as HTMLImageElement;

    // screen size = 100*2 = 200px covering a 50px crop -> source-to-screen scale = 4
    expect(img.style.width).toBe('1600px'); // 400 * 4
    expect(img.style.height).toBe('1600px');
    expect(img.style.left).toBe('-80px'); // -20 * 4
    expect(img.style.top).toBe('-80px');
  });

  // Konva's Transformer lets a corner handle be dragged past the image's
  // opposite edge, which drives image.scaleX/scaleY negative on canvas (Konva
  // renders that as a mirror flip, same as flipX/flipY). Without correcting
  // for this, a negative scale produces a negative CSS `width`/`height`,
  // which browsers silently drop, collapsing the div to zero size — the
  // image renders fine on canvas but vanishes from the HTML export.
  it('renders a visible box when a resize drove the scale negative', async () => {
    const image = makeImage({ scaleX: -1, scaleY: 1 });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.width).toBe('600px');
    expect(frame.style.height).toBe('300px');
  });

  it('mirrors a negative-scale image the same way flipX does', async () => {
    const negativeScale = makeImage({ id: 'neg', scaleX: -1, scaleY: 1 });
    const flipped = makeImage({ id: 'flip', scaleX: 1, scaleY: 1, flipX: true });
    const html = await exportToStaticHTML([negativeScale, flipped], viewport);

    expect(parseFrame(html, 'neg').style.transform).toBe(parseFrame(html, 'flip').style.transform);
  });

  it('cancels the mirror when scale is negative and flipX is also set', async () => {
    const image = makeImage({ scaleX: -1, scaleY: 1, flipX: true });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.transform).toBe('rotate(0deg)');
  });

  it('omits mask, shadow, and blend mode styling when unset', async () => {
    const image = makeImage();
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.clipPath).toBe('');
    expect(frame.style.filter).toBe('');
    expect(frame.style.mixBlendMode).toBe('');
    expect(frame.style.maskImage).toBe('');
  });

  // Maps to CLAUDE.md → "Gradient Fade Mask on an Image"
  it('reproduces a gradient fade as a CSS mask-image linear-gradient', async () => {
    // width=200, height=100, scale=1 -> box is 200x100. A horizontal line
    // from (50,50) to (150,50) points straight "right" (90deg in CSS's
    // from-the-top convention). The CSS gradient-line-length formula for a
    // 200x100 box at 90deg is |200*sin90| + |100*cos90| = 200, and each
    // point's projection onto that line's center-relative axis is (x-100):
    // start -50 -> 25%, end +50 -> 75%.
    const image = makeImage({
      width: 200,
      height: 100,
      gradientMask: { start: { x: 50, y: 50 }, end: { x: 150, y: 50 } },
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.maskImage).toBe(
      'linear-gradient(90deg, rgba(0, 0, 0, 1) 25%, rgba(0, 0, 0, 0) 75%)'
    );
    expect(frame.getAttribute('style')).toContain(
      '-webkit-mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 25%, rgba(0, 0, 0, 0) 75%)'
    );
  });

  it('combines the gradient fade mask with a shape mask clip-path', async () => {
    const image = makeImage({
      mask: { type: 'rect', x: 0, y: 0, width: 200, height: 100 },
      gradientMask: { start: { x: 50, y: 50 }, end: { x: 150, y: 50 } },
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.clipPath).toContain('polygon');
    expect(frame.style.maskImage).toContain('linear-gradient');
  });

  // Maps to CLAUDE.md → "Circular Vignette on an Image"
  it('reproduces a vignette as a CSS mask-image radial-gradient sized to the rendered box', async () => {
    // width=200, height=100, scale=1, viewport.scale=2 -> rendered box is
    // 400x200, so the ellipse's reference size (its 100%-stop radii) is
    // half that: 200px horizontally, 100px vertically.
    const image = makeImage({
      width: 200,
      height: 100,
      vignette: { enabled: true, innerRadius: 0.4, outerRadius: 0.9 },
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.maskImage).toBe(
      'radial-gradient(ellipse 200px 100px at center, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0) 90%)'
    );
    expect(frame.getAttribute('style')).toContain(
      '-webkit-mask-image: radial-gradient(ellipse 200px 100px at center, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0) 90%)'
    );
  });

  it('omits the vignette styling when disabled', async () => {
    const image = makeImage({ vignette: { enabled: false, innerRadius: 0.4, outerRadius: 0.9 } });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.maskImage).toBe('');
  });

  it('combines a gradient fade and a vignette as two composited mask-image layers', async () => {
    const image = makeImage({
      gradientMask: { start: { x: 50, y: 50 }, end: { x: 250, y: 50 } },
      vignette: { enabled: true, innerRadius: 0.5, outerRadius: 1 },
    });
    const html = await exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);
    const style = frame.getAttribute('style') ?? '';

    expect(frame.style.maskImage).toContain('linear-gradient');
    expect(frame.style.maskImage).toContain('radial-gradient');
    // Two comma-separated layers need an explicit composite mode, or the
    // browser default ("add") unions them instead of multiplying their
    // alphas together — "intersect" (and its legacy -webkit equivalent,
    // source-in) is the Porter-Duff operator that actually multiplies.
    expect(frame.style.maskComposite).toBe('intersect');
    expect(style).toContain('-webkit-mask-composite: source-in');
  });
});
