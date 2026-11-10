import { describe, it, expect } from 'vitest';
import { fitBackgroundFrame, subjectMask } from '../utils/backgroundFrame';

// Maps to CLAUDE.md → "Content-Aware Background Generation"
describe('fitBackgroundFrame', () => {
  it('uses the drawn rectangle as-is when it already matches an output shape', () => {
    const frame = fitBackgroundFrame({ x: 100, y: 50, width: 600, height: 400 });
    expect(frame.size).toBe('1536x1024');
    expect(frame.capture).toEqual({ x: 100, y: 50, width: 600, height: 400 });
    expect(frame.crop).toEqual({ x: 0, y: 0, width: 1536, height: 1024 });
  });

  it('grows a too-wide rectangle evenly above and below to reach the output shape', () => {
    const frame = fitBackgroundFrame({ x: 0, y: 100, width: 600, height: 200 });
    expect(frame.size).toBe('1536x1024');
    // 600 wide at 3:2 is 400 tall: 100 extra on each side.
    expect(frame.capture).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    // The drawn rectangle is the middle half of the output.
    expect(frame.crop).toEqual({ x: 0, y: 256, width: 1536, height: 512 });
  });

  it('grows a too-tall rectangle evenly left and right', () => {
    const frame = fitBackgroundFrame({ x: 100, y: 0, width: 200, height: 600 });
    expect(frame.size).toBe('1024x1536');
    expect(frame.capture).toEqual({ x: 0, y: 0, width: 400, height: 600 });
    expect(frame.crop).toEqual({ x: 256, y: 0, width: 512, height: 1536 });
  });

  it('picks the square output for a near-square rectangle', () => {
    const frame = fitBackgroundFrame({ x: 0, y: 0, width: 440, height: 400 });
    expect(frame.size).toBe('1024x1024');
    expect(frame.capture).toEqual({ x: 0, y: -20, width: 440, height: 440 });
    expect(frame.crop).toEqual({ x: 0, y: 47, width: 1024, height: 931 });
  });

  it('always crops back to the drawn rectangle\'s own shape', () => {
    for (const rect of [
      { x: 3, y: 7, width: 913, height: 211 },
      { x: -40, y: 12, width: 130, height: 777 },
      { x: 0, y: 0, width: 333, height: 301 },
    ]) {
      const { crop, capture, outWidth, outHeight } = fitBackgroundFrame(rect);
      expect(crop.width / crop.height).toBeCloseTo(rect.width / rect.height, 1);
      expect(capture.width / capture.height).toBeCloseTo(outWidth / outHeight, 6);
      // The capture always contains the drawn rectangle.
      expect(capture.x).toBeLessThanOrEqual(rect.x);
      expect(capture.y).toBeLessThanOrEqual(rect.y);
      expect(capture.x + capture.width).toBeGreaterThanOrEqual(rect.x + rect.width - 1e-9);
      expect(capture.y + capture.height).toBeGreaterThanOrEqual(rect.y + rect.height - 1e-9);
    }
  });
});

describe('subjectMask', () => {
  it('keeps the pixels the objects cover and opens up the empty canvas', () => {
    // Four RGBA pixels: opaque red, empty, faint antialiasing, half-covered.
    const capture = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 0, 0,
      10, 10, 10, 8,
      0, 0, 255, 128,
    ]);
    const mask = subjectMask(capture);
    expect(Array.from(mask.data.filter((_, i) => i % 4 === 3))).toEqual([255, 0, 0, 255]);
    expect(mask.covered).toBe(0.5);
  });
});
