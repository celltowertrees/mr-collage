import { TexturePreset } from '../types';

// ── Procedural surface patterns ──
// Drawn in code at a fixed tile size and cached, so a preset texture costs one
// small canvas per pattern for the whole session and nothing at all to
// persist. Each is drawn in greyscale on white: three multiplies the map by
// the material's colour, so the colour swatch tints the pattern instead of
// being replaced by it.

const TILE = 256;

const cache = new Map<TexturePreset, HTMLCanvasElement>();

function draw(preset: TexturePreset, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#6f6f6f';

  switch (preset) {
    case 'checker': {
      const n = 8;
      const s = TILE / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(x * s, y * s, s, s);
        }
      }
      break;
    }
    case 'grid': {
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = 6;
      const n = 4;
      const s = TILE / n;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        ctx.moveTo(i * s, 0);
        ctx.lineTo(i * s, TILE);
        ctx.moveTo(0, i * s);
        ctx.lineTo(TILE, i * s);
      }
      ctx.stroke();
      break;
    }
    case 'stripes': {
      const n = 8;
      const s = TILE / n;
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * s, 0, s, TILE);
      break;
    }
    case 'dots': {
      const n = 6;
      const s = TILE / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          ctx.beginPath();
          ctx.arc((x + 0.5) * s, (y + 0.5) * s, s * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'noise': {
      const img = ctx.createImageData(TILE, TILE);
      // Deterministic so the pattern is identical every session — a texture
      // that reshuffles on reload would read as a rendering bug.
      let seed = 1337;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const v = 150 + (seed % 106);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'brushed': {
      // Horizontal streaks of varying lightness read as brushed metal once
      // metalness is turned up.
      let seed = 99;
      for (let y = 0; y < TILE; y++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const v = 190 + (seed % 56);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(0, y, TILE, 1);
      }
      break;
    }
  }
}

export function presetTextureCanvas(preset: TexturePreset): HTMLCanvasElement | null {
  const hit = cache.get(preset);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(preset, ctx);
  cache.set(preset, canvas);
  return canvas;
}
