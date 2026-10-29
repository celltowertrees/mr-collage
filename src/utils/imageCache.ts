import { useEffect, useState } from 'react';

// One decoded <img> per source, shared by every node showing it. Each node
// used to decode its own copy, so a duplicated image (or one brought back by
// an undo, which remounts its node) paid for the decode — and held the
// decoded bitmap — twice. Entries are reference-counted and dropped once the
// last node using them unmounts, so a deleted image's pixels can still be
// reclaimed.
interface Entry {
  promise: Promise<HTMLImageElement>;
  refs: number;
}

const cache = new Map<string, Entry>();

function acquire(src: string): Promise<HTMLImageElement> {
  let entry = cache.get(src);
  if (!entry) {
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image failed to decode'));
      element.src = src;
    });
    entry = { promise, refs: 0 };
    cache.set(src, entry);
    // A failed decode shouldn't be cached, or a retry would inherit it.
    promise.catch(() => {
      if (cache.get(src) === entry) cache.delete(src);
    });
  }
  entry.refs++;
  return entry.promise;
}

function release(src: string) {
  const entry = cache.get(src);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) cache.delete(src);
}

// The decoded image for `src`, or null while it loads (or if there's no src,
// or it won't decode).
export function useLoadedImage(src: string | null | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let cancelled = false;
    acquire(src).then(
      (element) => { if (!cancelled) setImg(element); },
      () => { if (!cancelled) setImg(null); }
    );
    return () => {
      cancelled = true;
      release(src);
    };
  }, [src]);
  return img;
}
