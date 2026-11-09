// Pure pan/zoom maths shared by the wheel, the zoom shortcuts and
// zoom-to-fit. A view is the stage's position and uniform scale: a content
// point p appears on screen at p * scale + (x, y).

export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 10;

const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

// Zoom by `factor`, keeping whatever content is under `anchor` (a screen
// point) under it afterwards.
export function zoomAbout(view: View, anchor: { x: number; y: number }, factor: number): View {
  const scale = clampScale(view.scale * factor);
  const contentX = (anchor.x - view.x) / view.scale;
  const contentY = (anchor.y - view.y) / view.scale;
  return { scale, x: anchor.x - contentX * scale, y: anchor.y - contentY * scale };
}

// The view that shows all of `bounds` (content coordinates), centred, with
// `padding` screen px to spare on the tighter axis.
export function fitBounds(
  bounds: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  padding: number
): View {
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const scale = clampScale(
    Math.min(availW / Math.max(bounds.width, 1e-6), availH / Math.max(bounds.height, 1e-6))
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { scale, x: size.width / 2 - cx * scale, y: size.height / 2 - cy * scale };
}
