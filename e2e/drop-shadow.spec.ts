import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');
// Fixture is a 300x300 opaque orange square, displayed 1:1 (no scaling —
// addImage() only scales images larger than 400px). Its edges sit 150px
// from center in every direction.
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

async function drawCircleMask(page: Page, center: { x: number; y: number }, radius: number) {
  await page.getByTitle('Circle Mask').click();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + radius, center.y, { steps: 5 });
  // See masking.spec.ts for why this wait is needed before mouseup.
  await page.waitForTimeout(50);
  await page.mouse.up();
  await expect.poll(async () => (await readState(page)).images[0].mask?.type).toBe('circle');
  // Back to select so later actions (toolbar clicks) don't get swallowed by the mask drawer.
  await page.getByTitle('Select (V)').click();
}

async function enableShadow(page: Page) {
  await page.getByTitle('Enable Drop Shadow').click();
  await expect.poll(async () => (await readState(page)).images[0].shadow?.enabled).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Drop Shadow on Masked Objects"
test.describe('Drop Shadow on Masked Objects', () => {
  test('shadow on an unmasked image is cast directly from the image', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);
    await enableShadow(page);

    const inside = await samplePixel(page, center.x, center.y);
    expect(inside).toMatchObject({ ...ORANGE, a: 255 });

    // Default shadow: offsetX/Y = 6, blur = 12. The image edge sits 150px from
    // center, so just past that edge — in the direction the offset pushes the
    // shadow — should show shadow, not blank canvas.
    const justPastEdge = await samplePixel(page, center.x + 152, center.y + 152);
    expect(justPastEdge.a).toBeGreaterThan(0);
    expect(justPastEdge).not.toMatchObject(ORANGE);

    const farOutside = await samplePixel(page, center.x + 250, center.y + 250);
    expect(farOutside.a).toBe(0);
  });

  test('shadow on a masked image follows the mask outline, not the image bounds', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);
    await drawCircleMask(page, center, 100);
    await enableShadow(page);

    // Inside the mask: still the opaque fixture color.
    const inside = await samplePixel(page, center.x + 30, center.y);
    expect(inside).toMatchObject({ ...ORANGE, a: 255 });

    // Just outside the 100px mask radius: shadow should be visible here —
    // this is the behavior the shadow-caster technique exists for, since a
    // shadow applied to the clipped node directly would be cut off by the
    // mask's own clip region instead of showing around it.
    const justOutsideMask = await samplePixel(page, center.x + 108, center.y);
    expect(justOutsideMask.a).toBeGreaterThan(0);
    expect(justOutsideMask).not.toMatchObject(ORANGE);

    // Out near the original 150px image edge — well beyond the mask radius
    // plus blur/offset reach. If the shadow were still following the full
    // image bounding box (the bug this feature fixes), it would show up
    // here; since it follows the mask instead, this should be untouched.
    const nearOriginalImageEdge = await samplePixel(page, center.x + 140, center.y);
    expect(nearOriginalImageEdge.a).toBeLessThan(10);
  });

  test('adjusting shadow color, blur, offset, and opacity updates persisted state', async ({ page }) => {
    await uploadFixtureImage(page);
    await enableShadow(page);

    // "Opacity" also labels the image-opacity slider elsewhere in the toolbar,
    // so scope to the Shadow section (identified by its enable/disable button).
    const shadowSection = page.locator('.toolbar-section', {
      has: page.getByTitle('Disable Drop Shadow'),
    });

    await page.getByLabel('Blur').fill('40');
    await page.getByLabel('Offset X').fill('20');
    await page.getByLabel('Offset Y').fill('-15');
    await shadowSection.getByLabel('Opacity').fill('0.9');

    // The last fill's state update is committed by React and persisted to
    // localStorage by a separate useEffect (see the `saveQueue` comment in
    // useCollage.ts) — reading localStorage right away races that save.
    await expect.poll(async () => (await readState(page)).images[0].shadow?.opacity).toBeCloseTo(0.9);

    const shadow = (await readState(page)).images[0].shadow;
    expect(shadow.blur).toBe(40);
    expect(shadow.offsetX).toBe(20);
    expect(shadow.offsetY).toBe(-15);
    expect(shadow.opacity).toBeCloseTo(0.9);
  });

  test('exporting to ICP JSON includes the shadow settings', async ({ page }) => {
    await uploadFixtureImage(page);
    await enableShadow(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const shadow = exported['infinite-canvas'].nodes[0].data.shadow;

    expect(shadow).toMatchObject({ enabled: true, color: '#000000' });
  });
});
