import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { exportToICP, exportToStaticHTML, ExportViewport, loadState, saveState } from '../store';
import { idbAllKeys } from '../store/db';
import { lightDirection } from '../utils/model3dRenderer';
import { CanvasState, CollageModel3D } from '../types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  localStorage.clear();
});

function makeModel(overrides: Partial<CollageModel3D> = {}): CollageModel3D {
  return {
    kind: 'model3d',
    id: 'model-1',
    shape: 'cube',
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'Cube',
    rotation3D: { x: -20, y: 30, z: 0 },
    light: { azimuth: 45, elevation: 40, intensity: 2.2, color: '#ffffff', ambient: 0.6 },
    material: { color: '#c8c8c8', metalness: 0.1, roughness: 0.5 },
    ...overrides,
  };
}

function parseFrame(html: string, id: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById(id);
  if (!el) throw new Error(`no element with id ${id} in exported HTML`);
  return el;
}

const VIEWPORT: ExportViewport = { x: 0, y: 0, scale: 1, width: 800, height: 600 };
const SNAPSHOT = 'data:image/png;base64,AAA';

// Maps to CLAUDE.md → "3D Objects on the Canvas"
describe('lightDirection', () => {
  // Azimuth is the compass bearing the light comes FROM, swinging around the
  // vertical axis: 0° is the viewer's side (+Z), 90° the right (+X), 180°
  // behind the object (-Z), 270° the left (-X). Elevation lifts it off the
  // horizon toward straight overhead (+Y).
  it('maps cardinal azimuths at the horizon onto the world axes', () => {
    expect(lightDirection(0, 0)).toMatchObject({ x: expect.closeTo(0, 5), y: expect.closeTo(0, 5), z: expect.closeTo(1, 5) });
    expect(lightDirection(90, 0)).toMatchObject({ x: expect.closeTo(1, 5), y: expect.closeTo(0, 5), z: expect.closeTo(0, 5) });
    expect(lightDirection(180, 0)).toMatchObject({ x: expect.closeTo(0, 5), y: expect.closeTo(0, 5), z: expect.closeTo(-1, 5) });
    expect(lightDirection(270, 0)).toMatchObject({ x: expect.closeTo(-1, 5), y: expect.closeTo(0, 5), z: expect.closeTo(0, 5) });
  });

  it('points straight up or straight down at the elevation extremes, whatever the azimuth', () => {
    for (const azimuth of [0, 90, 217, 359]) {
      expect(lightDirection(azimuth, 90).y).toBeCloseTo(1, 5);
      expect(lightDirection(azimuth, -90).y).toBeCloseTo(-1, 5);
    }
  });

  it('always returns a unit vector', () => {
    for (const [azimuth, elevation] of [[0, 0], [45, 40], [123, -17], [300, 75]]) {
      const { x, y, z } = lightDirection(azimuth, elevation);
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    }
  });
});

// Maps to CLAUDE.md → "3D Objects on the Canvas"
describe('exportToICP 3D object data', () => {
  it('describes the shape, 3-axis rotation, lighting, and material', () => {
    const model = makeModel({ scaleX: 2, scaleY: 0.5 });
    const result = exportToICP([model]) as unknown as {
      'infinite-canvas': { nodes: { type: string; size: unknown; data: Record<string, unknown> }[] };
    };
    const node = result['infinite-canvas'].nodes[0];

    expect(node.type).toBe('model3d');
    expect(node.size).toEqual({ width: 600, height: 75 });
    expect(node.data.shape).toBe('cube');
    expect(node.data.rotation3D).toEqual({ x: -20, y: 30, z: 0 });
    expect(node.data.light).toEqual(model.light);
    expect(node.data.material).toEqual(model.material);
  });

  it('includes shared effects only when set', () => {
    const plain = makeModel({ id: 'plain' });
    const styled = makeModel({
      id: 'styled',
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 5, offsetY: 5, opacity: 0.5 },
      blendMode: 'multiply',
      flipX: true,
    });

    const result = exportToICP([plain, styled]) as unknown as {
      'infinite-canvas': { nodes: { data: Record<string, unknown> }[] };
    };
    const [plainNode, styledNode] = result['infinite-canvas'].nodes;

    expect(plainNode.data.shadow).toBeUndefined();
    expect(plainNode.data.blendMode).toBeUndefined();
    expect(plainNode.data.flipX).toBeUndefined();
    expect(styledNode.data.blendMode).toBe('multiply');
    expect(styledNode.data.flipX).toBe(true);
    expect(styledNode.data.shadow).toEqual(styled.shadow);
  });
});

// Maps to CLAUDE.md → "3D Objects on the Canvas". A 3D object is baked to a
// PNG at export time and then flows through the exact same CSS path an image
// does, so these assertions pin the same properties the image parity contract
// in exportHTML.ts covers.
describe('exportToStaticHTML 3D objects', () => {
  it('embeds the baked snapshot positioned like an image of the same box', async () => {
    const html = await exportToStaticHTML([makeModel()], VIEWPORT, {}, { 'model-1': SNAPSHOT });
    const frame = parseFrame(html, 'model-1');

    expect(frame.style.left).toBe('-50px');
    expect(frame.style.top).toBe('125px');
    expect(frame.style.width).toBe('300px');
    expect(frame.style.height).toBe('150px');
    expect(frame.style.opacity).toBe('1');
    expect(frame.style.zIndex).toBe('1');
    expect(frame.style.clipPath).toBe('');

    const img = frame.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SNAPSHOT);
  });

  it('reproduces opacity, stacking order, shadow, and blend mode', async () => {
    const model = makeModel({
      opacity: 0.4,
      zIndex: 7,
      blendMode: 'multiply',
      shadow: { enabled: true, color: '#000000', blur: 30, offsetX: 12, offsetY: 12, opacity: 1 },
    });
    const html = await exportToStaticHTML([model], VIEWPORT, {}, { 'model-1': SNAPSHOT });
    const frame = parseFrame(html, 'model-1');

    expect(frame.style.opacity).toBe('0.4');
    expect(frame.style.zIndex).toBe('7');
    expect(frame.style.mixBlendMode).toBe('multiply');
    expect(frame.style.filter).toBe('drop-shadow(12px 12px 30px rgba(0, 0, 0, 1))');
  });

  it('omits a 3D object whose snapshot could not be rendered', async () => {
    const html = await exportToStaticHTML([makeModel()], VIEWPORT, {}, {});
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.getElementById('model-1')).toBeNull();
  });
});

// Maps to CLAUDE.md → "3D Objects on the Canvas"
describe('3D object persistence', () => {
  it('round-trips shape, orientation, lighting, and material without touching IndexedDB', async () => {
    const model = makeModel({ rotation3D: { x: 12, y: -48, z: 90 } });
    const state: CanvasState = { images: [model], stagePosition: { x: 5, y: 6 }, stageScale: 1.5 };

    await saveState(state);
    expect(await idbAllKeys()).toEqual([]);

    const loaded = await loadState();
    expect(loaded?.images).toHaveLength(1);
    expect(loaded?.images[0]).toEqual(model);
  });
});
