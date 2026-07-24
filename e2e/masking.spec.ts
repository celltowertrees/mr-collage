import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // addImage() auto-selects the new image, which is what makes the
  // per-image toolbar (Bring to Front, Mask tools, etc.) appear.
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

// The mask is completed by a state update inside a React event handler, but
// it's *persisted* to localStorage by a separate useEffect that only runs
// after that render commits — so reading localStorage immediately after the
// triggering mouse/click action is a race. Poll instead of reading once.
async function waitForMask(page: Page) {
  await expect.poll(async () => (await readState(page)).images[0]?.mask).toBeTruthy();
  return (await readState(page)).images[0].mask;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Image Masking (Circle / Rectangle / Freeform Polygon)"
test.describe('Image Masking', () => {
  test('drawing a circle mask clips the image to that shape', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Circle Mask').click();

    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y, { steps: 5 });
    // Give React a chance to commit the mousemove's state update (and
    // react-konva to re-bind the Stage's handlers with it) before mouseup
    // fires — otherwise handleMouseUp can read a stale currentPoint and
    // silently no-op instead of completing the mask.
    await page.waitForTimeout(50);
    await page.mouse.up();

    const mask = await waitForMask(page);
    expect(mask.type).toBe('circle');
    expect(mask.radius).toBeGreaterThan(5);
  });

  test('drawing a rectangle mask clips the image to that shape', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Rectangle Mask').click();

    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x - 80, center.y - 80);
    await page.mouse.down();
    await page.mouse.move(center.x + 80, center.y + 80, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    const mask = await waitForMask(page);
    expect(mask.type).toBe('rect');
    expect(mask.width).toBeGreaterThan(5);
    expect(mask.height).toBeGreaterThan(5);
  });

  test('drawing a freeform polygon mask clips the image to the traced outline', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Freeform Mask (click points, double-click to finish)').click();

    const center = await getCanvasCenter(page);
    const points: Array<[number, number]> = [
      [center.x, center.y - 80],
      [center.x + 80, center.y + 40],
      [center.x - 80, center.y + 40],
    ];
    for (const [x, y] of points) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(50);
    }
    await page.mouse.dblclick(points[0][0], points[0][1]);

    const mask = await waitForMask(page);
    expect(mask.type).toBe('polygon');
    expect(mask.points.length).toBeGreaterThanOrEqual(3);
  });

  test('clearing a mask removes it and restores the full image', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Circle Mask').click();

    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await waitForMask(page);

    await page.getByTitle('Clear Mask').click();

    await expect.poll(async () => (await readState(page)).images[0].mask).toBeUndefined();
  });
});
