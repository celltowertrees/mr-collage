import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');
// Fixture is a 300x300 opaque orange square, displayed 1:1 (no scaling —
// addImage() only scales images larger than 400px), so it's a square image:
// the vignette's aspect-ratio-normalized ellipse is a true circle here, with
// 1.0 = 150px from center (the edge midpoint) and a corner at ~212px.
const ORANGE = { r: 230, g: 126, b: 34 };

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
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

async function enableVignette(page: Page) {
  await page.getByTitle('Enable Vignette').click();
  await expect.poll(async () => (await readState(page)).images[0].vignette?.enabled).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Circular Vignette on an Image"
test.describe('Circular Vignette on an Image', () => {
  test('enabling a vignette fades the image toward transparent at the edges and corners, leaving the center opaque', async ({
    page,
  }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);
    await enableVignette(page);

    const atCenter = await samplePixel(page, center.x, center.y);
    expect(atCenter).toMatchObject({ ...ORANGE, a: 255 });

    // Default inner radius (0.5 -> 75px) keeps a comfortable opaque core.
    const wellInsideInner = await samplePixel(page, center.x + 40, center.y);
    expect(wellInsideInner).toMatchObject({ ...ORANGE, a: 255 });

    // Between inner (75px) and outer (150px) radius: partially faded.
    const midFade = await samplePixel(page, center.x + 110, center.y);
    expect(midFade.a).toBeGreaterThan(0);
    expect(midFade.a).toBeLessThan(255);

    // Near the outer radius (150px, the edge midpoint): almost fully faded.
    const nearOuter = await samplePixel(page, center.x + 145, center.y);
    expect(nearOuter.a).toBeLessThan(30);

    // Near a corner (~198px from center): well past the outer radius, so
    // fully transparent — the classic vignette corner-fades-first look.
    const nearCorner = await samplePixel(page, center.x + 140, center.y + 140);
    expect(nearCorner.a).toBe(0);
  });

  test('adjusting inner and outer radius sliders updates persisted state', async ({ page }) => {
    await uploadFixtureImage(page);
    await enableVignette(page);

    await page.getByLabel('Inner Radius').fill('0.2');
    await page.getByLabel('Outer Radius').fill('0.6');

    await expect.poll(async () => (await readState(page)).images[0].vignette?.outerRadius).toBeCloseTo(0.6);
    const vignette = (await readState(page)).images[0].vignette;
    expect(vignette.innerRadius).toBeCloseTo(0.2);
    expect(vignette.outerRadius).toBeCloseTo(0.6);
  });

  test('a vignette combines with a shape mask instead of replacing it', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    await page.getByTitle('Circle Mask').click();
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await expect.poll(async () => (await readState(page)).images[0].mask?.type).toBe('circle');
    await page.getByTitle('Select (V)').click();

    await enableVignette(page);

    const state = (await readState(page)).images[0];
    expect(state.mask.type).toBe('circle');
    expect(state.vignette.enabled).toBe(true);

    // Center: unaffected by either effect.
    const atCenter = await samplePixel(page, center.x, center.y);
    expect(atCenter).toMatchObject({ ...ORANGE, a: 255 });

    // Just outside the 100px mask radius: hard-clipped by the shape mask
    // regardless of the vignette.
    const outsideShape = await samplePixel(page, center.x + 108, center.y);
    expect(outsideShape.a).toBe(0);

    // Inside the mask (100px) but past the vignette's default inner radius
    // (75px): still visible through the shape mask, but the vignette's own
    // fade is also still in effect there.
    const insideMaskFadingVignette = await samplePixel(page, center.x + 90, center.y);
    expect(insideMaskFadingVignette.a).toBeGreaterThan(0);
    expect(insideMaskFadingVignette.a).toBeLessThan(255);
  });

  test('disabling the vignette restores full opacity at the edges', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);
    await enableVignette(page);

    await page.getByTitle('Disable Vignette').click();
    await expect.poll(async () => (await readState(page)).images[0].vignette?.enabled).toBe(false);

    const nearOuter = await samplePixel(page, center.x + 145, center.y);
    expect(nearOuter).toMatchObject({ ...ORANGE, a: 255 });
  });

  test('exporting to ICP JSON includes the vignette settings', async ({ page }) => {
    await uploadFixtureImage(page);
    await enableVignette(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const vignette = exported['infinite-canvas'].nodes[0].data.vignette;

    expect(vignette).toMatchObject({ enabled: true });
    expect(typeof vignette.innerRadius).toBe('number');
    expect(typeof vignette.outerRadius).toBe('number');
  });
});
