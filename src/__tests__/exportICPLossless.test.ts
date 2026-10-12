import { describe, expect, it } from 'vitest';
import { exportToICP } from '../store';
import {
  CollageImage,
  CollageModel3D,
  CollageObject,
  CollageText,
  DEFAULT_LIGHT_3D,
} from '../types';

// Maps to CLAUDE.md → "Lossless ICP JSON Export". Rebuilding each object from
// nothing but its exported node and comparing it to the original pins the
// export as lossless: any field the export drops or pre-combines shows up as
// a toEqual diff.

interface ICPNode {
  id: string;
  type: 'image' | 'text' | 'model3d';
  position: { x: number; y: number };
  size: { width: number; height: number };
  baseSize: { width: number; height: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
  zIndex: number;
  data: Record<string, unknown>;
}

interface ICPExport {
  'infinite-canvas': {
    version: string;
    viewport?: { position: { x: number; y: number }; scale: number };
    nodes: ICPNode[];
  };
}

function rebuild(node: ICPNode): CollageObject {
  const { flipX, flipY, ...data } = node.data;
  return {
    kind: node.type,
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.baseSize.width,
    height: node.baseSize.height,
    scaleX: node.scale.x,
    scaleY: node.scale.y,
    rotation: node.rotation,
    opacity: node.opacity,
    zIndex: node.zIndex,
    ...(flipX ? { flipX } : {}),
    ...(flipY ? { flipY } : {}),
    ...data,
  } as CollageObject;
}

const base = {
  x: 100,
  y: 200,
  width: 300,
  height: 150,
  rotation: 12.5,
  scaleX: 0.1,
  scaleY: 3.3,
  opacity: 0.7,
  zIndex: 4,
  gradientMask: { start: { x: 0, y: 0 }, end: { x: 300, y: 150 } },
  blendMode: 'multiply' as const,
  flipX: true,
  flipY: true,
};

// Toggled off, but with non-default settings the user would expect to get
// back when toggling it on again after a re-import.
const disabledShadow = { enabled: false, color: '#ff0000', blur: 22, offsetX: -4, offsetY: 9, opacity: 0.35 };

const image: CollageImage = {
  ...base,
  kind: 'image',
  id: 'img',
  name: 'photo.png',
  src: 'data:image/png;base64,AAA',
  mask: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] },
  vignette: { enabled: false, innerRadius: 0.3, outerRadius: 1.2 },
  crop: { x: 10, y: 20, width: 100, height: 50 },
  shadow: disabledShadow,
};

const text: CollageText = {
  ...base,
  kind: 'text',
  id: 'txt',
  name: 'Text',
  text: 'Hello\nworld',
  fontFamily: 'Lobster',
  fontSize: 48,
  bold: true,
  italic: true,
  underline: true,
  color: '#123456',
  shadow: { ...disabledShadow, enabled: true },
};

const model: CollageModel3D = {
  ...base,
  kind: 'model3d',
  id: 'm3d',
  name: 'Torus',
  shape: 'torus',
  rotation3D: { x: 10, y: -20, z: 30 },
  light: DEFAULT_LIGHT_3D,
  material: {
    color: '#abcdef',
    metalness: 0.9,
    roughness: 0.1,
    texture: { source: 'image', src: 'data:image/png;base64,TEX', repeat: 3 },
  },
  shadow: disabledShadow,
};

describe('exportToICP is lossless', () => {
  const result = exportToICP([image, text, model], {
    stagePosition: { x: -250, y: 75 },
    stageScale: 1.75,
  }) as unknown as ICPExport;
  const nodes = result['infinite-canvas'].nodes;

  it('exports scale separately from the unscaled size, alongside the displayed size', () => {
    const node = nodes[0];
    expect(node.scale).toEqual({ x: 0.1, y: 3.3 });
    expect(node.baseSize).toEqual({ width: 300, height: 150 });
    expect(node.size).toEqual({ width: 300 * 0.1, height: 150 * 3.3 });
  });

  it('keeps shadow and vignette settings even while they are switched off', () => {
    expect(nodes[0].data.shadow).toEqual(disabledShadow);
    expect(nodes[0].data.vignette).toEqual(image.vignette);
  });

  it.each([
    ['image', image],
    ['text', text],
    ['3D object', model],
  ] as const)('rebuilds an identical %s from its exported node', (_label, original) => {
    const node = nodes.find((n) => n.id === original.id)!;
    expect(rebuild(node)).toEqual(original);
  });

  it('includes the viewport pan and zoom', () => {
    expect(result['infinite-canvas'].viewport).toEqual({ position: { x: -250, y: 75 }, scale: 1.75 });
  });

  it('survives a JSON round-trip unchanged', () => {
    const reparsed = JSON.parse(JSON.stringify(result)) as ICPExport;
    expect(reparsed['infinite-canvas'].nodes.map(rebuild)).toEqual([image, text, model]);
  });
});
