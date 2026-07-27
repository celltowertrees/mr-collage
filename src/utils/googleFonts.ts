// Listing the full Google Fonts catalog requires a Developer API key (the
// `/webfonts/v1/webfonts` endpoint); the `css2` endpoint used below to fetch
// a font's actual CSS/files needs no key at all. This app trades catalog
// breadth for staying key-free: the picker only offers fonts from this
// curated list, not the full ~1800-family library.
export const GOOGLE_FONTS = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Inter',
  'Source Sans Pro',
  'Nunito',
  'Raleway',
  'Work Sans',
  'Quicksand',
  'Rubik',
  'Playfair Display',
  'Merriweather',
  'PT Serif',
  'Lora',
  'Abril Fatface',
  'Oswald',
  'Bebas Neue',
  'Roboto Slab',
  'Roboto Mono',
  'Pacifico',
  'Dancing Script',
  'Caveat',
  'Lobster',
] as const;

export const DEFAULT_FONT_FAMILY: string = GOOGLE_FONTS[0];

export function fontWeightFor(bold: boolean): number {
  return bold ? 700 : 400;
}

function css2Url(family: string, weight: number, italic: boolean, text?: string): string {
  const params = new URLSearchParams();
  params.set('family', `${family}:ital,wght@${italic ? 1 : 0},${weight}`);
  params.set('display', 'swap');
  if (text) params.set('text', text);
  return `https://fonts.googleapis.com/css2?${params.toString()}`;
}

// Without a `text` param, Google's css2 endpoint returns several @font-face
// blocks, one per Unicode range (e.g. "latin-ext" listed before "latin") —
// grabbing the first url() in the response picks whichever subset happens to
// be listed first, which is frequently NOT the one covering plain ASCII. The
// browser still reports that font file "loaded" (it's a genuinely valid font,
// just for a different script), so it silently falls back to a system font
// for every basic-Latin character instead of erroring. Pick the block whose
// unicode-range actually covers basic Latin (U+0000-00FF); a `text`-subsetted
// request returns only one block anyway, which the fallback below picks up.
function extractFontUrl(css: string): string | null {
  const blocks = css.split('@font-face').slice(1);
  let fallback: string | null = null;
  for (const block of blocks) {
    const urlMatch = block.match(/url\((https:[^)]+)\)/);
    if (!urlMatch) continue;
    if (fallback === null) fallback = urlMatch[1];
    const rangeMatch = block.match(/unicode-range:\s*([^;]+);/i);
    if (!rangeMatch || /U\+0*0000-0*00FF/i.test(rangeMatch[1])) {
      return urlMatch[1];
    }
  }
  return fallback;
}

// Live, in-app rendering: fonts load over the network on demand (acceptable
// for the editor itself — only the exported file needs to be self-contained,
// see embedGoogleFont below).
//
// This deliberately does NOT inject a <link rel="stylesheet"> and call
// document.fonts.load() on the family name — that races the stylesheet's own
// fetch: load() only resolves a font that's already backed by a registered
// @font-face rule, and immediately after appendChild() the linked CSS hasn't
// been fetched/parsed yet, so load() often finds nothing to wait for and
// resolves early. Building a FontFace from the font file URL directly and
// awaiting its own .load() has no such race — it resolves only once the
// actual font binary has been fetched and parsed, guaranteed.
const loadedFaces = new Map<string, Promise<void>>();

export function loadGoogleFontFace(family: string, weight: number, italic: boolean): Promise<void> {
  const key = `${family}|${weight}|${italic}`;
  const cached = loadedFaces.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const cssRes = await fetch(css2Url(family, weight, italic));
      if (!cssRes.ok) return;
      const css = await cssRes.text();
      const fontUrl = extractFontUrl(css);
      if (!fontUrl) return;

      const fontFace = new FontFace(family, `url(${fontUrl})`, {
        weight: String(weight),
        style: italic ? 'italic' : 'normal',
      });
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch {
      // Canvas keeps rendering in a fallback font if this fails — no worse
      // than before the fetch was attempted.
    }
  })();

  loadedFaces.set(key, promise);
  return promise;
}

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface EmbeddedFontFace {
  cssRule: string;
}

// Export-time embedding: re-fetches the font, subsetted to only the
// characters actually used (via the `text` param) to keep the embedded file
// small, then inlines the binary as a base64 data URI so the exported HTML
// has zero external references. Returns null on any failure (offline, font
// blocked, etc.) so the caller can fall back to a plain system font instead
// of failing the whole export.
export async function embedGoogleFont(
  family: string,
  weight: number,
  italic: boolean,
  text: string
): Promise<EmbeddedFontFace | null> {
  try {
    const cssRes = await fetch(css2Url(family, weight, italic, text));
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const fontUrl = extractFontUrl(css);
    if (!fontUrl) return null;

    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok) return null;
    const buf = await fontRes.arrayBuffer();
    const base64 = await arrayBufferToBase64(buf);

    const style = italic ? 'italic' : 'normal';
    return {
      cssRule: `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`,
    };
  } catch {
    return null;
  }
}
