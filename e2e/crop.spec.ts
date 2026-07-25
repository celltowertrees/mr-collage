import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // addImage() auto-selects the new image, which is what makes the
  // per-image toolbar (Bring to Front, Crop tool, etc.) appear.
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // The Konva <Image> itself loads asynchronously (a separate `onload`
  // after the state update above), so an interaction started immediately
  // can miss it and hit the empty stage underneath instead.
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

async function firstImage(page: Page) {
  return (await readState(page)).images[0];
}

// Fixture is a 300x300 square, uploaded centered at the canvas center. Drags
// a crop rectangle between two screen points relative to that center.
async function dragCropBox(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  // Give React a chance to commit the mousemove's state update before
  // mouseup fires, matching the pattern used for mask drawing.
  await page.waitForTimeout(50);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Crop an Image"
test.describe('Crop an Image', () => {
  test('drawing a crop rectangle and applying it shrinks the image to that region', async ({ page }) => {
    await uploadFixtureImage(page);
    const before = await firstImage(page);
    expect(before.width).toBe(300);
    expect(before.height).toBe(300);

    await page.getByTitle('Crop').click();
    const center = await getCanvasCenter(page);
    await dragCropBox(page, { x: center.x - 100, y: center.y - 100 }, { x: center.x, y: center.y });

    await page.getByTitle('Apply Crop').click();

    await expect.poll(async () => (await firstImage(page)).width).toBeLessThan(300);
    const after = await firstImage(page);
    expect(Math.abs(after.width - 100)).toBeLessThanOrEqual(5);
    expect(Math.abs(after.height - 100)).toBeLessThanOrEqual(5);
    expect(after.crop).toBeTruthy();
    expect(Math.abs(after.crop.width - after.width)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(after.crop.height - after.height)).toBeLessThanOrEqual(0.01);
  });

  test('cancelling a crop leaves the image unchanged and returns to Select', async ({ page }) => {
    await uploadFixtureImage(page);
    const before = await firstImage(page);

    await page.getByTitle('Crop').click();
    const center = await getCanvasCenter(page);
    await dragCropBox(page, { x: center.x - 100, y: center.y - 100 }, { x: center.x, y: center.y });

    await page.getByTitle('Cancel Crop').click();

    const after = await firstImage(page);
    expect(after).toEqual(before);
    await expect(page.getByTitle('Crop')).not.toHaveClass(/active/);
  });

  test('the cropped region stays anchored at the same canvas position', async ({ page }) => {
    await uploadFixtureImage(page);
    const before = await firstImage(page);

    await page.getByTitle('Crop').click();
    const center = await getCanvasCenter(page);
    // Off-center box: right half of the 300x300 image only.
    await dragCropBox(page, { x: center.x, y: center.y - 150 }, { x: center.x + 150, y: center.y + 150 });
    await page.getByTitle('Apply Crop').click();

    await expect.poll(async () => (await firstImage(page)).width).toBeLessThan(300);
    const after = await firstImage(page);
    // Cropping off the left half shifts the remaining content's center right.
    expect(after.x).toBeGreaterThan(before.x + 50);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(5);
  });

  test('exporting to ICP JSON includes the crop rectangle', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Crop').click();
    const center = await getCanvasCenter(page);
    await dragCropBox(page, { x: center.x - 100, y: center.y - 100 }, { x: center.x, y: center.y });
    await page.getByTitle('Apply Crop').click();
    await expect.poll(async () => (await firstImage(page)).crop).toBeTruthy();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(exported['infinite-canvas'].nodes[0].data.crop).toBeTruthy();
  });
});
