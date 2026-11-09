import { describe, it, expect } from 'vitest';
import { zoomAbout, fitBounds } from '../utils/viewport';

// Maps to CLAUDE.md → "Figma-Style Canvas Navigation"
describe('zoomAbout', () => {
  it('keeps the content under the anchor point fixed on screen', () => {
    const view = { x: 40, y: -20, scale: 1.5 };
    const anchor = { x: 300, y: 200 };
    const before = { x: (anchor.x - view.x) / view.scale, y: (anchor.y - view.y) / view.scale };
    const next = zoomAbout(view, anchor, 2);
    expect(next.scale).toBeCloseTo(3);
    expect(before.x * next.scale + next.x).toBeCloseTo(anchor.x);
    expect(before.y * next.scale + next.y).toBeCloseTo(anchor.y);
  });

  it('clamps the scale between 0.05 and 10', () => {
    expect(zoomAbout({ x: 0, y: 0, scale: 8 }, { x: 0, y: 0 }, 4).scale).toBe(10);
    expect(zoomAbout({ x: 0, y: 0, scale: 0.1 }, { x: 0, y: 0 }, 0.1).scale).toBe(0.05);
  });
});

describe('fitBounds', () => {
  it('centres the bounds in the viewport with padding on the tighter axis', () => {
    const view = fitBounds({ x: 100, y: 100, width: 1000, height: 200 }, { width: 800, height: 600 }, 50);
    expect(view.scale).toBeCloseTo(0.7); // (800 - 2·50) / 1000
    const centre = { x: (100 + 500) * view.scale + view.x, y: (100 + 100) * view.scale + view.y };
    expect(centre.x).toBeCloseTo(400);
    expect(centre.y).toBeCloseTo(300);
  });

  it('never zooms past the maximum scale for a tiny bounds', () => {
    expect(fitBounds({ x: 0, y: 0, width: 1, height: 1 }, { width: 800, height: 600 }, 50).scale).toBe(10);
  });
});
