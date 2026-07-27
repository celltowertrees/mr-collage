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

export interface GradientMask {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// innerRadius/outerRadius are fractions of an ellipse fit to the image's own
// aspect ratio, where 1.0 reaches the midpoint of each edge (and a corner
// sits at ~1.41) — so the same default values give a sensible vignette
// regardless of the image's width/height.
export interface VignetteData {
  enabled: boolean;
  innerRadius: number;
  outerRadius: number;
}

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
  gradientMask?: GradientMask;
  vignette?: VignetteData;
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

export type Tool =
  | 'select'
  | 'pan'
  | 'mask-circle'
  | 'mask-rect'
  | 'mask-polygon'
  | 'mask-gradient'
  | 'crop';
