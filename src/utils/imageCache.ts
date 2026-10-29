import { useEffect, useState } from 'react';

// One decoded copy of each picture, shared by every node showing it. Each node
// used to decode its own copy, so a duplicated image (or one brought back by
// an undo, which remounts its node) paid for the decode — and held the
// decoded bitmap — twice. Entries are reference-counted and dropped once the
// last node using them unmounts, so a deleted image's pixels can be
// reclaimed.
//
// Each picture is decoded ahead of its first paint with img.decode(), which
// does the work off the main thread. Drawing a never-decoded <img> into a
// canvas leaves Chrome to decode it lazily, on the main thread, the moment
// it's first painted on screen — a performance trace of panning and zooming
// a collage showed 7–12ms hitches as images scrolled into view.
//
// It stays an <img> rather than becoming an ImageBitmap on purpose: a GPU
// canvas keeps an <img>'s texture cached between frames, but measured
// re-uploading every ImageBitmap on every frame — panning across 30 large
// images went from ~40ms to ~700ms of main-thread compositor commits.

type Loader<T> = (src: string) => Promise<T>;

interface Entry<T> {
  promise: Promise<T>;
  refs: number;
  // Pending removal once nothing has used the entry for RELEASE_DELAY_MS.
  releaseTimer: number | null;
}

// Long enough to ride out a remount (StrictMode's double effect, an undo that
// brings an object straight back) without decoding the picture all over again.
const RELEASE_DELAY_MS = 1000;

function createCache<T>(load: Loader<T>) {
  const entries = new Map<string, Entry<T>>();

  function acquire(src: string): Promise<T> {
    let entry = entries.get(src);
    if (!entry) {
      const promise = load(src);
      const created: Entry<T> = { promise, refs: 0, releaseTimer: null };
      entry = created;
      entries.set(src, created);
      // A failed decode shouldn't be cached, or a retry would inherit it.
      promise.catch(() => {
        if (entries.get(src) === created) entries.delete(src);
      });
    }
    if (entry.releaseTimer !== null) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
    entry.refs++;
    return entry.promise;
  }

  function release(src: string) {
    const entry = entries.get(src);
    if (!entry) return;
    entry.refs--;
    if (entry.refs > 0 || entry.releaseTimer !== null) return;
    entry.releaseTimer = window.setTimeout(() => {
      if (entries.get(src) !== entry || entry.refs > 0) return;
      entries.delete(src);
    }, RELEASE_DELAY_MS);
  }

  return { acquire, release };
}

function loadElement(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Image failed to decode'));
    element.src = src;
  });
}

async function loadDecoded(src: string): Promise<HTMLImageElement> {
  const element = await loadElement(src);
  // Best effort: a decode that fails (e.g. the image was evicted) still
  // leaves a perfectly drawable element, decoded lazily as before.
  await element.decode().catch(() => {});
  return element;
}

const images = createCache(loadDecoded);

function useCached<T>(cache: ReturnType<typeof createCache<T>>, src: string | null | undefined): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!src) {
      setValue(null);
      return;
    }
    let cancelled = false;
    cache.acquire(src).then(
      (loaded) => { if (!cancelled) setValue(loaded); },
      () => { if (!cancelled) setValue(null); }
    );
    return () => {
      cancelled = true;
      cache.release(src);
    };
  }, [cache, src]);
  return value;
}

// The picture at `src` as a loaded, decoded <img> — or null while it loads
// (or if there's no src, or it won't decode).
export function useLoadedImage(src: string | null | undefined): HTMLImageElement | null {
  return useCached(images, src);
}
