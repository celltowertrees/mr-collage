import { describe, expect, it } from 'vitest';
import { exportToICP, parseICP } from '../store';
import { CARD_SIZES, CARD_UNITS_PER_INCH, CardSizeId, CollageCard } from '../types';
import { cardExportSize, cardFileName, cardLabel, cardPrintSizeIn, cardSizeSlug } from '../utils/card';
import { setJpegDpi } from '../utils/jpegDpi';
import { jpegToPdf } from '../utils/jpegPdf';

// Maps to CLAUDE.md → "More Card Sizes and Print Formats"

function cardOf(sizeId: CardSizeId, overrides: Partial<CollageCard> = {}): CollageCard {
  const size = CARD_SIZES[sizeId];
  return {
    kind: 'card',
    id: `card-${sizeId}`,
    name: size.label,
    sizeId,
    includeBleed: true,
    x: 0,
    y: 0,
    width: size.widthIn * CARD_UNITS_PER_INCH,
    height: size.heightIn * CARD_UNITS_PER_INCH,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    zIndex: 1,
    ...overrides,
  };
}

describe('card sizes', () => {
  // [size, slug, label, trimmed px, with-bleed px] — landscape, at 300dpi.
  const cases: [CardSizeId, string, string, [number, number], [number, number]][] = [
    ['postcard', '4x6in', 'Postcard 4×6 in', [1800, 1200], [1875, 1275]],
    ['postcardMax', '4.25x6in', 'Max Postcard 4.25×6 in', [1800, 1275], [1875, 1350]],
    ['greeting', '5x7in', 'Greeting Card 5×7 in', [2100, 1500], [2175, 1575]],
    ['a6', '105x148mm', 'A6 105×148 mm', [1748, 1240], [1823, 1315]],
    ['square', '5x5in', 'Square 5×5 in', [1500, 1500], [1575, 1575]],
  ];

  it.each(cases)('%s reads as %s and exports at the right pixel size', (sizeId, slug, label, trim, bleed) => {
    const card = cardOf(sizeId);
    expect(cardSizeSlug(card)).toBe(slug);
    expect(cardLabel(card)).toBe(label);
    expect(cardExportSize({ ...card, includeBleed: false })).toEqual({ width: trim[0], height: trim[1] });
    expect(cardExportSize(card)).toEqual({ width: bleed[0], height: bleed[1] });
  });

  it('filenames carry the size slug and the chosen format', () => {
    expect(cardFileName(cardOf('postcardMax'), 0, 'png')).toBe('card-1-4.25x6in.png');
    expect(cardFileName(cardOf('greeting'), 1, 'jpeg')).toBe('card-2-5x7in.jpg');
    expect(cardFileName(cardOf('a6'), 2, 'pdf')).toBe('card-3-105x148mm.pdf');
  });

  it('the print size in inches includes the bleed when it is on, and follows orientation', () => {
    const card = cardOf('greeting');
    expect(cardPrintSizeIn(card)).toEqual({ width: 7.25, height: 5.25 });
    expect(cardPrintSizeIn({ ...card, includeBleed: false })).toEqual({ width: 7, height: 5 });
    expect(cardPrintSizeIn({ ...card, width: card.height, height: card.width, includeBleed: false })).toEqual({
      width: 5,
      height: 7,
    });
  });

  it('the chosen export format round-trips through ICP JSON', () => {
    const card = cardOf('greeting', { exportFormat: 'pdf' });
    expect(parseICP(JSON.stringify(exportToICP([card]))).objects).toEqual([card]);
  });
});

// A JPEG skeleton: SOI, optionally a JFIF APP0, a stand-in DQT, EOI.
function fakeJpeg(withJfif: boolean) {
  const jfif = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const dqt = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x00];
  return new Uint8Array([0xff, 0xd8, ...(withJfif ? jfif : []), ...dqt, 0xff, 0xd9]);
}

function jfifDensity(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([bytes[2], bytes[3]]).toEqual([0xff, 0xe0]);
  expect(String.fromCharCode(...bytes.subarray(6, 11))).toBe('JFIF\0');
  return { units: bytes[13], x: view.getUint16(14), y: view.getUint16(16) };
}

describe('JPEG density', () => {
  it('rewrites an existing JFIF header to 300 dots per inch', () => {
    const out = setJpegDpi(fakeJpeg(true), 300);
    expect(jfifDensity(out)).toEqual({ units: 1, x: 300, y: 300 });
    expect(out.length).toBe(fakeJpeg(true).length);
  });

  it('adds a JFIF header when the encoder left one out, keeping the rest intact', () => {
    const input = fakeJpeg(false);
    const out = setJpegDpi(input, 300);
    expect(jfifDensity(out)).toEqual({ units: 1, x: 300, y: 300 });
    expect(Array.from(out.subarray(out.length - 8))).toEqual(Array.from(input.subarray(2)));
  });
});

describe('JPEG-in-PDF', () => {
  const jpeg = fakeJpeg(true);
  const pdf = jpegToPdf(jpeg, { pixelWidth: 2175, pixelHeight: 1575, widthIn: 7.25, heightIn: 5.25 });
  const text = new TextDecoder('latin1').decode(pdf);

  it('is a single page at the exact physical size, in points', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(text).toContain('/MediaBox [0 0 522 378]');
    // The image is drawn to fill the whole page.
    expect(text).toContain('522 0 0 378 0 0 cm');
  });

  it('embeds the JPEG untouched, at its pixel size', () => {
    expect(text).toContain('/Width 2175');
    expect(text).toContain('/Height 1575');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toContain(`/Length ${jpeg.length}`);
    const start = text.indexOf('stream\n') + 'stream\n'.length;
    expect(Array.from(pdf.subarray(start, start + jpeg.length))).toEqual(Array.from(jpeg));
  });

  it('has a cross-reference table whose offsets land on each object', () => {
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThanOrEqual(4);
    entries.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('keeps fractional sizes exact', () => {
    const a6 = new TextDecoder('latin1').decode(
      jpegToPdf(jpeg, { pixelWidth: 1748, pixelHeight: 1240, widthIn: 148 / 25.4, heightIn: 105 / 25.4 })
    );
    expect(a6).toContain('/MediaBox [0 0 419.5276 297.6378]');
  });
});
