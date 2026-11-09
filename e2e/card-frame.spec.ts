import { test, expect, type Page, type Download, type Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 300x300, solid orange.
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

// A 4x6 postcard is 600x400 canvas units (100 per inch) and exports at 3x.
const TRIM = { width: 1800, height: 1200 };
const BLEED = { width: 1875, height: 1275 };
const BLEED_PX = 37.5;

interface CardState {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  includeBleed: boolean;
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function cards(page: Page): Promise<CardState[]> {
  return ((await readState(page)).images ?? []).filter((obj: CardState) => obj.kind === 'card');
}

async function imagePositions(page: Page): Promise<{ x: number; y: number }[]> {
  return ((await readState(page)).images ?? [])
    .filter((obj: { kind: string }) => obj.kind === 'image')
    .map((img: { x: number; y: number }) => ({ x: img.x, y: img.y }));
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function addPostcard(page: Page) {
  const before = (await cards(page)).length;
  await page.getByTitle('Add Card').click();
  await page.getByRole('menuitem', { name: /^Postcard/ }).click();
  await expect.poll(async () => (await cards(page)).length).toBe(before + 1);
}

async function uploadFixtureImage(page: Page) {
  const before = (await imagePositions(page)).length;
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect.poll(async () => (await imagePositions(page)).length).toBe(before + 1);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // See multi-select.spec.ts: the Konva <Image> decodes a frame or two later.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

// Clicks `trigger` and collects `count` downloads.
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

async function readPNG(download: Download) {
  const filePath = await download.path();
  if (!filePath) throw new Error('download did not save to disk');
  const bytes = fs.readFileSync(filePath);
  return { bytes, png: PNG.sync.read(bytes) };
}

function pixelAt(png: PNG, x: number, y: number) {
  const i = (Math.round(y) * png.width + Math.round(x)) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
}

function isOrange(p: { r: number; g: number; b: number }) {
  return p.r > 200 && p.b < 80 && p.g < 200;
}

function isWhite(p: { r: number; g: number; b: number; a: number }) {
  return p.r > 245 && p.g > 245 && p.b > 245 && p.a === 255;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Printable Card Frames"
test.describe('Printable Card Frames', () => {
  test('adding a postcard places a selected 4x6 frame at the viewport center', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);

    const [card] = await cards(page);
    expect(card.width).toBe(600);
    expect(card.height).toBe(400);
    expect(card.includeBleed).toBe(true);
    expect(Math.abs(card.x - center.x)).toBeLessThan(2);
    expect(Math.abs(card.y - center.y)).toBeLessThan(2);
    await expect(page.getByTitle('Export Card')).toBeVisible();
  });

  test('the card PNG is 300dpi at 1875x1275 with bleed and 1800x1200 without, at any zoom', async ({ page }) => {
    await addPostcard(page);

    const [withBleed] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(withBleed.suggestedFilename()).toBe('card-1-4x6in.png');
    const tagged = await readPNG(withBleed);
    expect([tagged.png.width, tagged.png.height]).toEqual([BLEED.width, BLEED.height]);
    // pHYs: 11811 pixels per metre on both axes, unit = metre.
    const physAt = tagged.bytes.indexOf('pHYs');
    expect(physAt).toBeGreaterThan(0);
    expect(tagged.bytes.readUInt32BE(physAt + 4)).toBe(11811);
    expect(tagged.bytes.readUInt32BE(physAt + 8)).toBe(11811);
    expect(tagged.bytes[physAt + 12]).toBe(1);

    await page.getByLabel('Include Bleed').uncheck();
    await expect.poll(async () => (await cards(page))[0].includeBleed).toBe(false);
    const [trimmed] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    const { png } = await readPNG(trimmed);
    expect([png.width, png.height]).toEqual([TRIM.width, TRIM.height]);

    // Zoomed out, the export is still the card's physical size.
    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x, center.y);
    // Ctrl+scroll zooms; a plain scroll pans.
    await page.keyboard.down('Control');
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await readState(page)).stageScale).toBeLessThan(0.9);
    const [zoomed] = await collectDownloads(page, page.getByTitle('Export All Cards'), 1);
    const zoomedPNG = (await readPNG(zoomed)).png;
    expect([zoomedPNG.width, zoomedPNG.height]).toEqual([TRIM.width, TRIM.height]);
  });

  test('only what is inside the frame is exported, clipped at the edge, with no guides or handles', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);
    await page.getByLabel('Include Bleed').uncheck();

    // One image straddles the right edge, one sits wholly off the left.
    await uploadFixtureImage(page);
    await drag(page, center, { x: center.x + 300, y: center.y });
    await uploadFixtureImage(page);
    await drag(page, center, { x: center.x - 600, y: center.y });
    await expect.poll(async () => {
      const positions = await imagePositions(page);
      return positions.length === 2 && positions[0].x > center.x + 250 && positions[1].x < center.x - 550;
    }).toBe(true);

    const [download] = await collectDownloads(page, page.getByTitle('Export All Cards'), 1);
    const { png } = await readPNG(download);
    expect([png.width, png.height]).toEqual([TRIM.width, TRIM.height]);

    // The straddling image covers trim x 450-600 (units) → 1350-1800 px.
    expect(isOrange(pixelAt(png, 1500, 600))).toBe(true);
    expect(isOrange(pixelAt(png, TRIM.width - 2, 600))).toBe(true);
    expect(isWhite(pixelAt(png, 1300, 600))).toBe(true);

    // Nothing from the off-card image, and no frame lines, label or handles:
    // the whole left half is plain paper.
    for (let y = 0; y < png.height; y += 7) {
      for (let x = 0; x < 900; x += 7) {
        expect(isWhite(pixelAt(png, x, y))).toBe(true);
      }
    }
  });

  test('the bleed area holds paper, not the trim or safe-margin guides', async ({ page }) => {
    await addPostcard(page);
    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    const { png } = await readPNG(download);
    for (const [x, y] of [
      [1, 1],
      [BLEED_PX, 600],
      [BLEED_PX * 2, 600],
      [900, BLEED_PX],
      [BLEED.width - 2, BLEED.height - 2],
    ]) {
      expect(isWhite(pixelAt(png, x, y))).toBe(true);
    }
  });

  test('a blend mode composites against the white card paper', async ({ page }) => {
    await addPostcard(page);
    await page.getByLabel('Include Bleed').uncheck();
    await uploadFixtureImage(page);
    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Difference' }).click();
    await expect.poll(async () => (await readState(page)).images.find((o: { kind: string }) => o.kind === 'image').blendMode).toBe('difference');

    const [download] = await collectDownloads(page, page.getByTitle('Export All Cards'), 1);
    const { png } = await readPNG(download);
    // White minus orange: red drops out and blue comes up. Against nothing
    // (paper on another layer) the image would stay orange.
    const p = pixelAt(png, 900, 600);
    expect(p.r).toBeLessThan(60);
    expect(p.b).toBeGreaterThan(200);
  });

  test('dragging the frame moves the card but not the objects', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);
    await uploadFixtureImage(page);
    const imageBefore = (await imagePositions(page))[0];

    // The frame's top edge, clear of the 300px image in the middle.
    await drag(page, { x: center.x - 250, y: center.y - 200 }, { x: center.x - 150, y: center.y - 150 });
    await expect.poll(async () => (await cards(page))[0].x).toBeGreaterThan(center.x + 90);
    const [card] = await cards(page);
    expect(Math.abs(card.y - (center.y + 50))).toBeLessThan(3);
    expect(await imagePositions(page)).toEqual([imageBefore]);
  });

  test('portrait swaps the exported dimensions', async ({ page }) => {
    await addPostcard(page);
    await page.getByTitle('Portrait').click();
    await expect.poll(async () => (await cards(page))[0].height).toBe(600);
    const [download] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    const { png } = await readPNG(download);
    expect([png.width, png.height]).toEqual([BLEED.height, BLEED.width]);
  });

  test('two cards export as two files, each showing its own contents', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);
    await uploadFixtureImage(page);
    // A second card, moved off to the right so it overlaps the first.
    await addPostcard(page);
    await drag(page, { x: center.x - 250, y: center.y - 200 }, { x: center.x + 250, y: center.y - 200 });
    await expect.poll(async () => (await cards(page))[1].x).toBeGreaterThan(center.x + 450);

    const downloads = await collectDownloads(page, page.getByTitle('Export All Cards'), 2);
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual(['card-1-4x6in.png', 'card-2-4x6in.png']);

    const first = downloads.find((d) => d.suggestedFilename() === 'card-1-4x6in.png')!;
    const { png } = await readPNG(first);
    // The image sits at the first card's centre; the second card's paper,
    // which overlaps that spot, must not paint over it.
    expect(isOrange(pixelAt(png, BLEED.width / 2, BLEED.height / 2))).toBe(true);
  });

  test('a card survives a reload', async ({ page }) => {
    await addPostcard(page);
    await page.reload();
    await expect(page.getByTitle('Export All Cards')).toBeVisible();
    expect(await cards(page)).toHaveLength(1);
  });

  test('one undo removes a newly added card', async ({ page }) => {
    await addPostcard(page);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await cards(page)).length).toBe(0);
  });

  test('a marquee over art inside a card selects the art, not the card', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);
    await uploadFixtureImage(page);
    // Select the card by its edge first, so the marquee has to replace it.
    await page.mouse.click(center.x - 250, center.y - 200);
    await expect(page.getByTitle('Export Card')).toBeVisible();

    // Start in the card's empty corner and sweep over the image.
    await drag(page, { x: center.x - 280, y: center.y - 180 }, { x: center.x + 200, y: center.y + 180 });
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
    await expect(page.getByTitle('Export Card')).toHaveCount(0);
  });
});
