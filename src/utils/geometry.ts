import { CollageImage } from '../types';

/** Convert stage-space point to image-local coordinates. */
export function stageToImageLocal(
  stageX: number,
  stageY: number,
  image: CollageImage
): { x: number; y: number } {
  const dx = stageX - image.x;
  const dy = stageY - image.y;

  const rad = (-image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  return {
    x: rx / image.scaleX + image.width / 2,
    y: ry / image.scaleY + image.height / 2,
  };
}

/** Convert image-local coords back to stage coords for preview. */
export function localToStage(
  lx: number,
  ly: number,
  image: CollageImage
): { x: number; y: number } {
  const ox = lx - image.width / 2;
  const oy = ly - image.height / 2;
  const sx = ox * image.scaleX;
  const sy = oy * image.scaleY;
  const rad = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: image.x + sx * cos - sy * sin,
    y: image.y + sx * sin + sy * cos,
  };
}
