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

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export interface ShadowData {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

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
  shadow?: ShadowData;
  blendMode?: Exclude<BlendMode, 'normal'>;
  crop?: CropRect;
  flipX?: boolean;
  flipY?: boolean;
}

export interface CanvasState {
  images: CollageImage[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export type Tool = 'select' | 'pan' | 'mask-circle' | 'mask-rect' | 'mask-polygon' | 'crop';
