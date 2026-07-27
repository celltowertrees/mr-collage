import { CanvasState, CollageImage, GradientMask, MaskData, VignetteData } from './types';

const STORAGE_KEY = 'mr-collage-state';
const DB_NAME = 'mr-collage-db';
const DB_VERSION = 1;
const IMG_STORE = 'images';

// ── IndexedDB helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

// ── Save / Load ──
// Metadata (positions, masks, etc.) → localStorage (tiny)
// Image blobs (data URLs) → IndexedDB (large)

type MetadataImage = Omit<CollageImage, 'src'>;

interface StoredState {
  images: MetadataImage[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export async function saveState(state: CanvasState): Promise<void> {
  // Write image data URLs to IndexedDB
  const currentIds = new Set<string>();
  for (const img of state.images) {
    currentIds.add(img.id);
    await idbPut(img.id, img.src);
  }

  // Clean up removed images from IndexedDB
  const allKeys = await idbAllKeys();
  for (const key of allKeys) {
    if (!currentIds.has(key)) {
      await idbDelete(key);
    }
  }

  // Write metadata (without src) to localStorage
  const meta: StoredState = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    images: state.images.map(({ src: _src, ...rest }) => rest),
    stagePosition: state.stagePosition,
    stageScale: state.stageScale,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export async function loadState(): Promise<CanvasState | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as StoredState;
    // Rehydrate image sources from IndexedDB
    const images: CollageImage[] = [];
    for (const imgMeta of meta.images) {
      const src = await idbGet(imgMeta.id);
      if (src) {
        images.push({ ...imgMeta, src });
      }
      // Skip images whose blob was lost
    }
    return {
      images,
      stagePosition: meta.stagePosition,
      stageScale: meta.stageScale,
    };
  } catch {
    return null;
  }
}

// ── ICP Export ──

export function exportToICP(images: CollageImage[]): object {
  return {
    "infinite-canvas": {
      version: "0.1",
      nodes: images.map((img) => ({
        id: img.id,
        type: "image",
        position: { x: img.x, y: img.y },
        size: {
          width: img.width * img.scaleX,
          height: img.height * img.scaleY,
        },
        rotation: img.rotation,
        opacity: img.opacity,
        zIndex: img.zIndex,
        data: {
          src: img.src,
          name: img.name,
          ...(img.mask ? { mask: img.mask } : {}),
          ...(img.gradientMask ? { gradientMask: img.gradientMask } : {}),
          ...(img.vignette?.enabled ? { vignette: img.vignette } : {}),
          ...(img.shadow?.enabled ? { shadow: img.shadow } : {}),
          ...(img.blendMode ? { blendMode: img.blendMode } : {}),
          ...(img.crop ? { crop: img.crop } : {}),
          ...(img.flipX ? { flipX: img.flipX } : {}),
          ...(img.flipY ? { flipY: img.flipY } : {}),
        },
      })),
    },
  };
}

// ── Static HTML Export ──
// Renders the current viewport (pan + zoom) as absolutely-positioned <div>s
// instead of a canvas, so the output is a plain, portable HTML file.
//
// PARITY CONTRACT: this is a second, independent implementation of how a
// CollageImage looks — Konva (CollageImageNode.tsx) renders the same data
// through Canvas 2D, this file renders it through CSS. The two engines don't
// share code and don't share transform/filter semantics, so nothing keeps
// them in sync automatically. Whenever CollageImageNode.tsx changes how a
// visual property is drawn, or a new one is added, the equivalent here needs
// a matching update — verify against the *canvas's actual behavior*, not
// just intuition (that's how the shadow-scaling bug below happened: CSS
// drop-shadow's offset/blur are in the element's own pre-transform space,
// but Canvas 2D draws shadows through the full transform matrix, so a
// resized image's shadow grows with it on canvas but silently didn't here
// until it was scaled by hand). Add a Vitest case in
// exportToStaticHTML.test.ts pinning the exact expected CSS for anything new
// — a full pixel-diff between the two renderers was tried and abandoned
// because CSS `filter` doesn't survive the DOM->canvas rasterization needed
// to sample HTML pixels for comparison (confirmed empirically: a live
// drop-shadow renders fine on screen but produces zero shadow pixels once
// piped through an SVG foreignObject -> canvas, which is the only way to
// read pixel values back out of rendered HTML), so per-property unit tests
// pinned to verified canvas behavior are the real safety net here, not an
// automated visual diff.

export interface ExportViewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mask coordinates live in the image's own unscaled 0..width / 0..height
// space, which is exactly the box a frame div renders at (its CSS
// width/height already carry the viewport zoom and image scale), so mask
// coords convert straight to percentages of that box.
function maskToClipPath(mask: MaskData, width: number, height: number): string {
  const pctX = (v: number) => `${(v / width) * 100}%`;
  const pctY = (v: number) => `${(v / height) * 100}%`;
  switch (mask.type) {
    case 'circle':
      return `ellipse(${pctX(mask.radius)} ${pctY(mask.radius)} at ${pctX(mask.cx)} ${pctY(mask.cy)})`;
    case 'rect': {
      const x0 = pctX(mask.x);
      const y0 = pctY(mask.y);
      const x1 = pctX(mask.x + mask.width);
      const y1 = pctY(mask.y + mask.height);
      return `polygon(${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1})`;
    }
    case 'polygon':
      return `polygon(${mask.points.map((p) => `${pctX(p.x)} ${pctY(p.y)}`).join(', ')})`;
  }
}

// On canvas, the gradient fade is baked into the image's own pixels with
// Canvas 2D's createLinearGradient(start, end) at the image's raw, unscaled
// pixel size — then Konva stretches that finished bitmap by scaleX/scaleY
// like any other pixel, so a non-uniform scale visually skews the fade's
// direction right along with the image content. CSS mask-image's
// linear-gradient() has no point-to-point form: it's defined by an angle,
// and the gradient line's length is derived from the box it's painted into
// via the spec formula `|W*sin(angle)| + |H*cos(angle)|` (long enough to
// exactly touch the box's corners). To reproduce the same skew, both the
// box dimensions and the start/end points passed in here must already be
// pre-scaled by scaleX/scaleY (viewport zoom is scale-neutral for a
// percentage-based angle+stops and can be left out) — verified against the
// canvas behavior with a horizontal line on a 200x100 box (90deg, line
// length 200, points at x=50/150 -> 25%/75%).
function gradientMaskToCss(gradientMask: GradientMask, width: number, height: number): string {
  const dx = gradientMask.end.x - gradientMask.start.x;
  const dy = gradientMask.end.y - gradientMask.start.y;
  const angleRad = Math.atan2(dx, -dy);
  const angleDeg = (angleRad * 180) / Math.PI;
  const lineLength = Math.abs(width * Math.sin(angleRad)) + Math.abs(height * Math.cos(angleRad));

  const project = (p: { x: number; y: number }) =>
    (p.x - width / 2) * Math.sin(angleRad) - (p.y - height / 2) * Math.cos(angleRad);
  const toPercent = (t: number) => (lineLength === 0 ? 0 : ((t + lineLength / 2) / lineLength) * 100);

  const startPct = toPercent(project(gradientMask.start));
  const endPct = toPercent(project(gradientMask.end));

  return `linear-gradient(${angleDeg}deg, rgba(0, 0, 0, 1) ${startPct}%, rgba(0, 0, 0, 0) ${endPct}%)`;
}

// On canvas, the vignette is baked in by scaling the drawing context by the
// image's own half-width/half-height before painting a circular radial
// gradient — that turns innerRadius/outerRadius (fractions where 1.0 reaches
// an edge midpoint) into an ellipse fit to the image's aspect ratio. CSS
// radial-gradient's explicit `ellipse WxH` form does the same thing
// natively: giving it the box's actual half-width/half-height as the
// reference ("100%") size means innerRadius/outerRadius already work
// directly as percentage stops, no separate angle math needed the way the
// linear gradient required.
function vignetteMaskToCss(vignette: VignetteData, boxWidth: number, boxHeight: number): string {
  const hRadius = boxWidth / 2;
  const vRadius = boxHeight / 2;
  const innerPct = vignette.innerRadius * 100;
  const outerPct = vignette.outerRadius * 100;
  return `radial-gradient(ellipse ${hRadius}px ${vRadius}px at center, rgba(0, 0, 0, 1) ${innerPct}%, rgba(0, 0, 0, 0) ${outerPct}%)`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rotation tilts the image's true screen-space bounding box away from its
// unrotated frame rect, so culling needs the corners rotated around the
// center rather than the frame's own left/top/width/height.
function isVisibleInViewport(img: CollageImage, viewport: ExportViewport): boolean {
  const screenWidth = img.width * img.scaleX * viewport.scale;
  const screenHeight = img.height * img.scaleY * viewport.scale;
  const centerX = img.x * viewport.scale + viewport.x;
  const centerY = img.y * viewport.scale + viewport.y;
  const rad = (img.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = screenWidth / 2;
  const hh = screenHeight / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos,
  }));
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));

  return maxX > 0 && minX < viewport.width && maxY > 0 && minY < viewport.height;
}

function renderImageNode(
  img: CollageImage,
  viewport: ExportViewport,
  naturalSize?: { width: number; height: number }
): string {
  // Konva's Transformer allows a corner handle to be dragged past the
  // image's opposite edge, which drives scaleX/scaleY negative — Konva
  // renders that as a mirror flip rather than a negative-sized box. CSS
  // has no such notion: a negative width/height is an invalid declaration
  // that gets silently dropped, collapsing the element to zero size. So the
  // box must always use the magnitude, with the sign folded into the same
  // mirror transform as the explicit flipX/flipY flags (a negative scale
  // and flipX both flipping cancels out, same as two mirrors).
  const screenWidth = img.width * Math.abs(img.scaleX) * viewport.scale;
  const screenHeight = img.height * Math.abs(img.scaleY) * viewport.scale;
  const centerX = img.x * viewport.scale + viewport.x;
  const centerY = img.y * viewport.scale + viewport.y;
  const left = centerX - screenWidth / 2;
  const top = centerY - screenHeight / 2;

  const mirrorX = Boolean(img.flipX) !== (img.scaleX < 0);
  const mirrorY = Boolean(img.flipY) !== (img.scaleY < 0);
  const flip = `${mirrorX ? ' scaleX(-1)' : ''}${mirrorY ? ' scaleY(-1)' : ''}`;

  const frameStyles = [
    'position: absolute',
    `left: ${left}px`,
    `top: ${top}px`,
    `width: ${screenWidth}px`,
    `height: ${screenHeight}px`,
    `transform: rotate(${img.rotation}deg)${flip}`,
    'transform-origin: center center',
    `opacity: ${img.opacity}`,
    `z-index: ${img.zIndex}`,
  ];

  if (img.mask) {
    frameStyles.push(`clip-path: ${maskToClipPath(img.mask, img.width, img.height)}`);
  }

  const maskLayers: string[] = [];
  if (img.gradientMask) {
    const scaleX = Math.abs(img.scaleX);
    const scaleY = Math.abs(img.scaleY);
    const scaled = {
      start: { x: img.gradientMask.start.x * scaleX, y: img.gradientMask.start.y * scaleY },
      end: { x: img.gradientMask.end.x * scaleX, y: img.gradientMask.end.y * scaleY },
    };
    maskLayers.push(gradientMaskToCss(scaled, img.width * scaleX, img.height * scaleY));
  }
  if (img.vignette?.enabled) {
    maskLayers.push(vignetteMaskToCss(img.vignette, screenWidth, screenHeight));
  }
  if (maskLayers.length > 0) {
    const maskCss = maskLayers.join(', ');
    frameStyles.push(`mask-image: ${maskCss}`, `-webkit-mask-image: ${maskCss}`);
    if (maskLayers.length > 1) {
      // Two fades need to multiply together (only visible where both leave
      // it visible), not union — "intersect" is the standard property's
      // Porter-Duff operator for that; -webkit-mask-composite predates the
      // standard and spells the same operator "source-in".
      frameStyles.push('mask-composite: intersect', '-webkit-mask-composite: source-in');
    }
  }

  if (img.shadow?.enabled) {
    const { color, blur, offsetX, offsetY, opacity } = img.shadow;
    const shadowColor = hexToRgba(color, opacity);
    // Canvas 2D shadow properties are drawn through the node's full transform
    // matrix, so on the canvas a resized image's shadow grows/shrinks with
    // it (verified empirically: ctx.scale(3,3) triples a shadow's blur and
    // offset, not just the shape). CSS drop-shadow's offset/blur are in the
    // element's own pre-transform space and only inherit the *rotation and
    // mirroring* for free via the enclosing `transform: rotate() scaleX(-1)`
    // — the magnitude of the scale still has to be applied by hand here, per
    // axis for offset and as their average for blur (drop-shadow has no
    // separate x/y blur radius). Using the signed scale here would flip the
    // offset a second time on top of the mirror transform already handling it.
    const shadowScaleX = viewport.scale * Math.abs(img.scaleX);
    const shadowScaleY = viewport.scale * Math.abs(img.scaleY);
    const shadowScaleAvg = (shadowScaleX + shadowScaleY) / 2;
    frameStyles.push(
      `filter: drop-shadow(${offsetX * shadowScaleX}px ${offsetY * shadowScaleY}px ${blur * shadowScaleAvg}px ${shadowColor})`
    );
  }

  if (img.blendMode) {
    frameStyles.push(`mix-blend-mode: ${img.blendMode}`);
  }

  let imgStyle: string;
  if (img.crop && naturalSize) {
    // Source-pixel-to-screen-pixel scale already bakes in the viewport zoom
    // and the image's own scaleX/scaleY via screenWidth/screenHeight, so the
    // full (uncropped) image just needs to be blown up by that same ratio
    // and nudged so the cropped region lands at (0,0).
    const scaleX = screenWidth / img.crop.width;
    const scaleY = screenHeight / img.crop.height;
    const imgWidth = naturalSize.width * scaleX;
    const imgHeight = naturalSize.height * scaleY;
    const imgLeft = -img.crop.x * scaleX;
    const imgTop = -img.crop.y * scaleY;
    imgStyle = `position: absolute; left: ${imgLeft}px; top: ${imgTop}px; width: ${imgWidth}px; height: ${imgHeight}px; max-width: none`;
  } else {
    imgStyle = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%';
  }

  return `  <div class="collage-object" id="${img.id}" style="${frameStyles.join('; ')}">
    <div style="position: relative; width: 100%; height: 100%; overflow: hidden">
      <img src="${img.src}" alt="${escapeAttr(img.name)}" style="${imgStyle}" />
    </div>
  </div>`;
}

export function exportToStaticHTML(
  images: CollageImage[],
  viewport: ExportViewport,
  naturalSizes: Record<string, { width: number; height: number }> = {}
): string {
  const visible = images.filter((img) => isVisibleInViewport(img, viewport));
  const sorted = visible.sort((a, b) => a.zIndex - b.zIndex);
  const nodes = sorted.map((img) => renderImageNode(img, viewport, naturalSizes[img.id])).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Collage Export</title>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
</style>
</head>
<body>
<div class="collage-viewport" style="position: relative; isolation: isolate; width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden">
${nodes}
</div>
</body>
</html>
`;
}
