import Konva from 'konva';
import { CropRect, GradientMask, MaskData, VignetteData } from '../types';

// Shared between CollageImageNode and CollageTextNode — both kinds support
// the same clip/fade/shadow effects, differing only in what raster content
// they clip/composite (a loaded <img> for images, a rasterized offscreen
// canvas of the live Text shape for text — see CollageTextNode's
// gradientSource).

export function tracePath(ctx: Konva.Context, mask: MaskData): boolean {
  ctx.beginPath();
  switch (mask.type) {
    case 'circle':
      ctx.arc(mask.cx, mask.cy, mask.radius, 0, Math.PI * 2);
      break;
    case 'rect':
      ctx.rect(mask.x, mask.y, mask.width, mask.height);
      break;
    case 'polygon':
      if (mask.points.length < 3) return false;
      ctx.moveTo(mask.points[0].x, mask.points[0].y);
      for (let i = 1; i < mask.points.length; i++) {
        ctx.lineTo(mask.points[i].x, mask.points[i].y);
      }
      ctx.closePath();
      break;
  }
  return true;
}

export function buildClipFunc(mask: MaskData) {
  return (ctx: Konva.Context) => {
    tracePath(ctx, mask);
  };
}

// Bakes the gradient fade and/or vignette directly into a copy of the
// content's pixels (Canvas 2D has no notion of a live CSS-style mask-image),
// so it composites the same way regardless of what other clipping (shape
// mask) sits on top of it. Applying both as sequential destination-in passes
// multiplies their alphas together, so the two fades combine rather than one
// replacing the other. Built at the content's own logical width/height — the
// same crop-aware box its mask/crop coordinates already live in — so the
// result can stand in for the raw source everywhere Konva would otherwise use
// it. `source` is a raster of whatever's being faded: a loaded <img> for
// images (optionally with `crop` applied), or a canvas of the rasterized Text
// shape for text (which has no `crop` concept, always passed undefined).
export function buildFadeMaskedCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  crop: CropRect | undefined,
  gradientMask: GradientMask | undefined,
  vignette: VignetteData | undefined
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (crop) {
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } else {
    ctx.drawImage(source, 0, 0, width, height);
  }
  ctx.globalCompositeOperation = 'destination-in';

  if (gradientMask) {
    const gradient = ctx.createLinearGradient(
      gradientMask.start.x,
      gradientMask.start.y,
      gradientMask.end.x,
      gradientMask.end.y
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  if (vignette?.enabled) {
    // Scaling the context by the content's own half-width/half-height turns a
    // plain circular radial gradient into an ellipse fit to its aspect ratio
    // — innerRadius/outerRadius (fractions where 1.0 reaches an edge
    // midpoint) can then be used directly as the gradient's radii.
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(width / 2, height / 2);
    const radial = ctx.createRadialGradient(0, 0, vignette.innerRadius, 0, 0, vignette.outerRadius);
    radial.addColorStop(0, 'rgba(0, 0, 0, 1)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  return canvas;
}

// Draws a solid, unclipped fill of the mask shape so its native canvas shadow
// (which must extend past the mask outline) isn't cut off by the content's
// own clip region. The masked content is drawn on top and exactly covers the
// fill, leaving only the shadow visible around the masked silhouette.
export function buildMaskShadowSceneFunc(mask: MaskData) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    if (tracePath(ctx, mask) === false) return;
    ctx.fillStrokeShape(shape);
  };
}
