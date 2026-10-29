import { useEffect, useState } from 'react';

// three.js is most of the bundle's weight, and the 3D tool is off by default
// (see featureFlags.ts) — so the renderer that pulls it in is fetched on
// demand rather than shipped with every page load. It's requested the first
// time anything needs it: a 3D node mounting (a saved or imported object),
// the 3D menu opening (which also warms up WebGL), or an HTML export.
type ModelRenderer = typeof import('./model3dRenderer');

let loading: Promise<ModelRenderer> | null = null;
let loaded: ModelRenderer | null = null;

export function loadModelRenderer(): Promise<ModelRenderer> {
  if (!loading) {
    loading = import('./model3dRenderer').then((mod) => {
      loaded = mod;
      return mod;
    });
    // A failed fetch (e.g. offline) shouldn't stick; the next caller retries.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

// The renderer module, or null until it has arrived — at which point the
// calling component re-renders with it.
export function useModelRenderer(): ModelRenderer | null {
  const [renderer, setRenderer] = useState<ModelRenderer | null>(loaded);
  useEffect(() => {
    if (renderer) return;
    let cancelled = false;
    loadModelRenderer().then(
      (mod) => { if (!cancelled) setRenderer(mod); },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [renderer]);
  return renderer;
}
