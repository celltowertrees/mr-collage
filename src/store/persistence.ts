import { CanvasState, CollageImage, CollageModel3D, CollageObject, CollageText } from '../types';
import { idbGet, idbSyncBlobs } from './db';

const STORAGE_KEY = 'mr-collage-state';

// Images are the only kind with a blob: their `src` is stripped out to
// IndexedDB and the rest stays here. Text and 3D objects are pure metadata and
// pass through untouched. Every check below is written as a POSITIVE
// `kind === 'image'` test rather than `kind !== 'text'` — the negative form
// would quietly absorb each new object kind and try to write a `src` that
// isn't there. Metadata read back from localStorage is untyped JSON — entries
// saved before the union existed have no `kind` field at all, so loadState
// normalizes those to `kind: 'image'` rather than relying on the type here to
// enforce it.
// A 3D object's uploaded texture is the one other thing big enough to need the
// blob store; its metadata keeps the texture's settings but not the pixels.
type StoredModel3D = Omit<CollageModel3D, 'material'> & {
  material: Omit<CollageModel3D['material'], 'texture'> & {
    texture?: { source: 'preset'; preset: string; repeat: number } | { source: 'image'; repeat: number };
  };
};

type MetadataEntry = Omit<CollageImage, 'src'> | CollageText | StoredModel3D;

// Objects keyed by their own id in the blob store: an image's source, or a 3D
// object's uploaded texture. Ids are unique across kinds, so one keyspace
// serves both.
function blobFor(obj: CollageObject): string | null {
  if (obj.kind === 'image') return obj.src;
  if (obj.kind === 'model3d' && obj.material.texture?.source === 'image') {
    return obj.material.texture.src;
  }
  return null;
}

interface StoredState {
  images: MetadataEntry[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

// Metadata (positions, masks, etc.) → localStorage (tiny)
// Image blobs (data URLs) → IndexedDB (large)
export async function saveState(state: CanvasState): Promise<void> {
  // Collect every live image's blob and hand the whole picture to the store in
  // one transaction. An image's `src` is set once at creation and never
  // rewritten afterwards (moving, masking or cropping it only touches
  // metadata), so idbSyncBlobs writes a data URL only the first time it sees
  // that id — a save triggered by dragging a slider ends up writing no blobs
  // at all. The previous version re-serialized every image's full base64 data
  // URL on every single state change, which dominated CPU during ordinary
  // editing.
  const blobs = new Map<string, string>();
  for (const obj of state.images) {
    const blob = blobFor(obj);
    if (blob !== null) blobs.set(obj.id, blob);
  }
  await idbSyncBlobs(blobs);

  const meta: StoredState = {
    images: state.images.map((obj) => {
      if (obj.kind === 'image') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { src: _src, ...rest } = obj;
        return rest;
      }
      if (obj.kind === 'model3d' && obj.material.texture?.source === 'image') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { src: _texSrc, ...texRest } = obj.material.texture;
        return { ...obj, material: { ...obj.material, texture: texRest } };
      }
      return obj;
    }),
    stagePosition: state.stagePosition,
    stageScale: state.stageScale,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export async function loadState(): Promise<CanvasState | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as StoredState;
    const images: CollageObject[] = [];
    for (const entry of meta.images) {
      if (entry.kind === 'text') {
        images.push(entry);
        continue;
      }
      if (entry.kind === 'model3d') {
        const texture = entry.material.texture;
        if (texture?.source !== 'image') {
          images.push(entry as CollageModel3D);
          continue;
        }
        const texSrc = await idbGet(entry.id);
        // A lost texture blob costs the object its surface pattern, not the
        // object — unlike an image, there's still something to draw.
        const material = texSrc
          ? { ...entry.material, texture: { ...texture, src: texSrc } }
          : { ...entry.material, texture: undefined };
        images.push({ ...entry, material } as CollageModel3D);
        continue;
      }
      const src = await idbGet(entry.id);
      if (src) {
        // Entries saved before the object union existed have no `kind` at
        // all — normalize them here rather than trusting the (pre-union) type.
        images.push({ ...entry, kind: 'image', src });
      }
      // Skip images whose blob was lost
    }
    return {
      images,
      stagePosition: meta.stagePosition,
      stageScale: meta.stageScale,
    };
  } catch {
    return null;
  }
}
