import { describe, expect, it } from 'vitest';
import { exportToICP, ICPImportError, parseICP } from '../store';
import { CollageImage, CollageModel3D, CollageText, DEFAULT_LIGHT_3D } from '../types';

// Maps to CLAUDE.md → "Import a Collage from ICP JSON"

const image: CollageImage = {
  kind: 'image',
  id: 'img',
  name: 'photo.png',
  src: 'data:image/png;base64,AAA',
  x: 100,
  y: 200,
  width: 300,
  height: 150,
  rotation: 12.5,
  scaleX: 0.1,
  scaleY: 3.3,
  opacity: 0.7,
  zIndex: 4,
  mask: { type: 'circle', cx: 10, cy: 10, radius: 5 },
  vignette: { enabled: false, innerRadius: 0.3, outerRadius: 1.2 },
  crop: { x: 10, y: 20, width: 100, height: 50 },
  shadow: { enabled: false, color: '#ff0000', blur: 22, offsetX: -4, offsetY: 9, opacity: 0.35 },
  gradientMask: { start: { x: 0, y: 0 }, end: { x: 300, y: 150 } },
  blendMode: 'multiply',
  flipX: true,
};

const text: CollageText = {
  kind: 'text',
  id: 'txt',
  name: 'Text',
  text: 'Hello',
  x: 5,
  y: 6,
  width: 200,
  height: 40,
  rotation: 0,
  scaleX: 2,
  scaleY: 2,
  opacity: 1,
  zIndex: 1,
  fontFamily: 'Lobster',
  fontSize: 48,
  bold: true,
  italic: false,
  underline: true,
  color: '#123456',
  flipY: true,
};

const model: CollageModel3D = {
  kind: 'model3d',
  id: 'm3d',
  name: 'Torus',
  shape: 'torus',
  x: 0,
  y: 0,
  width: 360,
  height: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  zIndex: 2,
  rotation3D: { x: 10, y: -20, z: 30 },
  light: DEFAULT_LIGHT_3D,
  material: {
    color: '#abcdef',
    metalness: 0.9,
    roughness: 0.1,
    texture: { source: 'image', src: 'data:image/png;base64,TEX', repeat: 3 },
  },
};

describe('parseICP', () => {
  it('reads back exactly what exportToICP wrote, viewport included', () => {
    const file = JSON.stringify(
      exportToICP([image, text, model], { stagePosition: { x: -250, y: 75 }, stageScale: 1.75 })
    );
    const parsed = parseICP(file);

    expect(parsed.objects).toEqual([image, text, model]);
    expect(parsed.viewport).toEqual({ stagePosition: { x: -250, y: 75 }, stageScale: 1.75 });
  });

  it('reads an older 0.1 file, taking its displayed size at a scale of 1', () => {
    const file = JSON.stringify({
      'infinite-canvas': {
        version: '0.1',
        nodes: [
          {
            id: 'old',
            type: 'image',
            position: { x: 1, y: 2 },
            size: { width: 30, height: 40 },
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            data: { src: 'data:image/png;base64,OLD', name: 'old.png' },
          },
        ],
      },
    });
    const [obj] = parseICP(file).objects;

    expect(obj).toMatchObject({ kind: 'image', width: 30, height: 40, scaleX: 1, scaleY: 1 });
    expect(parseICP(file).viewport).toBeUndefined();
  });

  it.each([
    ['not JSON at all', 'this is not json'],
    ['JSON without an infinite-canvas document', '{"hello": "world"}'],
    ['a node with an unknown type', JSON.stringify({ 'infinite-canvas': { version: '0.2', nodes: [{ type: 'video' }] } })],
    [
      'an image node with no image data',
      JSON.stringify({
        'infinite-canvas': {
          version: '0.2',
          nodes: [{ id: 'x', type: 'image', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, data: {} }],
        },
      }),
    ],
  ])('rejects %s with a readable error', (_label, file) => {
    expect(() => parseICP(file)).toThrow(ICPImportError);
  });
});
