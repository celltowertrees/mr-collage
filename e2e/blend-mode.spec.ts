import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');
const ORANGE = { r: 230, g: 126, b: 34 };
// CSS/canvas "multiply" blend of the orange fixture composited over an
// identical copy of itself: each channel becomes round(Cs * Cb / 255).
const ORANGE_MULTIPLIED = { r: 207, g: 62, b: 5 };

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // Konva's <Image> loads its HTMLImageElement asynchronously, separate from
  // the state update above — give it two frames to decode and redraw.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function samplePixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      return { r, g, b, a };
    },
    { x, y }
  );
}

function expectCloseTo(actual: number, expected: number, tolerance = 3) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "CSS Blend Mode on Selected Object"
test.describe('CSS Blend Mode on Selected Object', () => {
  test('the Blend Mode button opens a popup listing available modes', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect(page.getByRole('menu')).not.toBeVisible();

    await page.getByTitle('Blend Mode').click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Multiply' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Screen' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Normal' })).toBeVisible();
  });

  test('picking a blend mode composites the selected image against the layer beneath it', async ({ page }) => {
    await uploadFixtureImage(page); // bottom image, stays at center
    await uploadFixtureImage(page); // top image, also at center (auto-selected)
    const center = await getCanvasCenter(page);

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Multiply' }).click();

    await expect.poll(async () => (await readState(page)).images[1].blendMode).toBe('multiply');
    await expect(page.getByRole('menu')).not.toBeVisible();

    const pixel = await samplePixel(page, center.x, center.y);
    expectCloseTo(pixel.r, ORANGE_MULTIPLIED.r);
    expectCloseTo(pixel.g, ORANGE_MULTIPLIED.g);
    expectCloseTo(pixel.b, ORANGE_MULTIPLIED.b);
  });

  test('picking Normal clears the blend mode and restores plain compositing', async ({ page }) => {
    await uploadFixtureImage(page);
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Multiply' }).click();
    await expect.poll(async () => (await readState(page)).images[1].blendMode).toBe('multiply');

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Normal' }).click();

    await expect.poll(async () => (await readState(page)).images[1].blendMode).toBeUndefined();
    const pixel = await samplePixel(page, center.x, center.y);
    expect(pixel).toMatchObject({ ...ORANGE, a: 255 });
  });

  test('exporting to ICP JSON includes the blend mode', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Screen' }).click();
    await expect.poll(async () => (await readState(page)).images[0].blendMode).toBe('screen');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(exported['infinite-canvas'].nodes[0].data.blendMode).toBe('screen');
  });
});
