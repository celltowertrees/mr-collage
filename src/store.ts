import { CanvasState, CollageImage } from './types';

const STORAGE_KEY = 'mr-collage-state';
const DB_NAME = 'mr-collage-db';
const DB_VERSION = 1;
const IMG_STORE = 'images';

// ── IndexedDB helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

// ── Save / Load ──
// Metadata (positions, masks, etc.) → localStorage (tiny)
// Image blobs (data URLs) → IndexedDB (large)

type MetadataImage = Omit<CollageImage, 'src'>;

interface StoredState {
  images: MetadataImage[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

export async function saveState(state: CanvasState): Promise<void> {
  // Write image data URLs to IndexedDB
  const currentIds = new Set<string>();
  for (const img of state.images) {
    currentIds.add(img.id);
    await idbPut(img.id, img.src);
  }

  // Clean up removed images from IndexedDB
  const allKeys = await idbAllKeys();
  for (const key of allKeys) {
    if (!currentIds.has(key)) {
      await idbDelete(key);
    }
  }

  // Write metadata (without src) to localStorage
  const meta: StoredState = {
    images: state.images.map(({ src: _src, ...rest }) => rest),
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
    // Rehydrate image sources from IndexedDB
    const images: CollageImage[] = [];
    for (const imgMeta of meta.images) {
      const src = await idbGet(imgMeta.id);
      if (src) {
        images.push({ ...imgMeta, src });
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

// ── ICP Export ──

export function exportToICP(images: CollageImage[]): object {
  return {
    "infinite-canvas": {
      version: "0.1",
      nodes: images.map((img) => ({
        id: img.id,
        type: "image",
        position: { x: img.x, y: img.y },
        size: {
          width: img.width * img.scaleX,
          height: img.height * img.scaleY,
        },
        rotation: img.rotation,
        opacity: img.opacity,
        zIndex: img.zIndex,
        data: {
          src: img.src,
          name: img.name,
          ...(img.mask ? { mask: img.mask } : {}),
        },
      })),
    },
  };
}
