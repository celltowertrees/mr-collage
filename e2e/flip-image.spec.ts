import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 200x200 fixture split into four solid-color quadrants (red/green/blue/yellow),
// so a flip is provable by checking which color ends up on which side.
const FIXTURE = path.join(__dirname, 'fixtures', 'quadrant-square.png');
const RED = { r: 230, g: 25, b: 25 };
const GREEN = { r: 25, g: 200, b: 60 };
const BLUE = { r: 25, g: 90, b: 230 };
const YELLOW = { r: 235, g: 210, b: 25 };

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
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

function expectCloseTo(actual: { r: number; g: number; b: number }, expected: { r: number; g: number; b: number }) {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(5);
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(5);
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(5);
}

// Quadrant offsets from canvas/image center, kept well inside each quadrant's
// half (fixture is 200x200, so each quadrant spans 0..100 from center).
const TOP_LEFT = { dx: -60, dy: -60 };
const TOP_RIGHT = { dx: 60, dy: -60 };
const BOTTOM_LEFT = { dx: -60, dy: 60 };
const BOTTOM_RIGHT = { dx: 60, dy: 60 };

async function sampleQuadrants(page: Page, center: { x: number; y: number }) {
  const [tl, tr, bl, br] = await Promise.all([
    samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy),
    samplePixel(page, center.x + TOP_RIGHT.dx, center.y + TOP_RIGHT.dy),
    samplePixel(page, center.x + BOTTOM_LEFT.dx, center.y + BOTTOM_LEFT.dy),
    samplePixel(page, center.x + BOTTOM_RIGHT.dx, center.y + BOTTOM_RIGHT.dy),
  ]);
  return { tl, tr, bl, br };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Mirror an Image (Flip Horizontal / Vertical)"
test.describe('Mirror an Image', () => {
  test('Flip Horizontal mirrors the image left-to-right about its own center', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    const before = await sampleQuadrants(page, center);
    expectCloseTo(before.tl, RED);
    expectCloseTo(before.tr, GREEN);
    expectCloseTo(before.bl, BLUE);
    expectCloseTo(before.br, YELLOW);

    await page.getByTitle('Flip Horizontal').click();
    await expect.poll(async () => (await readState(page)).images[0].flipX).toBe(true);

    const after = await sampleQuadrants(page, center);
    expectCloseTo(after.tl, GREEN);
    expectCloseTo(after.tr, RED);
    expectCloseTo(after.bl, YELLOW);
    expectCloseTo(after.br, BLUE);

    // Position and size are unaffected by the flip.
    const state = await readState(page);
    expect(state.images[0].width).toBe(200);
    expect(state.images[0].height).toBe(200);
  });

  test('Flip Vertical mirrors the image top-to-bottom about its own center', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    await page.getByTitle('Flip Vertical').click();
    await expect.poll(async () => (await readState(page)).images[0].flipY).toBe(true);

    const after = await sampleQuadrants(page, center);
    expectCloseTo(after.tl, BLUE);
    expectCloseTo(after.tr, YELLOW);
    expectCloseTo(after.bl, RED);
    expectCloseTo(after.br, GREEN);
  });

  test('flipping twice restores the original orientation', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    await page.getByTitle('Flip Horizontal').click();
    await expect.poll(async () => (await readState(page)).images[0].flipX).toBe(true);

    await page.getByTitle('Flip Horizontal').click();
    await expect.poll(async () => (await readState(page)).images[0].flipX).toBe(false);

    const after = await sampleQuadrants(page, center);
    expectCloseTo(after.tl, RED);
    expectCloseTo(after.tr, GREEN);
    expectCloseTo(after.bl, BLUE);
    expectCloseTo(after.br, YELLOW);
  });

  test('exporting to ICP JSON includes the flip state', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Flip Horizontal').click();
    await page.getByTitle('Flip Vertical').click();
    await expect.poll(async () => (await readState(page)).images[0].flipY).toBe(true);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(exported['infinite-canvas'].nodes[0].data.flipX).toBe(true);
    expect(exported['infinite-canvas'].nodes[0].data.flipY).toBe(true);
  });
});
