import { BaseObject } from '../types';

// CollageImageNode/CollageTextNode render the flip by negating the Group's
// scaleX/scaleY (see `transform.scaleX: image.scaleX * flipX` there) rather
// than storing the sign in image.scaleX/scaleY themselves, so any conversion
// between screen space and the object's local (unflipped-magnitude) space has
// to re-apply that same sign or it'll place things mirrored to the wrong
// side. Typed against BaseObject (not CollageImage) so mask/gradient drawing
// works identically for text objects.
function effectiveScale(image: BaseObject): { scaleX: number; scaleY: number } {
  return {
    scaleX: image.scaleX * (image.flipX ? -1 : 1),
    scaleY: image.scaleY * (image.flipY ? -1 : 1),
  };
}

/** Convert stage-space point to image-local coordinates. */
export function stageToImageLocal(
  stageX: number,
  stageY: number,
  image: BaseObject
): { x: number; y: number } {
  const dx = stageX - image.x;
  const dy = stageY - image.y;

  const rad = (-image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  const { scaleX, scaleY } = effectiveScale(image);
  return {
    x: rx / scaleX + image.width / 2,
    y: ry / scaleY + image.height / 2,
  };
}

/** Convert image-local coords back to stage coords for preview. */
export function localToStage(
  lx: number,
  ly: number,
  image: BaseObject
): { x: number; y: number } {
  const ox = lx - image.width / 2;
  const oy = ly - image.height / 2;
  const { scaleX, scaleY } = effectiveScale(image);
  const sx = ox * scaleX;
  const sy = oy * scaleY;
  const rad = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: image.x + sx * cos - sy * sin,
    y: image.y + sx * sin + sy * cos,
  };
}
