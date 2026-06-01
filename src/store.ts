import { CanvasState, CollageImage } from './types';

const STORAGE_KEY = 'mr-collage-state';

export function saveState(state: CanvasState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadState(): CanvasState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CanvasState;
  } catch {
    return null;
  }
}

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
        },
      })),
    },
  };
}
