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

// Fields shared by every object kind, including every visual effect that
// isn't tied to having a raster image source (mask/gradient-fade/vignette/
// shadow/blend-mode/flip all just clip or composite whatever the node
// renders, image or text alike) — only `crop` is image-specific, since it
// crops a source image's own pixel region, a concept text has no equivalent
// of.
export interface BaseObject {
  id: string;
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
  flipX?: boolean;
  flipY?: boolean;
}

export interface CollageImage extends BaseObject {
  kind: 'image';
  src: string;
  crop?: CropRect;
}

export interface CollageText extends BaseObject {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

export type CollageObject = CollageImage | CollageText;

// Partial-of-the-intersection (rather than Partial<CollageObject>, which
// distributes over the union and would reject a change bag mixing fields
// from both kinds) so callers can pass whichever subset of fields applies to
// the object being updated without fighting the discriminant. `kind` is
// omitted from both sides before intersecting: CollageImage['kind'] &
// CollageText['kind'] is `'image' & 'text'`, i.e. `never` — which collapses
// the *entire* mapped type to `never`, not just that one field.
export type ObjectChanges = Partial<Omit<CollageImage, 'kind'> & Omit<CollageText, 'kind'>>;

export function isTextObject(obj: CollageObject): obj is CollageText {
  return obj.kind === 'text';
}

export interface CanvasState {
  images: CollageObject[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export type Tool =
  | 'select'
  | 'pan'
  | 'text'
  | 'mask-circle'
  | 'mask-rect'
  | 'mask-polygon'
  | 'mask-gradient'
  | 'crop';
