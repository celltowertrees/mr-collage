import {
  CollageImage,
  CollageModel3D,
  CollageObject,
  CollageText,
  DEFAULT_LIGHT_3D,
  DEFAULT_MATERIAL_3D,
  DEFAULT_ROTATION_3D,
  PRIMITIVE_SHAPES,
  PrimitiveShape,
} from '../types';
import { DEFAULT_FONT_FAMILY } from '../utils/googleFonts';
import type { ICPViewport } from './exportICP';

// Thrown for anything that isn't a collage this app can rebuild, with a
// message fit to show the user as-is.
export class ICPImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ICPImportError';
  }
}

export interface ParsedICP {
  objects: CollageObject[];
  viewport?: ICPViewport;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function point(value: unknown): { x: number; y: number } | null {
  return isObject(value) && typeof value.x === 'number' && typeof value.y === 'number'
    ? { x: value.x, y: value.y }
    : null;
}

// Copies the optional effect fields across only when present, so a rebuilt
// object has exactly the keys the original did — the shape exportToICP's
// lossless contract is checked against.
function pick(data: Json, keys: string[]): Json {
  const out: Json = {};
  for (const key of keys) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

const SHARED_EFFECTS = ['gradientMask', 'shadow', 'blendMode', 'flipX', 'flipY'];

// The inverse of exportToICP. 0.2 files carry `baseSize` and `scale`
// separately; a 0.1 file only has the displayed `size`, which becomes the
// object's size at a scale of 1 — it looks identical, the split just isn't
// recoverable. Missing style fields fall back to what a freshly created
// object of that kind would have.
export function parseICP(text: string): ParsedICP {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ICPImportError("This file isn't valid JSON.");
  }

  const canvas = isObject(doc) ? doc['infinite-canvas'] : undefined;
  if (!isObject(canvas) || !Array.isArray(canvas.nodes)) {
    throw new ICPImportError("This file isn't an ICP collage export.");
  }

  const objects = canvas.nodes.map((node: unknown, index: number): CollageObject => {
    const label = `Object ${index + 1}`;
    if (!isObject(node)) throw new ICPImportError(`${label} is malformed.`);

    const position = point(node.position);
    const size = isObject(node.size) ? node.size : null;
    if (!position || !size || typeof size.width !== 'number' || typeof size.height !== 'number') {
      throw new ICPImportError(`${label} is missing its position or size.`);
    }
    const baseSize = isObject(node.baseSize) ? node.baseSize : null;
    const scale = point(node.scale);
    const data = isObject(node.data) ? node.data : {};

    const base = {
      id: typeof node.id === 'string' ? node.id : `imported-${index}`,
      x: position.x,
      y: position.y,
      width: num(baseSize?.width, size.width),
      height: num(baseSize?.height, size.height),
      rotation: num(node.rotation, 0),
      scaleX: scale ? scale.x : 1,
      scaleY: scale ? scale.y : 1,
      opacity: num(node.opacity, 1),
      zIndex: num(node.zIndex, index + 1),
      name: typeof data.name === 'string' ? data.name : '',
    };

    switch (node.type) {
      case 'image': {
        if (typeof data.src !== 'string' || !data.src.startsWith('data:image/')) {
          throw new ICPImportError(`${label} is an image with no image data.`);
        }
        const image: CollageImage = {
          kind: 'image',
          ...base,
          src: data.src,
          ...pick(data, ['mask', 'vignette', 'crop', 'generation', ...SHARED_EFFECTS]),
        };
        return image;
      }
      case 'text': {
        const textObj: CollageText = {
          kind: 'text',
          ...base,
          text: typeof data.text === 'string' ? data.text : '',
          fontFamily: typeof data.fontFamily === 'string' ? data.fontFamily : DEFAULT_FONT_FAMILY,
          fontSize: num(data.fontSize, 32),
          bold: data.bold === true,
          italic: data.italic === true,
          underline: data.underline === true,
          color: typeof data.color === 'string' ? data.color : '#000000',
          ...pick(data, SHARED_EFFECTS),
        };
        return textObj;
      }
      case 'model3d': {
        if (!PRIMITIVE_SHAPES.includes(data.shape as PrimitiveShape)) {
          throw new ICPImportError(`${label} is a 3D object of an unknown shape.`);
        }
        const model: CollageModel3D = {
          kind: 'model3d',
          ...base,
          shape: data.shape as PrimitiveShape,
          rotation3D: isObject(data.rotation3D)
            ? (data.rotation3D as unknown as CollageModel3D['rotation3D'])
            : { ...DEFAULT_ROTATION_3D },
          light: isObject(data.light)
            ? (data.light as unknown as CollageModel3D['light'])
            : { ...DEFAULT_LIGHT_3D },
          material: isObject(data.material)
            ? (data.material as unknown as CollageModel3D['material'])
            : { ...DEFAULT_MATERIAL_3D },
          ...pick(data, SHARED_EFFECTS),
        };
        return model;
      }
      default:
        throw new ICPImportError(`${label} has a type this app doesn't know (${String(node.type)}).`);
    }
  });

  const viewport = isObject(canvas.viewport) ? canvas.viewport : null;
  const viewportPosition = point(viewport?.position);
  return {
    objects,
    ...(viewportPosition && typeof viewport?.scale === 'number'
      ? { viewport: { stagePosition: viewportPosition, stageScale: viewport.scale } }
      : {}),
  };
}
