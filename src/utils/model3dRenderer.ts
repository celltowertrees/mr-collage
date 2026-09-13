import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  WebGLRenderer,
} from 'three';
import { DirectionalLightData, Model3DMaterial, PrimitiveShape, Rotation3D } from '../types';

// ── 3D object rasterizer ──
// Konva draws through Canvas 2D, so a WebGL render can't be handed to it
// directly — it has to be rasterized first. The seam already exists in this
// codebase: CollageImageNode and CollageTextNode both build an offscreen
// canvas and pass it to <KonvaImage image={canvas}>. This module produces
// that canvas for a 3D object.
//
// ONE shared renderer, copied per node. Browsers cap how many live WebGL
// contexts a page may hold (commonly 8-16), so a renderer per object would
// break a collage with more than a handful of them. Instead a single
// module-level renderer draws each object on demand and the result is
// immediately drawImage()'d into a throwaway 2D canvas — that copy is what
// Konva keeps, so the shared framebuffer is free to be overwritten by the
// next object. It's also what makes the JPEG export (which rasterizes the
// whole Konva layer) and the static HTML export's baked snapshot work with no
// extra machinery.

const DEG2RAD = Math.PI / 180;

// Supersample so an object still looks sharp when scaled up past its natural
// box, without letting a huge object blow up the framebuffer.
const RENDER_SCALE = 2;
const MAX_RENDER_DIM = 2048;

export interface Model3DSpec {
  shape: PrimitiveShape;
  rotation3D: Rotation3D;
  light: DirectionalLightData;
  material: Model3DMaterial;
}

/**
 * Unit vector pointing from the object toward the light.
 *
 * Azimuth is the compass bearing the light comes FROM, swinging around the
 * vertical axis: 0 degrees is the viewer's side (+Z), 90 the right (+X), 180
 * behind the object (-Z), 270 the left (-X). Elevation lifts it off the
 * horizon toward straight overhead (+Y). Kept separate from the renderer
 * below because it's the one piece of this module that's testable without a
 * WebGL context.
 */
export function lightDirection(azimuth: number, elevation: number): { x: number; y: number; z: number } {
  const a = azimuth * DEG2RAD;
  const e = elevation * DEG2RAD;
  const horizontal = Math.cos(e);
  return {
    x: horizontal * Math.sin(a),
    y: Math.sin(e),
    z: horizontal * Math.cos(a),
  };
}

function buildGeometry(shape: PrimitiveShape): BufferGeometry {
  switch (shape) {
    case 'cube':
      return new BoxGeometry(1, 1, 1);
    case 'sphere':
      return new SphereGeometry(0.62, 64, 48);
    case 'cylinder':
      return new CylinderGeometry(0.5, 0.5, 1.1, 64);
    case 'cone':
      return new ConeGeometry(0.6, 1.15, 64);
    case 'torus':
      return new TorusGeometry(0.45, 0.19, 32, 96);
    case 'torusKnot':
      return new TorusKnotGeometry(0.4, 0.13, 160, 32);
    case 'icosahedron':
      return new IcosahedronGeometry(0.65, 0);
  }
}

interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  key: DirectionalLight;
  fill: AmbientLight;
  geometries: Map<PrimitiveShape, BufferGeometry>;
  width: number;
  height: number;
}

// `undefined` = not tried yet, `null` = tried and WebGL isn't available here
// (jsdom under Vitest, a browser with WebGL disabled). Cached either way so a
// missing context isn't re-probed on every render.
let context: RenderContext | null | undefined;

function getContext(): RenderContext | null {
  if (context !== undefined) return context;
  try {
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      // Needed so the framebuffer can still be read back (drawImage into the
      // per-node canvas, toDataURL for the HTML export) after render returns.
      preserveDrawingBuffer: true,
    });
    renderer.setClearAlpha(0);

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const material = new MeshStandardMaterial();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
    scene.add(mesh);

    const key = new DirectionalLight(0xffffff, 1);
    scene.add(key);
    const fill = new AmbientLight(0xffffff, 0.5);
    scene.add(fill);

    context = { renderer, scene, camera, mesh, key, fill, geometries: new Map(), width: 0, height: 0 };
  } catch {
    context = null;
  }
  return context;
}

/**
 * Renders the object into a fresh 2D canvas sized `width` x `height` (in
 * object-local units), or returns null if WebGL isn't available. Callers must
 * handle null — CollageModel3DNode falls back to an outline placeholder and
 * the HTML export omits the object.
 */
export function renderModelToCanvas(
  spec: Model3DSpec,
  width: number,
  height: number
): HTMLCanvasElement | null {
  const ctx = getContext();
  if (!ctx || width <= 0 || height <= 0) return null;

  const ratio = Math.min(
    RENDER_SCALE,
    MAX_RENDER_DIM / Math.max(width, height)
  );
  const renderWidth = Math.max(1, Math.round(width * ratio));
  const renderHeight = Math.max(1, Math.round(height * ratio));

  const { renderer, scene, camera, mesh, key, fill, geometries } = ctx;

  let geometry = geometries.get(spec.shape);
  if (!geometry) {
    geometry = buildGeometry(spec.shape);
    geometries.set(spec.shape, geometry);
  }
  mesh.geometry = geometry;
  mesh.rotation.set(
    spec.rotation3D.x * DEG2RAD,
    spec.rotation3D.y * DEG2RAD,
    spec.rotation3D.z * DEG2RAD
  );

  // set() mutates the existing Color rather than allocating a new one per
  // frame, and `needsUpdate` is deliberately NOT touched: it forces three to
  // rebuild the shader program, and none of colour/metalness/roughness change
  // the program — they're plain uniforms.
  mesh.material.color.set(spec.material.color);
  mesh.material.metalness = spec.material.metalness;
  mesh.material.roughness = spec.material.roughness;

  const dir = lightDirection(spec.light.azimuth, spec.light.elevation);
  key.position.set(dir.x, dir.y, dir.z);
  key.color.set(spec.light.color);
  key.intensity = spec.light.intensity;
  fill.intensity = spec.light.ambient;

  // Resizing reallocates the drawing buffer, so only do it when the size
  // actually changed — an orbit drag re-renders at a constant size.
  if (renderWidth !== ctx.width || renderHeight !== ctx.height) {
    camera.aspect = renderWidth / renderHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(renderWidth, renderHeight, false);
    ctx.width = renderWidth;
    ctx.height = renderHeight;
  }
  renderer.render(scene, camera);

  // Copy out immediately, in the same tick as the render, so the next
  // object's render can safely reuse the shared framebuffer.
  const out = document.createElement('canvas');
  out.width = renderWidth;
  out.height = renderHeight;
  const out2d = out.getContext('2d');
  if (!out2d) return null;
  out2d.drawImage(renderer.domElement, 0, 0, renderWidth, renderHeight);
  return out;
}

/** The same render, as a PNG data URL — used to bake the static HTML export. */
export function renderModelToDataURL(
  spec: Model3DSpec,
  width: number,
  height: number
): string | null {
  const canvas = renderModelToCanvas(spec, width, height);
  return canvas ? canvas.toDataURL('image/png') : null;
}

/**
 * Creates the WebGL context and compiles the shader program ahead of time.
 *
 * That first-render cost is real — around 230ms in a profile — and without
 * this it lands inside the click that places the first 3D object, freezing the
 * UI at exactly the wrong moment. Calling this when the shape picker opens
 * moves it into the pause while the user is reading the menu. Safe to call
 * repeatedly; everything after the first call is a no-op.
 */
export function warmUpModelRenderer(): void {
  if (context !== undefined) return;
  renderModelToCanvas(
    {
      shape: 'cube',
      rotation3D: { x: 0, y: 0, z: 0 },
      light: { azimuth: 45, elevation: 40, intensity: 1, color: '#ffffff', ambient: 0.5 },
      material: { color: '#ffffff', metalness: 0, roughness: 1 },
    },
    1,
    1
  );
}
