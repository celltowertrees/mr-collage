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

export const PRIMITIVE_SHAPES = [
  'cube',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'torusKnot',
  'icosahedron',
] as const;

export type PrimitiveShape = (typeof PRIMITIVE_SHAPES)[number];

// Display names for the shape picker, and the default `name` a new 3D object
// gets.
export const SHAPE_LABELS: Record<PrimitiveShape, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  torus: 'Torus',
  torusKnot: 'Torus Knot',
  icosahedron: 'Icosahedron',
};

// Degrees, applied in XYZ order to the model itself — distinct from the
// BaseObject `rotation` every object has. The 2D rotation spins the
// already-lit sprite in the canvas plane (its highlights turn with it), while
// rotation3D.z rolls the model underneath a world-fixed light (its highlights
// stay put). Both are useful, so both are kept.
export interface Rotation3D {
  x: number;
  y: number;
  z: number;
}

// One directional key light, steered in spherical terms rather than as a
// vector so the toolbar can expose it as two angle sliders. `ambient` is a
// flat fill that keeps unlit faces from going pure black.
export interface DirectionalLightData {
  azimuth: number;   // 0-360 degrees, the compass bearing the light comes from
  elevation: number; // -90 to 90 degrees above the horizon
  intensity: number;
  color: string;
  ambient: number;
}

export interface Model3DMaterial {
  color: string;
  metalness: number;
  roughness: number;
}

// Shared by object creation (useCollage) and the toolbar's reset controls so
// "what a new 3D object looks like" is stated once. A front-right key light
// above the horizon with a soft fill is the classic product-shot setup, and
// reads as 3D immediately on any of the primitives.
export const DEFAULT_LIGHT_3D: DirectionalLightData = {
  azimuth: 45,
  elevation: 40,
  intensity: 2.4,
  color: '#ffffff',
  ambient: 0.6,
};

export const DEFAULT_MATERIAL_3D: Model3DMaterial = {
  color: '#c9ccd4',
  metalness: 0.15,
  roughness: 0.45,
};

// Off-axis so a cube reads as a cube on arrival rather than as a flat square.
export const DEFAULT_ROTATION_3D: Rotation3D = { x: -20, y: 30, z: 0 };

// Fields shared by every object kind. gradientMask/shadow/blendMode/flip all
// just fade or composite whatever the node renders, image or text alike, so
// they live here — mask (shape clipping) and vignette stay image-only below,
// alongside crop, since there's no real-world case for clipping or
// vignetting a text object the way there is for a photo.
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
  gradientMask?: GradientMask;
  shadow?: ShadowData;
  blendMode?: Exclude<BlendMode, 'normal'>;
  flipX?: boolean;
  flipY?: boolean;
}

export interface CollageImage extends BaseObject {
  kind: 'image';
  src: string;
  mask?: MaskData;
  vignette?: VignetteData;
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

// A 3D object is pure metadata: the shape is procedural, so unlike an image
// there is no blob to store and nothing to load asynchronously. It carries the
// shared BaseObject effects (gradient fade, shadow, blend mode, flip) but not
// mask/vignette/crop, which stay image-only for the same reason they do for
// text.
export interface CollageModel3D extends BaseObject {
  kind: 'model3d';
  shape: PrimitiveShape;
  rotation3D: Rotation3D;
  light: DirectionalLightData;
  material: Model3DMaterial;
}

export type CollageObject = CollageImage | CollageText | CollageModel3D;

// Partial-of-the-intersection (rather than Partial<CollageObject>, which
// distributes over the union and would reject a change bag mixing fields
// from both kinds) so callers can pass whichever subset of fields applies to
// the object being updated without fighting the discriminant. `kind` is
// omitted from both sides before intersecting: CollageImage['kind'] &
// CollageText['kind'] is `'image' & 'text'`, i.e. `never` — which collapses
// the *entire* mapped type to `never`, not just that one field.
export type ObjectChanges = Partial<
  Omit<CollageImage, 'kind'> & Omit<CollageText, 'kind'> & Omit<CollageModel3D, 'kind'>
>;

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
  | 'crop'
  | 'bg-rect'
  | 'rotate3d';
