export interface CollageImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  zIndex: number;
  name: string;
}

export interface CanvasState {
  images: CollageImage[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export type Tool = 'select' | 'pan';
