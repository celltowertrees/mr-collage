import { describe, expect, it } from 'vitest';
import { exportToStaticHTML, ExportViewport } from '../store';
import { CollageImage } from '../types';

function makeImage(overrides: Partial<CollageImage> = {}): CollageImage {
  return {
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

  it('positions and sizes each image relative to the current viewport', () => {
    const image = makeImage();
    const html = exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    // screen size = width/height * scale ; center = x/y * scale + viewport offset
    expect(frame.style.width).toBe('600px'); // 300 * 2
    expect(frame.style.height).toBe('300px'); // 150 * 2
    // center = (100*2 - 50, 200*2 - 20) = (150, 380); left/top = center - size/2
    expect(frame.style.left).toBe('-150px');
    expect(frame.style.top).toBe('230px');
  });

  it('sizes the page to the viewport', () => {
    const image = makeImage();
    const html = exportToStaticHTML([image], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container = doc.querySelector('.collage-viewport') as HTMLElement;

    expect(container.style.width).toBe('1024px');
    expect(container.style.height).toBe('768px');
    expect(container.style.overflow).toBe('hidden');
  });

  it('omits images entirely outside the viewport from the markup', () => {
    // screen center = (100*2 - 50, 200*2 - 20) = (150, 380); comfortably inside 1024x768
    const inside = makeImage({ id: 'inside' });
    // screen center way past the right/bottom edge of the 1024x768 viewport
    const outside = makeImage({ id: 'outside', x: 5000, y: 5000, width: 50, height: 50 });
    const html = exportToStaticHTML([inside, outside], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.getElementById('inside')).not.toBeNull();
    expect(doc.getElementById('outside')).toBeNull();
  });

  it('keeps images that only partially overlap the viewport', () => {
    // screen center = (-75*2 - 50, 200*2 - 20) = (-200, 380): left of the
    // viewport's x=0 edge, but wide enough (600px) that its right side
    // (-200 + 300 = 100) still pokes into frame
    const straddling = makeImage({ id: 'straddling', x: -75, y: 200, width: 300, height: 150 });
    const html = exportToStaticHTML([straddling], viewport);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.getElementById('straddling')).not.toBeNull();
  });

  it('embeds each image inline as its data URL, with no external references', () => {
    const image = makeImage({ src: 'data:image/png;base64,ZZZZ' });
    const html = exportToStaticHTML([image], viewport);

    expect(html).toContain('data:image/png;base64,ZZZZ');
    expect(html).not.toMatch(/src=["'](?!data:)/);
  });

  it('reproduces mask, shadow, blend mode, and z-order styling', () => {
    const image = makeImage({
      mask: { type: 'circle', cx: 150, cy: 75, radius: 50 },
      shadow: { enabled: true, color: '#ff0000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
      blendMode: 'multiply',
      zIndex: 7,
    });
    const html = exportToStaticHTML([image], viewport);
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
  it('scales shadow blur and offset by the image scale as well as the viewport zoom', () => {
    const image = makeImage({
      scaleX: 2,
      scaleY: 0.5,
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 4, offsetY: 4, opacity: 1 },
    });
    const html = exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    // viewport.scale = 2, so effective per-axis scale = (2*2, 2*0.5) = (4, 1);
    // offsetX 4*4=16, offsetY 4*1=4, blur 10*avg(4,1)=25
    expect(frame.style.filter).toBe('drop-shadow(16px 4px 25px rgba(0, 0, 0, 1))');
  });

  it('scales the crop region to the natural image size and hides the rest', () => {
    const image = makeImage({
      width: 100,
      height: 100,
      crop: { x: 20, y: 20, width: 50, height: 50 },
    });
    const html = exportToStaticHTML([image], viewport, {
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

  it('omits mask, shadow, and blend mode styling when unset', () => {
    const image = makeImage();
    const html = exportToStaticHTML([image], viewport);
    const frame = parseFrame(html, image.id);

    expect(frame.style.clipPath).toBe('');
    expect(frame.style.filter).toBe('');
    expect(frame.style.mixBlendMode).toBe('');
  });
});
