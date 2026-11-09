import Konva from 'konva';

// Pixel-accurate hit areas for images with transparency. Konva hit-tests an
// <Image> as its whole rectangle, so a sticker with a clear background used
// to swallow clicks meant for whatever shows through it. Instead the image's
// alpha is sampled once into a small black-and-clear mask, and the shape's
// hitFunc paints that mask in the shape's hit colour.

// Long-side resolution of the mask. Hit precision only has to be good to a
// few screen pixels, and this keeps a 4000px photo from costing 64MB.
const MASK_MAX_SIDE = 512;
// Pixels fainter than this don't catch clicks — a near-invisible fringe or
// the faded-out end of a gradient fade shouldn't block what's beneath.
const ALPHA_THRESHOLD = 32;

type Crop = { x: number; y: number; width: number; height: number } | undefined;

const cache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();

function sourceSize(source: HTMLImageElement | HTMLCanvasElement) {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

// Returns null when the (cropped) image is fully opaque, so ordinary photos
// keep Konva's cheap rectangle hit.
export function buildAlphaMask(
  source: HTMLImageElement | HTMLCanvasElement,
  crop?: Crop
): HTMLCanvasElement | null {
  const key = crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : '';
  let perSource = cache.get(source);
  if (perSource?.has(key)) return perSource.get(key) ?? null;

  const full = sourceSize(source);
  const region = crop ?? { x: 0, y: 0, width: full.width, height: full.height };
  let mask: HTMLCanvasElement | null = null;
  if (region.width > 0 && region.height > 0) {
    const ratio = Math.min(1, MASK_MAX_SIDE / Math.max(region.width, region.height));
    const w = Math.max(1, Math.round(region.width * ratio));
    const h = Math.max(1, Math.round(region.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      try {
        ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        let anyClear = false;
        for (let i = 3; i < px.length; i += 4) {
          const on = px[i] > ALPHA_THRESHOLD;
          if (!on) anyClear = true;
          px[i - 3] = px[i - 2] = px[i - 1] = 0;
          px[i] = on ? 255 : 0;
        }
        if (anyClear) {
          ctx.putImageData(data, 0, 0);
          mask = canvas;
        }
      } catch {
        // A tainted canvas can't be read back; fall back to the rectangle.
        mask = null;
      }
    }
  }

  if (!perSource) {
    perSource = new Map();
    cache.set(source, perSource);
  }
  perSource.set(key, mask);
  return mask;
}

// A hitFunc that paints `mask` in the shape's hit colour, stretched over the
// shape's box. Konva only counts fully opaque hit pixels, so the soft edges
// left by scaling simply miss.
export function buildAlphaHitFunc(mask: HTMLCanvasElement) {
  let tinted: HTMLCanvasElement | null = null;
  let tintedFor = '';
  return (context: Konva.Context, shape: Konva.Shape) => {
    const colorKey = shape.colorKey;
    if (!tinted || tintedFor !== colorKey) {
      tinted = document.createElement('canvas');
      tinted.width = mask.width;
      tinted.height = mask.height;
      const tctx = tinted.getContext('2d');
      if (!tctx) return;
      tctx.fillStyle = colorKey;
      tctx.fillRect(0, 0, mask.width, mask.height);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(mask, 0, 0);
      tintedFor = colorKey;
    }
    const raw = context._context;
    const smoothing = raw.imageSmoothingEnabled;
    raw.imageSmoothingEnabled = false;
    context.drawImage(tinted, 0, 0, shape.width(), shape.height());
    raw.imageSmoothingEnabled = smoothing;
  };
}
