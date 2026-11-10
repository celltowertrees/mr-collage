// Geometry and masking for content-aware backgrounds.
//
// The image model only returns a few fixed shapes, and what it paints has to
// land pixel-for-pixel under the objects it was painted around. So the drawn
// rectangle is grown to the nearest of those shapes for the capture that is
// sent, and the picture that comes back is trimmed to the rectangle again —
// never stretched, which would slide the scene out from under the objects.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackgroundFrame {
  // The `size` to ask the image API for, and its two numbers.
  size: string;
  outWidth: number;
  outHeight: number;
  // Canvas region (content coordinates) to capture: the drawn rectangle,
  // grown evenly on two sides until it has the output's shape.
  capture: Rect;
  // Where the drawn rectangle falls inside the output picture, in its pixels.
  crop: Rect;
}

function pickSize(aspectRatio: number): { outWidth: number; outHeight: number } {
  if (aspectRatio > 1.2) return { outWidth: 1536, outHeight: 1024 };
  if (aspectRatio < 0.8) return { outWidth: 1024, outHeight: 1536 };
  return { outWidth: 1024, outHeight: 1024 };
}

export function fitBackgroundFrame(rect: Rect): BackgroundFrame {
  const { outWidth, outHeight } = pickSize(rect.width / rect.height);
  const outAspect = outWidth / outHeight;

  let capture: Rect;
  if (rect.width / rect.height > outAspect) {
    const height = rect.width / outAspect;
    capture = { x: rect.x, y: rect.y - (height - rect.height) / 2, width: rect.width, height };
  } else {
    const width = rect.height * outAspect;
    capture = { x: rect.x - (width - rect.width) / 2, y: rect.y, width, height: rect.height };
  }

  const pxPerUnit = outWidth / capture.width;
  return {
    size: `${outWidth}x${outHeight}`,
    outWidth,
    outHeight,
    capture,
    crop: {
      x: Math.round((rect.x - capture.x) * pxPerUnit),
      y: Math.round((rect.y - capture.y) * pxPerUnit),
      width: Math.round(rect.width * pxPerUnit),
      height: Math.round(rect.height * pxPerUnit),
    },
  };
}

// Below this alpha a pixel is antialiasing or the faint tail of a shadow or
// fade, and is better painted over than preserved as a grey fringe.
const SUBJECT_ALPHA = 32;

// Turns a capture of the objects on a transparent canvas (RGBA bytes) into
// the mask the image-edit API expects: opaque where an object is and must be
// kept, transparent where the background is to be painted. `covered` is the
// fraction of the frame the objects take up.
export function subjectMask(rgba: Uint8ClampedArray): { data: Uint8ClampedArray; covered: number } {
  const data = new Uint8ClampedArray(rgba.length);
  let kept = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] >= SUBJECT_ALPHA) {
      data[i] = 255;
      kept += 1;
    }
  }
  return { data, covered: rgba.length === 0 ? 0 : kept / (rgba.length / 4) };
}
