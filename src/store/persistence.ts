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
type MetadataEntry = Omit<CollageImage, 'src'> | CollageText | CollageModel3D;

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
    if (obj.kind !== 'image') continue;
    blobs.set(obj.id, obj.src);
  }
  await idbSyncBlobs(blobs);

  const meta: StoredState = {
    images: state.images.map((obj) => {
      if (obj.kind !== 'image') return obj;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { src: _src, ...rest } = obj;
      return rest;
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
      if (entry.kind === 'text' || entry.kind === 'model3d') {
        images.push(entry);
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
