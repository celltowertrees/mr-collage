import { CollageText, WARP_SHAPES } from '../types';
import { fontWeightFor } from './googleFonts';

export { WARP_SHAPES };

// One renderer for every text object, plain or WordArt. Layout is pure (it
// takes a measuring function rather than a canvas) so it can be unit tested
// and shared: the canvas node draws with it, the caret and click-to-place use
// its caret positions, and the HTML export bakes warped text with it.
//
// Text is laid out a glyph at a time rather than a line at a time, because
// warps place and turn each letter on its own. That gives up kerning between
// pairs, which is the same trade every WordArt-style tool makes.

export type TextMeasure = (text: string, font: string) => number;

export type WordArtStyle = Pick<
  CollageText,
  | 'text'
  | 'fontFamily'
  | 'fontSize'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'color'
  | 'align'
  | 'letterSpacing'
  | 'lineHeight'
  | 'gradient'
  | 'outline'
  | 'extrusion'
  | 'warp'
>;

// Fractions of the font size above and below the baseline that a line
// reserves. Fixed rather than measured so every font lays out on the same
// grid, and the HTML export's CSS line boxes line up with the canvas.
export const ASCENT = 0.8;
export const DESCENT = 0.22;
export const DEFAULT_LINE_HEIGHT = 1.2;

export interface Point {
  x: number;
  y: number;
}

// `x`/`y` is the point on the glyph's baseline under its horizontal centre,
// in the object's own local space (0,0 at the top-left of its box). The glyph
// is drawn turned by `angle` radians and scaled by `sx`/`sy` about that point.
export interface WordArtGlyph {
  char: string;
  index: number;
  line: number;
  x: number;
  y: number;
  angle: number;
  sx: number;
  sy: number;
  width: number;
  // How far the underline runs: the glyph plus the letter spacing after it,
  // so an underline stays continuous across spaced-out letters.
  advance: number;
}

export interface Caret {
  top: Point;
  bottom: Point;
}

export interface WordArtLayout {
  glyphs: WordArtGlyph[];
  bounds: { x: 0; y: 0; width: number; height: number };
  font: string;
  ascent: number;
  descent: number;
  // Where a caret sits before character `index` (0..text.length).
  caretAt: (index: number) => Caret;
  // The caret index nearest a point in local space.
  indexAt: (point: Point) => number;
  // The four corners of a glyph's box, for selection highlights.
  glyphQuad: (glyph: WordArtGlyph) => Point[];
}

export function wordArtFont(style: Pick<CollageText, 'bold' | 'italic' | 'fontSize' | 'fontFamily'>): string {
  return `${style.italic ? 'italic ' : ''}${fontWeightFor(style.bold)} ${style.fontSize}px '${style.fontFamily}', sans-serif`;
}

// Whether a text needs more than CSS can give it: warped letters and stacked
// extrusion copies have no CSS equivalent, so the HTML export bakes those.
export function needsBake(style: Pick<CollageText, 'warp' | 'extrusion'>): boolean {
  return (!!style.warp && style.warp.amount > 0) || (!!style.extrusion && style.extrusion.depth > 0);
}

interface WarpResult {
  x: number;
  y: number;
  angle: number;
  sy: number;
}

function rotate(p: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

// Maps an unwarped baseline position to its warped place. `blockWidth` is
// the widest line, `firstBaseline` the top line's baseline.
function makeWarp(
  style: WordArtStyle,
  blockWidth: number,
  firstBaseline: number
): (x: number, baseline: number) => WarpResult {
  const fs = style.fontSize;
  const a = Math.min(Math.max((style.warp?.amount ?? 0) / 100, 0), 1);
  const flat = (x: number, b: number): WarpResult => ({ x, y: b, angle: 0, sy: 1 });
  if (!style.warp || a === 0 || blockWidth <= 0) return flat;

  const W = blockWidth;
  const param = (x: number) => (2 * x) / W - 1; // -1 at the left edge, 1 at the right
  // Where a bulged or pinched letter's vertical middle sits relative to its
  // baseline, so scaling keeps the line's middle in place.
  const middle = ((DESCENT - ASCENT) / 2) * fs;

  switch (style.warp.shape) {
    case 'arch-up':
    case 'circle': {
      const theta = style.warp.shape === 'circle' ? Math.PI * (1 + 0.95 * a) : Math.PI * a;
      const R = W / theta;
      const cx = W / 2;
      const cy = firstBaseline + R;
      return (x, b) => {
        const psi = (param(x) * theta) / 2;
        const r = R - (b - firstBaseline);
        return { x: cx + r * Math.sin(psi), y: cy - r * Math.cos(psi), angle: psi, sy: 1 };
      };
    }
    case 'arch-down': {
      const theta = Math.PI * a;
      const R = W / theta;
      const cx = W / 2;
      const cy = firstBaseline - R;
      return (x, b) => {
        const psi = (param(x) * theta) / 2;
        const r = R + (b - firstBaseline);
        return { x: cx + r * Math.sin(psi), y: cy + r * Math.cos(psi), angle: -psi, sy: 1 };
      };
    }
    case 'wave': {
      // Capped by the line's length too, so a short word isn't thrown into
      // near-vertical slopes.
      const A = a * Math.min(fs * 0.5, W * 0.1);
      return (x, b) => {
        const phase = (2 * Math.PI * x) / W;
        return { x, y: b + A * Math.sin(phase), angle: Math.atan(((A * 2 * Math.PI) / W) * Math.cos(phase)), sy: 1 };
      };
    }
    case 'slant-up':
    case 'slant-down': {
      const rise = a * W * 0.35 * (style.warp.shape === 'slant-up' ? -1 : 1);
      const angle = Math.atan(rise / W);
      return (x, b) => ({ x, y: b + rise * (x / W - 0.5), angle, sy: 1 });
    }
    case 'bulge':
    case 'pinch': {
      const k = style.warp.shape === 'bulge' ? 0.8 * a : -0.6 * a;
      return (x, b) => {
        const sy = 1 + k * Math.cos((param(x) * Math.PI) / 2);
        return { x, y: b + middle * (1 - sy), angle: 0, sy };
      };
    }
  }
}

export function layoutWordArt(style: WordArtStyle, measure: TextMeasure): WordArtLayout {
  const fs = style.fontSize;
  const font = wordArtFont(style);
  const spacing = style.letterSpacing ?? 0;
  const lineAdvance = fs * (style.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const ascent = fs * ASCENT;
  const descent = fs * DESCENT;
  const lines = style.text.split('\n');

  // Unwarped pass: each line's glyph left edges and width.
  const measured = lines.map((line) => {
    const lefts: number[] = [];
    const widths: number[] = [];
    let cursor = 0;
    for (const ch of line) {
      const w = measure(ch, font);
      lefts.push(cursor);
      widths.push(w);
      cursor += w + spacing;
    }
    const width = line.length > 0 ? cursor - spacing : 0;
    return { lefts, widths, width };
  });
  const blockWidth = Math.max(0, ...measured.map((m) => m.width));
  const firstBaseline = ascent;
  const warp = makeWarp(style, blockWidth, firstBaseline);

  const glyphs: WordArtGlyph[] = [];
  // Every caret stop in raw (pre-normalization) coordinates, by text index.
  const carets: Caret[] = [];
  const toFrame = (anchor: WarpResult, local: Point): Point => {
    const p = rotate({ x: local.x, y: local.y * anchor.sy }, anchor.angle);
    return { x: anchor.x + p.x, y: anchor.y + p.y };
  };
  const caretIn = (anchor: WarpResult, dx: number): Caret => ({
    top: toFrame(anchor, { x: dx, y: -ascent }),
    bottom: toFrame(anchor, { x: dx, y: descent }),
  });

  let index = 0;
  lines.forEach((line, lineNo) => {
    const m = measured[lineNo];
    const offset =
      style.align === 'center' ? (blockWidth - m.width) / 2 : style.align === 'right' ? blockWidth - m.width : 0;
    const baseline = firstBaseline + lineNo * lineAdvance;
    // Code points, so an emoji draws whole; indices stay UTF-16 offsets to
    // match the textarea's selection.
    const chars = Array.from(line);
    let unit = 0;
    chars.forEach((ch, j) => {
      const w = m.widths[j];
      const at = warp(offset + m.lefts[j] + w / 2, baseline);
      const glyph: WordArtGlyph = {
        char: ch,
        index: index + unit,
        line: lineNo,
        x: at.x,
        y: at.y,
        angle: at.angle,
        sx: 1,
        sy: at.sy,
        width: w,
        advance: j < chars.length - 1 ? w + spacing : w,
      };
      glyphs.push(glyph);
      carets[index + unit] = caretIn(at, -w / 2);
      unit += ch.length;
    });
    // The stop after the line's last character (before its newline, or at
    // the very end of the text).
    const end = index + line.length;
    if (chars.length > 0) {
      const lastW = m.widths[chars.length - 1];
      const at = warp(offset + m.lefts[chars.length - 1] + lastW / 2, baseline);
      carets[end] = caretIn(at, lastW / 2);
    } else {
      carets[end] = caretIn(warp(offset, baseline), 0);
    }
    index = end + 1;
  });

  const quadRaw = (g: WordArtGlyph): Point[] => {
    const anchor = { x: g.x, y: g.y, angle: g.angle, sy: g.sy };
    return [
      toFrame(anchor, { x: -g.width / 2, y: -ascent }),
      toFrame(anchor, { x: g.width / 2, y: -ascent }),
      toFrame(anchor, { x: g.width / 2, y: descent }),
      toFrame(anchor, { x: -g.width / 2, y: descent }),
    ];
  };

  // Bounds: every glyph box and caret, grown by half the outline (a stroke
  // straddles the glyph edge) and by the extrusion's offset.
  const pts: Point[] = [];
  for (const g of glyphs) pts.push(...quadRaw(g));
  for (const c of carets) if (c) pts.push(c.top, c.bottom);
  let minX = Math.min(...pts.map((p) => p.x));
  let minY = Math.min(...pts.map((p) => p.y));
  let maxX = Math.max(...pts.map((p) => p.x));
  let maxY = Math.max(...pts.map((p) => p.y));
  const ext = extrusionOffset(style);
  minX = Math.min(minX, minX + ext.x);
  maxX = Math.max(maxX, maxX + ext.x);
  minY = Math.min(minY, minY + ext.y);
  maxY = Math.max(maxY, maxY + ext.y);
  const pad = (style.outline?.width ?? 0) / 2 + 1;
  const shiftX = pad - minX;
  const shiftY = pad - minY;

  for (const g of glyphs) {
    g.x += shiftX;
    g.y += shiftY;
  }
  const shift = (p: Point): Point => ({ x: p.x + shiftX, y: p.y + shiftY });
  // The middle of a surrogate pair has no stop of its own; it borrows the
  // one before it.
  for (let i = 1; i < carets.length; i++) if (!carets[i]) carets[i] = carets[i - 1];
  const shifted = carets.map((c) => ({ top: shift(c.top), bottom: shift(c.bottom) }));
  const textLength = style.text.length;

  return {
    glyphs,
    font,
    ascent,
    descent,
    bounds: { x: 0, y: 0, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 },
    caretAt: (i) => shifted[Math.min(Math.max(i, 0), textLength)],
    indexAt: (p) => {
      let best = 0;
      let bestDist = Infinity;
      shifted.forEach((c, i) => {
        const mx = (c.top.x + c.bottom.x) / 2;
        const my = (c.top.y + c.bottom.y) / 2;
        const d = (mx - p.x) ** 2 + (my - p.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    },
    glyphQuad: quadRaw,
  };
}

function extrusionOffset(style: Pick<CollageText, 'extrusion'>): Point {
  const e = style.extrusion;
  if (!e || e.depth <= 0) return { x: 0, y: 0 };
  const rad = (e.angle * Math.PI) / 180;
  return { x: Math.cos(rad) * e.depth, y: Math.sin(rad) * e.depth };
}

// Darkens (factor < 1) or lightens a #rgb / #rrggbb colour.
export function shadeHex(hex: string, factor: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const ch = (shift: number) => Math.min(255, Math.max(0, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// The gradient's end points in local space: a line through the box's centre
// at the gradient angle, long enough to span the box's projection on it.
export function gradientLine(
  angleDeg: number,
  width: number,
  height: number
): { start: Point; end: Point } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  return {
    start: { x: width / 2 - dx * half, y: height / 2 - dy * half },
    end: { x: width / 2 + dx * half, y: height / 2 + dy * half },
  };
}

export function drawWordArt(ctx: CanvasRenderingContext2D, style: WordArtStyle, layout: WordArtLayout): void {
  const fs = style.fontSize;
  ctx.save();
  ctx.font = layout.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const eachGlyph = (paint: (g: WordArtGlyph) => void, dx = 0, dy = 0) => {
    for (const g of layout.glyphs) {
      ctx.save();
      ctx.translate(g.x + dx, g.y + dy);
      ctx.rotate(g.angle);
      ctx.scale(g.sx, g.sy);
      paint(g);
      ctx.restore();
    }
  };
  const underline = (g: WordArtGlyph) => {
    if (style.underline) ctx.fillRect(-g.width / 2, fs * 0.1, g.advance, Math.max(1, fs * 0.06));
  };
  const outlineWidth = style.outline?.width ?? 0;

  // Extrusion: copies stacked back along the extrusion angle, the farthest
  // darkest, drawn first so the face sits on top.
  const ext = extrusionOffset(style);
  if (style.extrusion && style.extrusion.depth > 0) {
    const steps = Math.min(Math.ceil(style.extrusion.depth), 64);
    for (let i = steps; i >= 1; i--) {
      const f = i / steps;
      const color = shadeHex(style.extrusion.color, 1 - 0.45 * f);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = outlineWidth;
      eachGlyph((g) => {
        ctx.fillText(g.char, 0, 0);
        if (outlineWidth > 0) ctx.strokeText(g.char, 0, 0);
        underline(g);
      }, ext.x * f, ext.y * f);
    }
  }

  if (style.outline && outlineWidth > 0) {
    ctx.strokeStyle = style.outline.color;
    ctx.lineWidth = outlineWidth;
    eachGlyph((g) => {
      ctx.strokeText(g.char, 0, 0);
      if (style.underline) ctx.strokeRect(-g.width / 2, fs * 0.1, g.advance, Math.max(1, fs * 0.06));
    });
  }

  // The fill. A gradient is defined across the whole box, so each glyph gets
  // it mapped back into its own turned and scaled frame — otherwise every
  // letter would carry its own copy of the full gradient.
  const line = style.gradient ? gradientLine(style.gradient.angle, layout.bounds.width, layout.bounds.height) : null;
  eachGlyph((g) => {
    if (style.gradient && line) {
      const toGlyph = (p: Point) => {
        const r = rotate({ x: p.x - g.x, y: p.y - g.y }, -g.angle);
        return { x: r.x / g.sx, y: r.y / g.sy };
      };
      const s = toGlyph(line.start);
      const e = toGlyph(line.end);
      const grad = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
      grad.addColorStop(0, style.color);
      grad.addColorStop(1, style.gradient.to);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = style.color;
    }
    ctx.fillText(g.char, 0, 0);
    underline(g);
  });

  ctx.restore();
}

// A corner drag on the canvas scales the node; on release that scale is
// folded into the font size (and everything sized alongside it), so text
// stays crisp and the Size control shows what's on screen.
export function bakeTextResize(obj: CollageText, scaleX: number, scaleY: number): Partial<CollageText> {
  const f = Math.abs(scaleY) || 1;
  const r = (n: number) => Math.round(n * 100) / 100;
  const changes: Partial<CollageText> = {
    fontSize: r(obj.fontSize * f),
    width: obj.width * f,
    height: obj.height * f,
    scaleX: Math.sign(scaleX) || 1,
    scaleY: Math.sign(scaleY) || 1,
  };
  if (obj.letterSpacing) changes.letterSpacing = r(obj.letterSpacing * f);
  if (obj.outline) changes.outline = { ...obj.outline, width: r(obj.outline.width * f) };
  if (obj.extrusion) changes.extrusion = { ...obj.extrusion, depth: r(obj.extrusion.depth * f) };
  if (obj.gradientMask) {
    const { start, end } = obj.gradientMask;
    changes.gradientMask = { start: { x: start.x * f, y: start.y * f }, end: { x: end.x * f, y: end.y * f } };
  }
  return changes;
}

// Measures with a shared offscreen canvas, caching per font and character.
const measureCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;
export const canvasMeasure: TextMeasure = (text, font) => {
  const key = `${font}|${text}`;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = font;
  const w = measureCtx.measureText(text).width;
  measureCache.set(key, w);
  return w;
};

// Fonts finish loading after first use; cached widths measured with the
// fallback font must go once the real one is ready.
export function clearMeasureCache(fontFamily: string): void {
  for (const key of measureCache.keys()) if (key.includes(`'${fontFamily}'`)) measureCache.delete(key);
}

// Draws a text into a fresh canvas at `pixelRatio`, for the gradient fade
// and the HTML export.
export function rasterizeWordArt(
  style: WordArtStyle,
  pixelRatio: number,
  measure: TextMeasure = canvasMeasure
): HTMLCanvasElement | null {
  const layout = layoutWordArt(style, measure);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(layout.bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(layout.bounds.height * pixelRatio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(pixelRatio, pixelRatio);
  drawWordArt(ctx, style, layout);
  return canvas;
}
