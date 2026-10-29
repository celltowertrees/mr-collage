import { test, expect, type Page, type Download } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');
// orange-square.png is 300x300; PNGs export at 2x the object's canvas size.
const EXPORT_SIZE = 600;

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function imagePositions(page: Page): Promise<{ x: number; y: number }[]> {
  const state = await readState(page);
  return (state.images ?? []).map((img: { x: number; y: number }) => ({ x: img.x, y: img.y }));
}

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // See multi-select.spec.ts: the Konva <Image> decodes a frame or two later.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
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

// Same layout as multi-select.spec.ts: A at center, B 400px right, C 400px left.
async function setupThreeSeparatedImages(page: Page, center: { x: number; y: number }) {
  await uploadFixtureImage(page);
  await uploadFixtureImage(page);
  await drag(page, center, { x: center.x + 400, y: center.y });
  await uploadFixtureImage(page);
  await drag(page, center, { x: center.x - 400, y: center.y });
  await expect.poll(async () => {
    const positions = await imagePositions(page);
    return positions.length === 3 && positions[1].x > center.x + 300 && positions[2].x < center.x - 300;
  }).toBe(true);
}

// Clicks Export PNGs and collects `count` downloads.
async function exportPNGs(page: Page, count: number): Promise<Download[]> {
  const downloads: Download[] = [];
  const done = new Promise<void>((resolve) => {
    page.on('download', (d) => {
      downloads.push(d);
      if (downloads.length === count) resolve();
    });
  });
  await page.getByTitle('Export Selected as PNG').click();
  await done;
  return downloads;
}

interface DecodedPNG {
  width: number;
  height: number;
  pixels: Uint8Array; // flat RGBA
}

// Decodes a downloaded PNG in the page, where a canvas is at hand. The pixels
// come back as one base64 string rather than a JSON array of numbers: a
// 600x600 export is 1.44M channel values, and serializing that as an array
// took seconds per PNG — enough, over three exports, to push a test past its
// timeout on a slow run.
async function decodePNG(page: Page, download: Download): Promise<DecodedPNG> {
  const filePath = await download.path();
  if (!filePath) throw new Error('download did not save to disk');
  const base64 = fs.readFileSync(filePath).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000) {
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    }
    return { width: img.width, height: img.height, pixels: btoa(binary) };
  }, base64).then(({ width, height, pixels }) => ({
    width,
    height,
    pixels: new Uint8Array(Buffer.from(pixels, 'base64')),
  }));
}

function pixelAt(png: DecodedPNG, x: number, y: number) {
  const i = (y * png.width + x) * 4;
  const [r, g, b, a] = png.pixels.slice(i, i + 4);
  return { r, g, b, a };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Export Selected Objects as PNGs"
test.describe('Export Selected Objects as PNGs', () => {
  test('each selected object downloads as its own PNG, and unselected ones are skipped', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await setupThreeSeparatedImages(page, center);

    // Marquee covers A and B only, not C.
    await drag(page, { x: center.x - 100, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });

    const downloads = await exportPNGs(page, 2);
    const names = downloads.map((d) => d.suggestedFilename());
    expect(names.every((n) => n.endsWith('.png'))).toBe(true);
    expect(new Set(names).size).toBe(2);

    // Give a third download a moment to show up, if one was (wrongly) coming.
    await page.waitForTimeout(500);
    expect(downloads).toHaveLength(2);
  });

  test("each PNG is cropped to just its object, with no selection handles drawn in", async ({ page }) => {
    const center = await getCanvasCenter(page);
    await setupThreeSeparatedImages(page, center);
    await drag(page, { x: center.x - 600, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });

    const downloads = await exportPNGs(page, 3);
    for (const download of downloads) {
      const png = await decodePNG(page, download);
      expect(png.width).toBe(EXPORT_SIZE);
      expect(png.height).toBe(EXPORT_SIZE);
      // Corners are where the Transformer's resize handles sit on screen; in
      // the export they must be the image's own orange, not a handle.
      for (const [x, y] of [[1, 1], [EXPORT_SIZE - 2, 1], [1, EXPORT_SIZE - 2], [EXPORT_SIZE - 2, EXPORT_SIZE - 2]]) {
        const p = pixelAt(png, x, y);
        expect(p.a).toBe(255);
        expect(p.r).toBeGreaterThan(200);
        expect(p.b).toBeLessThan(80);
      }
    }
  });

  test("a masked object's PNG is transparent outside the mask and keeps its drop shadow", async ({ page }) => {
    const center = await getCanvasCenter(page);
    await uploadFixtureImage(page);

    await page.getByTitle('Circle Mask').click();
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y, { steps: 5 });
    await page.waitForTimeout(50); // see masking.spec.ts
    await page.mouse.up();
    await expect.poll(async () => (await readState(page)).images[0].mask?.type).toBe('circle');
    await page.getByTitle('Select (V)').click();
    await page.getByTitle('Enable Drop Shadow').click();
    await expect.poll(async () => (await readState(page)).images[0].shadow?.enabled).toBe(true);

    const [download] = await exportPNGs(page, 1);
    const png = await decodePNG(page, download);

    expect(pixelAt(png, 1, 1).a).toBe(0);
    const center2x = pixelAt(png, Math.floor(png.width / 2), Math.floor(png.height / 2));
    expect(center2x.a).toBe(255);

    // The masked shadow is drawn by a sibling node, so it only shows up if
    // the export captured it too: look for dark, partly opaque pixels.
    let shadowPixels = 0;
    for (let i = 0; i < png.pixels.length; i += 4) {
      if (png.pixels[i + 3] > 20 && png.pixels[i] < 60) shadowPixels++;
    }
    expect(shadowPixels).toBeGreaterThan(100);
  });

  test('the PNG export is not offered with nothing selected', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await uploadFixtureImage(page);
    await expect(page.getByTitle('Export Selected as PNG')).toBeVisible();

    // Clicking empty canvas clears the selection.
    await page.mouse.click(center.x + 500, center.y + 250);
    await expect(page.getByTitle('Export Selected as PNG')).toHaveCount(0);
  });
});
