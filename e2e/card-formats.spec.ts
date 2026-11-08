import { test, expect, type Page, type Download, type Locator } from '@playwright/test';
import fs from 'fs';
import { PNG } from 'pngjs';

interface CardState {
  kind: string;
  sizeId: string;
  width: number;
  height: number;
  includeBleed: boolean;
  exportFormat?: string;
}

async function cards(page: Page): Promise<CardState[]> {
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
  return (state.images ?? []).filter((obj: CardState) => obj.kind === 'card');
}

async function addCard(page: Page, name: RegExp) {
  const before = (await cards(page)).length;
  await page.getByTitle('Add Card').click();
  await page.getByRole('menuitem', { name }).click();
  await expect.poll(async () => (await cards(page)).length).toBe(before + 1);
}

async function setFormat(page: Page, format: 'PNG' | 'JPEG' | 'PDF') {
  await page.getByLabel('Card Format').selectOption({ label: format });
  await expect.poll(async () => (await cards(page)).at(-1)?.exportFormat ?? 'png').toBe(format.toLowerCase());
}

async function collectDownloads(page: Page, trigger: Locator, count: number): Promise<Download[]> {
  const downloads: Download[] = [];
  const done = new Promise<void>((resolve) => {
    page.on('download', (d) => {
      downloads.push(d);
      if (downloads.length === count) resolve();
    });
  });
  await trigger.click();
  await done;
  return downloads;
}

async function bytesOf(download: Download) {
  const filePath = await download.path();
  if (!filePath) throw new Error('download did not save to disk');
  return fs.readFileSync(filePath);
}

// Pixel size from the JPEG's start-of-frame segment.
function jpegSize(bytes: Buffer) {
  let pos = 2;
  while (pos < bytes.length) {
    const marker = bytes[pos + 1];
    const length = bytes.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: bytes.readUInt16BE(pos + 7), height: bytes.readUInt16BE(pos + 5) };
    }
    pos += 2 + length;
  }
  throw new Error('no SOF segment');
}

function mediaBox(pdf: Buffer) {
  const match = pdf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  if (!match) throw new Error('no MediaBox');
  return [Number(match[1]), Number(match[2])];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "More Card Sizes and Print Formats"
test.describe('More Card Sizes and Print Formats', () => {
  test('the Add Card menu offers every size', async ({ page }) => {
    await page.getByTitle('Add Card').click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText([
      'Postcard (4×6 in)',
      'Max Postcard (4.25×6 in)',
      'Greeting Card (5×7 in)',
      'A6 (105×148 mm)',
      'Square (5×5 in)',
    ]);
  });

  test('a 5x7 greeting card exports at 2175x1575 with bleed', async ({ page }) => {
    await addCard(page, /Greeting Card/);
    const [card] = await cards(page);
    expect([card.width, card.height]).toEqual([700, 500]);

    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(download.suggestedFilename()).toBe('card-1-5x7in.png');
    const png = PNG.sync.read(await bytesOf(download));
    expect([png.width, png.height]).toEqual([2175, 1575]);
  });

  test('a 4.25x6 max postcard has a non-integer size in its filename and exports at 1875x1350', async ({ page }) => {
    await addCard(page, /Max Postcard/);
    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(download.suggestedFilename()).toBe('card-1-4.25x6in.png');
    const png = PNG.sync.read(await bytesOf(download));
    expect([png.width, png.height]).toEqual([1875, 1350]);
  });

  test('JPEG export is 300dpi, the card pixel size, on white', async ({ page }) => {
    await addCard(page, /Greeting Card/);
    await setFormat(page, 'JPEG');

    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(download.suggestedFilename()).toBe('card-1-5x7in.jpg');
    const bytes = await bytesOf(download);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect(jpegSize(bytes)).toEqual({ width: 2175, height: 1575 });
    // JFIF APP0: density unit 1 (dots per inch), 300 on both axes.
    expect(bytes.subarray(6, 11).toString('latin1')).toBe('JFIF\0');
    expect(bytes[13]).toBe(1);
    expect(bytes.readUInt16BE(14)).toBe(300);
    expect(bytes.readUInt16BE(16)).toBe(300);

    // An empty card is plain paper, not black: decode it and sample a corner.
    const corner = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return Array.from(ctx.getImageData(5, 5, 1, 1).data);
    }, bytes.toString('base64'));
    expect(corner.slice(0, 3).every((c) => c > 245)).toBe(true);
  });

  test('PDF export is one page at the exact physical size, bleed included when on', async ({ page }) => {
    await addCard(page, /Greeting Card/);
    await setFormat(page, 'PDF');

    const [withBleed] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(withBleed.suggestedFilename()).toBe('card-1-5x7in.pdf');
    const pdf = await bytesOf(withBleed);
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    // 7.25 x 5.25 in at 72pt to the inch.
    expect(mediaBox(pdf)).toEqual([522, 378]);
    expect(pdf.toString('latin1')).toContain('/Width 2175');

    await page.getByLabel('Include Bleed').uncheck();
    await expect.poll(async () => (await cards(page))[0].includeBleed).toBe(false);
    const [trimmed] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(mediaBox(await bytesOf(trimmed))).toEqual([504, 360]);

    await page.getByTitle('Portrait').click();
    await expect.poll(async () => (await cards(page))[0].height).toBe(700);
    const [portrait] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(mediaBox(await bytesOf(portrait))).toEqual([360, 504]);
  });

  test('an A6 PDF is 105x148 mm', async ({ page }) => {
    await addCard(page, /A6/);
    await page.getByLabel('Include Bleed').uncheck();
    await setFormat(page, 'PDF');
    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(download.suggestedFilename()).toBe('card-1-105x148mm.pdf');
    const [w, h] = mediaBox(await bytesOf(download));
    expect(w).toBeCloseTo((148 / 25.4) * 72, 3);
    expect(h).toBeCloseTo((105 / 25.4) * 72, 3);
  });

  test('Export All Cards uses each card’s own format, and the choice survives a reload', async ({ page }) => {
    await addCard(page, /Greeting Card/);
    await setFormat(page, 'PDF');
    await addCard(page, /Square/);

    await page.reload();
    expect((await cards(page)).map((c) => c.exportFormat ?? 'png')).toEqual(['pdf', 'png']);

    const downloads = await collectDownloads(page, page.getByTitle('Export All Cards'), 2);
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual(['card-1-5x7in.pdf', 'card-2-5x5in.png']);
  });
});
