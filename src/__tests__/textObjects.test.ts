import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportToICP, exportToStaticHTML, ExportViewport } from '../store';
import { CollageText } from '../types';

function makeText(overrides: Partial<CollageText> = {}): CollageText {
  return {
    kind: 'text',
    id: 'text-1',
    text: 'Hello',
    x: 100,
    y: 200,
    width: 120,
    height: 40,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'Text',
    fontFamily: 'Roboto',
    fontSize: 32,
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
    ...overrides,
  };
}

function parseFrame(html: string, id: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById(id);
  if (!el) throw new Error(`no element with id ${id} in exported HTML`);
  return el;
}

// A minimal fake of Google's css2 response shape: one @font-face block whose
// src url() points at a "gstatic" font file.
function fakeGoogleFontsCss(url: string): string {
  return `@font-face {\n  font-family: 'Roboto';\n  font-style: normal;\n  font-weight: 400;\n  src: url(${url}) format('woff2');\n}`;
}

describe('exportToICP text data', () => {
  // Maps to CLAUDE.md → "Add Text to the Canvas" → export scenario
  it('includes the text content and font/style settings', () => {
    const text = makeText({ bold: true, italic: true, underline: true, color: '#ff00ff', fontSize: 48 });
    const result = exportToICP([text]) as unknown as {
      'infinite-canvas': { nodes: { id: string; type: string; data: Record<string, unknown> }[] };
    };
    const node = result['infinite-canvas'].nodes[0];

    expect(node.type).toBe('text');
    expect(node.data).toMatchObject({
      text: 'Hello',
      fontFamily: 'Roboto',
      fontSize: 48,
      bold: true,
      italic: true,
      underline: true,
      color: '#ff00ff',
    });
  });
});

describe('exportToStaticHTML text rendering', () => {
  const viewport: ExportViewport = { x: 0, y: 0, scale: 1, width: 1024, height: 768 };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('no network in this describe block by default'))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('positions a text frame relative to the viewport and renders its style', async () => {
    const text = makeText({ color: '#123456', fontSize: 20 });
    const html = await exportToStaticHTML([text], viewport);
    const frame = parseFrame(html, text.id);

    expect(frame.style.width).toBe('120px');
    expect(frame.style.height).toBe('40px');
    // center = (100, 200); left/top = center - size/2
    expect(frame.style.left).toBe('40px');
    expect(frame.style.top).toBe('180px');
    expect(html).toContain('#123456');
    expect(html).toContain('Hello');
  });

  it('falls back gracefully (no crash, no embedded font) when the font fetch fails', async () => {
    // beforeEach already stubs fetch to reject — simulates being offline at export time.
    const text = makeText();
    const html = await exportToStaticHTML([text], viewport);

    expect(html).toContain('Hello');
    expect(html).not.toContain('@font-face');
  });
});

describe('exportToStaticHTML font embedding', () => {
  const viewport: ExportViewport = { x: 0, y: 0, scale: 1, width: 1024, height: 768 };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds the used font as a base64 @font-face rule with no external references', async () => {
    const fontUrl = 'https://fonts.gstatic.com/s/roboto/fake.woff2';
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve({ ok: true, text: async () => fakeGoogleFontsCss(fontUrl) });
      }
      if (url === fontUrl) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode('FAKEFONTBYTES').buffer,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = makeText();
    const html = await exportToStaticHTML([text], viewport);

    expect(html).toContain('@font-face');
    expect(html).toMatch(/src:\s*url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/);
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('requests each distinct font/weight/style combination only once, even with multiple text objects', async () => {
    const fontUrl = 'https://fonts.gstatic.com/s/roboto/fake.woff2';
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve({ ok: true, text: async () => fakeGoogleFontsCss(fontUrl) });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('FAKEFONTBYTES').buffer,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = makeText({ id: 'a', text: 'Hi' });
    const b = makeText({ id: 'b', text: 'There' });
    await exportToStaticHTML([a, b], viewport);

    // One request for the CSS, one for the font binary — not two of each.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
