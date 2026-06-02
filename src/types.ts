export interface CircleMask {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
}

export interface RectMask {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonMask {
  type: 'polygon';
  points: { x: number; y: number }[];
}

export type MaskData = CircleMask | RectMask | PolygonMask;

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
  mask?: MaskData;
}

export interface CanvasState {
  images: CollageImage[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export type Tool = 'select' | 'pan' | 'mask-circle' | 'mask-rect' | 'mask-polygon';
