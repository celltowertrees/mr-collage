import { CanvasState, CollageImage, CollageObject, CollageText } from '../types';
import { idbPut, idbGet, idbDelete, idbAllKeys } from './db';

const STORAGE_KEY = 'mr-collage-state';

// Text objects have no `src` blob, so they pass through metadata untouched;
// images have their `src` stripped out to IndexedDB. Metadata read back from
// localStorage is untyped JSON — entries saved before text objects existed
// have no `kind` field at all, so loadState below normalizes those to
// `kind: 'image'` rather than relying on the type here to enforce it.
type MetadataEntry = Omit<CollageImage, 'src'> | CollageText;

interface StoredState {
  images: MetadataEntry[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

// Metadata (positions, masks, etc.) → localStorage (tiny)
// Image blobs (data URLs) → IndexedDB (large)
export async function saveState(state: CanvasState): Promise<void> {
  const currentIds = new Set<string>();
  for (const obj of state.images) {
    if (obj.kind === 'text') continue;
    currentIds.add(obj.id);
    await idbPut(obj.id, obj.src);
  }

  const allKeys = await idbAllKeys();
  for (const key of allKeys) {
    if (!currentIds.has(key)) {
      await idbDelete(key);
    }
  }

  const meta: StoredState = {
    images: state.images.map((obj) => {
      if (obj.kind === 'text') return obj;
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
      if (entry.kind === 'text') {
        images.push(entry);
        continue;
      }
      const src = await idbGet(entry.id);
      if (src) {
        // Entries saved before text objects existed have no `kind` at all —
        // normalize them here rather than trusting the (pre-union) type.
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
