const DB_NAME = 'mr-collage-db';
const DB_VERSION = 1;
const IMG_STORE = 'images';

// The connection is opened once and reused. Every operation used to open its
// own, which meant a single save of N images cost N+1 `indexedDB.open()` calls
// — and `open` showed up as ~2.7% of total CPU in a profile of ordinary
// editing. The factory is cached alongside the promise so a test that swaps in
// a fresh `globalThis.indexedDB` (fake-indexeddb does this per test) gets a
// fresh connection rather than a handle to the database it just replaced.
let cached: { factory: IDBFactory; db: Promise<IDBDatabase> } | null = null;

function openDB(): Promise<IDBDatabase> {
  if (cached && cached.factory === indexedDB) return cached.db;
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const upgraded = req.result;
      if (!upgraded.objectStoreNames.contains(IMG_STORE)) {
        upgraded.createObjectStore(IMG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open must not be cached, or every later call inherits the
  // rejection forever.
  db.catch(() => {
    if (cached?.db === db) cached = null;
  });
  cached = { factory: indexedDB, db };
  return db;
}

export async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Brings the blob store in line with the collage in ONE transaction: writes
 * only the blobs that aren't stored yet, and prunes the ones no longer
 * referenced.
 *
 * The "already stored?" question is answered from the store's own keys rather
 * than a cache held in JS. That costs one cheap getAllKeys per save and buys
 * correctness for free in the awkward cases — an undo that resurrects a
 * deleted object finds its blob genuinely gone and rewrites it, and nothing
 * has to be invalidated when the database is replaced underneath us.
 *
 * `blobs` therefore holds every live image's data URL, but a value is only
 * ever serialized into the store when its key is actually missing.
 */
export async function idbSyncBlobs(blobs: Map<string, string>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    const store = tx.objectStore(IMG_STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const existing = new Set(keysReq.result as string[]);
      for (const key of existing) {
        if (!blobs.has(key)) store.delete(key);
      }
      for (const [key, value] of blobs) {
        if (!existing.has(key)) store.put(value, key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
