import { describe, expect, it } from 'vitest';
import { localToStage, stageToImageLocal } from '../utils/geometry';
import { CollageImage } from '../types';

function makeImage(overrides: Partial<CollageImage> = {}): CollageImage {
  return {
    id: 'img-1',
    src: 'data:image/png;base64,AAA',
    x: 500,
    y: 300,
    width: 200,
    height: 100,
    rotation: 0,
    scaleX: 2,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'test.png',
    ...overrides,
  };
}

// Maps to CLAUDE.md → "Mirror an Image (Flip Horizontal / Vertical)" and
// "Gradient Fade Mask on an Image" — a mask/gradient drawn on a flipped
// image has to land where the user actually dragged on the *visible*
// (mirrored) content, not where it'd land on the unflipped source pixels.
describe('geometry conversions on a flipped image', () => {
  // CollageImageNode renders the flip by negating the Group's scaleX/scaleY
  // (not by storing the sign in image.scaleX/scaleY), so this is the same
  // math Konva would actually apply on screen: offset from center, signed
  // scale, rotate, then translate to the image's position.
  function expectedStagePoint(lx: number, ly: number, image: CollageImage) {
    const flipX = image.flipX ? -1 : 1;
    const flipY = image.flipY ? -1 : 1;
    const ox = lx - image.width / 2;
    const oy = ly - image.height / 2;
    const sx = ox * image.scaleX * flipX;
    const sy = oy * image.scaleY * flipY;
    const rad = (image.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: image.x + sx * cos - sy * sin,
      y: image.y + sx * sin + sy * cos,
    };
  }

  it('localToStage places a local point where a flipped image actually renders it', () => {
    const image = makeImage({ flipX: true });
    // A point 3/4 of the way across the image's local width (right of center).
    const local = { x: 150, y: 50 };
    const expected = expectedStagePoint(local.x, local.y, image);

    const stage = localToStage(local.x, local.y, image);

    expect(stage.x).toBeCloseTo(expected.x);
    expect(stage.y).toBeCloseTo(expected.y);
    // Sanity check against the user-visible symptom: on an unflipped image
    // this point renders right of center (x=600); flipped, it must render
    // left of center instead, not still at 600.
    expect(stage.x).toBeCloseTo(400);
    expect(stage.x).not.toBeCloseTo(600);
  });

  it('stageToImageLocal maps a click back to the local point that renders there when flipped', () => {
    const image = makeImage({ flipX: true });
    const local = { x: 150, y: 50 };
    const stagePoint = expectedStagePoint(local.x, local.y, image);

    const result = stageToImageLocal(stagePoint.x, stagePoint.y, image);

    expect(result.x).toBeCloseTo(local.x);
    expect(result.y).toBeCloseTo(local.y);
  });

  it('round-trips through both flip axes together, with rotation', () => {
    const image = makeImage({ flipX: true, flipY: true, rotation: 37, scaleX: 1.4, scaleY: 0.8 });
    const local = { x: 40, y: 70 };

    const stage = localToStage(local.x, local.y, image);
    const roundTripped = stageToImageLocal(stage.x, stage.y, image);

    expect(roundTripped.x).toBeCloseTo(local.x);
    expect(roundTripped.y).toBeCloseTo(local.y);
  });
});
