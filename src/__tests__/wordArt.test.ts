import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollageText } from '../types';
import {
  bakeTextResize,
  layoutWordArt,
  wordArtFont,
  WARP_SHAPES,
  type TextMeasure,
  type WordArtLayout,
} from '../utils/wordArt';
import { WORDART_PRESETS, applyWordArtPreset } from '../utils/wordArtPresets';
import { exportToICP, exportToStaticHTML, type ExportViewport } from '../store';
import { parseICP } from '../store/importICP';
import { decideCoalesce } from '../hooks/useHistory';

// Maps to CLAUDE.md → "WordArt Text Styles" and "WYSIWYG Text Editing".

// jsdom has no canvas, so layouts are measured with a fixed-pitch fake: every
// character is half the font size wide.
const measure: TextMeasure = (text, font) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  return text.length * size * 0.5;
};

function makeText(overrides: Partial<CollageText> = {}): CollageText {
  return {
    kind: 'text',
    id: 't1',
    text: 'Hello',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    name: 'Text',
    fontFamily: 'Roboto',
    fontSize: 40,
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
    ...overrides,
  };
}

function glyphsOf(layout: WordArtLayout, line: number) {
  return layout.glyphs.filter((g) => g.line === line);
}

describe('layoutWordArt', () => {
  it('lays plain text out line by line, one glyph per visible character', () => {
    const layout = layoutWordArt(makeText({ text: 'ab\ncd' }), measure);
    expect(layout.glyphs.map((g) => g.char).join('')).toBe('abcd');
    const [a] = glyphsOf(layout, 0);
    const [c] = glyphsOf(layout, 1);
    expect(c.y).toBeGreaterThan(a.y);
    expect(c.x).toBeCloseTo(a.x);
    expect(layout.glyphs.every((g) => g.angle === 0 && g.sy === 1)).toBe(true);
  });

  it('centres shorter lines when aligned to the centre', () => {
    const layout = layoutWordArt(makeText({ text: 'abcd\nab', align: 'center' }), measure);
    const mid = (gs: { x: number }[]) => (gs[0].x + gs[gs.length - 1].x) / 2;
    expect(mid(glyphsOf(layout, 1))).toBeCloseTo(mid(glyphsOf(layout, 0)));
  });

  it('spreads glyphs apart with letter spacing', () => {
    const tight = layoutWordArt(makeText({ text: 'ab' }), measure);
    const loose = layoutWordArt(makeText({ text: 'ab', letterSpacing: 10 }), measure);
    const gap = (l: WordArtLayout) => l.glyphs[1].x - l.glyphs[0].x;
    expect(gap(loose) - gap(tight)).toBeCloseTo(10);
  });

  it('normalizes bounds to start at the origin', () => {
    for (const shape of WARP_SHAPES) {
      const layout = layoutWordArt(makeText({ text: 'Warped', warp: { shape, amount: 70 } }), measure);
      expect(layout.bounds.x).toBe(0);
      expect(layout.bounds.y).toBe(0);
      expect(layout.bounds.width).toBeGreaterThan(0);
      expect(layout.bounds.height).toBeGreaterThan(0);
      for (const g of layout.glyphs) {
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.x).toBeLessThanOrEqual(layout.bounds.width);
      }
    }
  });
});

describe('warp shapes', () => {
  const warped = (shape: (typeof WARP_SHAPES)[number], amount = 60) =>
    layoutWordArt(makeText({ text: 'abcde', warp: { shape, amount } }), measure).glyphs;

  it('arch up lifts the middle above the ends and tilts the ends outward', () => {
    const g = warped('arch-up');
    expect(g[2].y).toBeLessThan(g[0].y);
    expect(g[2].y).toBeLessThan(g[4].y);
    expect(g[0].angle).toBeLessThan(0);
    expect(g[4].angle).toBeGreaterThan(0);
  });

  it('arch down sags the middle below the ends', () => {
    const g = warped('arch-down');
    expect(g[2].y).toBeGreaterThan(g[0].y);
    expect(g[0].angle).toBeGreaterThan(0);
    expect(g[4].angle).toBeLessThan(0);
  });

  it('circle at full strength wraps the text most of the way round', () => {
    const g = warped('circle', 100);
    expect(g[4].angle - g[0].angle).toBeGreaterThan(Math.PI);
  });

  it('wave moves glyphs up and down along the line', () => {
    const ys = warped('wave').map((g) => Math.round(g.y));
    expect(new Set(ys).size).toBeGreaterThan(1);
  });

  it('slant raises one end above the other', () => {
    const up = warped('slant-up');
    expect(up[4].y).toBeLessThan(up[0].y);
    const down = warped('slant-down');
    expect(down[4].y).toBeGreaterThan(down[0].y);
  });

  it('bulge makes the middle letters taller, pinch makes them shorter', () => {
    const bulge = warped('bulge');
    expect(bulge[2].sy).toBeGreaterThan(bulge[0].sy);
    const pinch = warped('pinch');
    expect(pinch[2].sy).toBeLessThan(pinch[0].sy);
  });

  it('a warp at zero strength leaves the text flat', () => {
    const g = warped('arch-up', 0);
    expect(new Set(g.map((x) => x.y)).size).toBe(1);
  });
});

describe('caret positions', () => {
  it('maps every caret index to a point and back, across lines and warps', () => {
    for (const warp of [undefined, { shape: 'arch-up' as const, amount: 50 }]) {
      const text = 'ab\n\ncd';
      const layout = layoutWordArt(makeText({ text, warp }), measure);
      for (let i = 0; i <= text.length; i++) {
        const caret = layout.caretAt(i);
        const mid = { x: (caret.top.x + caret.bottom.x) / 2, y: (caret.top.y + caret.bottom.y) / 2 };
        expect(layout.indexAt(mid)).toBe(i);
      }
    }
  });

  it('puts the caret at the end of the text after the last glyph', () => {
    const layout = layoutWordArt(makeText({ text: 'ab' }), measure);
    const end = layout.caretAt(2);
    const start = layout.caretAt(0);
    expect(end.top.x).toBeGreaterThan(start.top.x);
  });

  it('gives empty text a caret so a new object can be typed into', () => {
    const layout = layoutWordArt(makeText({ text: '' }), measure);
    expect(layout.bounds.height).toBeGreaterThan(0);
    const caret = layout.caretAt(0);
    expect(caret.bottom.y).toBeGreaterThan(caret.top.y);
  });
});

describe('outline and extrusion', () => {
  it('grow the bounds so nothing is clipped', () => {
    const plain = layoutWordArt(makeText(), measure).bounds;
    const outlined = layoutWordArt(makeText({ outline: { color: '#000', width: 10 } }), measure).bounds;
    expect(outlined.width).toBeGreaterThan(plain.width);
    const extruded = layoutWordArt(
      makeText({ extrusion: { color: '#333', depth: 20, angle: 45 } }),
      measure
    ).bounds;
    expect(extruded.width).toBeGreaterThanOrEqual(plain.width + 14);
    expect(extruded.height).toBeGreaterThanOrEqual(plain.height + 14);
  });

  it('builds a CSS font string from the text style', () => {
    expect(wordArtFont(makeText({ bold: true, italic: true, fontFamily: 'Lobster', fontSize: 30 }))).toBe(
      "italic 700 30px 'Lobster', sans-serif"
    );
  });
});

describe('bakeTextResize', () => {
  it('turns a corner drag into a real font size and resets the scale', () => {
    const changes = bakeTextResize(
      makeText({
        fontSize: 32,
        outline: { color: '#000', width: 4 },
        extrusion: { color: '#333', depth: 10, angle: 45 },
        letterSpacing: 2,
      }),
      2,
      2
    );
    expect(changes.fontSize).toBe(64);
    expect(changes.outline?.width).toBe(8);
    expect(changes.extrusion?.depth).toBe(20);
    expect(changes.letterSpacing).toBe(4);
    expect(changes.scaleX).toBe(1);
    expect(changes.scaleY).toBe(1);
  });
});

describe('WordArt presets', () => {
  it('offers a gallery of distinct named presets', () => {
    expect(WORDART_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(WORDART_PRESETS.map((p) => p.id)).size).toBe(WORDART_PRESETS.length);
  });

  it('applying a preset restyles the text but keeps its content, size, and place', () => {
    const original = makeText({ text: 'Keep me', fontSize: 55, x: 12, y: 34, rotation: 15 });
    for (const preset of WORDART_PRESETS) {
      const changes = applyWordArtPreset(preset);
      const restyled = { ...original, ...changes };
      expect(restyled.text).toBe('Keep me');
      expect(restyled.fontSize).toBe(55);
      expect(restyled.x).toBe(12);
      expect(restyled.rotation).toBe(15);
    }
  });

  it('a preset clears effects it does not use, so presets do not pile up', () => {
    const plainPreset = WORDART_PRESETS.find((p) => !p.style.warp)!;
    const changes = applyWordArtPreset(plainPreset);
    expect('warp' in changes).toBe(true);
    expect(changes.warp).toBeUndefined();
  });
});

describe('WordArt in ICP JSON', () => {
  it('round-trips every WordArt field through export and import', () => {
    const text = makeText({
      align: 'right',
      letterSpacing: 3,
      lineHeight: 1.5,
      gradient: { to: '#00ff00', angle: 30 },
      outline: { color: '#ffffff', width: 2 },
      extrusion: { color: '#222222', depth: 8, angle: 135 },
      warp: { shape: 'wave', amount: 40 },
    });
    const { objects } = parseICP(JSON.stringify(exportToICP([text])));
    expect(objects[0]).toEqual(text);
  });

  it('drops a warp shape it does not know rather than rejecting the file', () => {
    const exported = exportToICP([makeText()]) as { 'infinite-canvas': { nodes: { data: object }[] } };
    exported['infinite-canvas'].nodes[0].data = {
      ...exported['infinite-canvas'].nodes[0].data,
      warp: { shape: 'spiral', amount: 50 },
    };
    const { objects } = parseICP(JSON.stringify(exported));
    expect((objects[0] as CollageText).warp).toBeUndefined();
  });
});

describe('typing session undo grouping', () => {
  const fresh = { lastSetAt: 0, lastWasCoalescible: false, lastGroup: null as string | null };

  it('merges every edit in the same group into one step, however slowly it is typed', () => {
    const first = decideCoalesce(fresh, { group: 'edit:t1' }, 1000);
    expect(first.coalesce).toBe(false);
    const second = decideCoalesce(first.tracker, { group: 'edit:t1' }, 60_000);
    expect(second.coalesce).toBe(true);
  });

  it('starts a new step when an edit outside the group lands in between', () => {
    const first = decideCoalesce(fresh, { group: 'edit:t1' }, 1000);
    const other = decideCoalesce(first.tracker, {}, 1100);
    const back = decideCoalesce(other.tracker, { group: 'edit:t1' }, 1200);
    expect(back.coalesce).toBe(false);
  });

  it('still coalesces quick continuous edits outside any group', () => {
    const a = decideCoalesce(fresh, { coalesce: true }, 1000);
    const b = decideCoalesce(a.tracker, { coalesce: true }, 1200);
    expect(b.coalesce).toBe(true);
  });
});

describe('WordArt in the static HTML export', () => {
  const viewport: ExportViewport = { x: 0, y: 0, scale: 1, width: 1024, height: 768 };
  const frame = (html: string, id: string) => {
    const el = new DOMParser().parseFromString(html, 'text/html').getElementById(id);
    if (!el) throw new Error(`no element ${id}`);
    return el;
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds warped or extruded text as its baked image', async () => {
    const text = makeText({ x: 200, y: 200, warp: { shape: 'arch-up', amount: 50 } });
    const snapshot = 'data:image/png;base64,WORDART';
    const html = await exportToStaticHTML([text], viewport, {}, {}, { [text.id]: snapshot });
    const img = frame(html, text.id).querySelector('img');
    expect(img?.getAttribute('src')).toBe(snapshot);
  });

  it('falls back to live text when a warped text could not be baked', async () => {
    const text = makeText({ x: 200, y: 200, text: 'Still here', extrusion: { color: '#333', depth: 6, angle: 45 } });
    const html = await exportToStaticHTML([text], viewport);
    expect(frame(html, text.id).textContent).toContain('Still here');
  });

  it('keeps gradient, outlined, aligned text as live, styled text', async () => {
    const text = makeText({
      x: 200,
      y: 200,
      text: 'Live',
      align: 'center',
      letterSpacing: 3,
      gradient: { to: '#ff0000', angle: 90 },
      outline: { color: '#0000ff', width: 2 },
    });
    const html = await exportToStaticHTML([text], viewport);
    const el = frame(html, text.id);
    expect(el.querySelector('img')).toBeNull();
    const style = el.innerHTML;
    expect(style).toContain('background-clip: text');
    expect(style).toContain('linear-gradient(180deg');
    expect(style).toContain('-webkit-text-stroke: 2px #0000ff');
    expect(style).toContain('text-align: center');
    expect(style).toContain('letter-spacing: 3px');
  });
});
