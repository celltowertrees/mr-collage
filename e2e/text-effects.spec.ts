import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

// Places a text object via the Text tool, types content, and commits it,
// leaving the new object selected with the Select tool active.
async function placeText(page: Page, content: string) {
  await page.getByTitle('Text (T)').click();
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);

  const overlay = page.locator('textarea.text-edit-overlay');
  await expect(overlay).toBeVisible();
  await overlay.fill(content);
  await overlay.press('Enter');
  await expect(overlay).not.toBeVisible();

  await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe(content);
  return center;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Add Text to the Canvas" effect-parity extension: text
// objects support the same gradient-fade/shadow/blend-mode/flip effects as
// images. Shape masks and vignettes are deliberately NOT part of this parity
// (there's no real case for clipping or vignetting a text object the way
// there is for a photo) — they stay image-only, same as crop.
test.describe('Text objects support the same effects as images', () => {
  test('the Circle/Rectangle/Polygon Mask tools and Vignette control are not offered for a selected text object', async ({
    page,
  }) => {
    await placeText(page, 'No Mask or Vignette');

    await expect(page.getByTitle('Circle Mask')).not.toBeVisible();
    await expect(page.getByTitle('Rectangle Mask')).not.toBeVisible();
    await expect(page.getByTitle('Freeform Mask (click points, double-click to finish)')).not.toBeVisible();
    await expect(page.getByTitle('Enable Vignette')).not.toBeVisible();

    // Gradient Fade stays available — only shape mask/vignette are excluded.
    await expect(page.getByTitle('Gradient Fade')).toBeVisible();
  });

  test('enabling drop shadow on text updates persisted state', async ({ page }) => {
    await placeText(page, 'Shadow Me');

    await page.getByTitle('Enable Drop Shadow').click();
    await expect.poll(async () => (await readState(page)).images.at(-1)?.shadow?.enabled).toBe(true);

    const shadowSection = page.locator('.toolbar-section', { has: page.getByTitle('Disable Drop Shadow') });
    await shadowSection.getByLabel('Blur').fill('30');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.shadow?.blur).toBe(30);
  });

  test('applying a blend mode to text updates persisted state', async ({ page }) => {
    await placeText(page, 'Blend Me');

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Multiply' }).click();

    await expect.poll(async () => (await readState(page)).images.at(-1)?.blendMode).toBe('multiply');
  });

  test('dragging a gradient fade line on text persists a gradient mask', async ({ page }) => {
    const center = await placeText(page, 'Fade Me');
    await page.getByTitle('Gradient Fade').click();

    await page.mouse.move(center.x - 30, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 30, center.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    await expect.poll(async () => (await readState(page)).images.at(-1)?.gradientMask).toBeTruthy();
  });

  test('flipping text horizontally and vertically updates persisted state', async ({ page }) => {
    await placeText(page, 'Flip Me');

    await page.getByTitle('Flip Horizontal').click();
    await page.getByTitle('Flip Vertical').click();

    // Both are polled: saves are queued through an async IndexedDB round-trip,
    // so the two clicks' writes land in localStorage independently — polling
    // only the first and then reading the second synchronously races the
    // still-in-flight second save.
    await expect.poll(async () => (await readState(page)).images.at(-1)?.flipX).toBe(true);
    await expect.poll(async () => (await readState(page)).images.at(-1)?.flipY).toBe(true);
  });

  test('the Crop tool is not offered for a selected text object', async ({ page }) => {
    await placeText(page, 'No Crop');
    await expect(page.getByTitle('Crop')).not.toBeVisible();
  });

  test('exporting to ICP JSON includes all of the applied text effects', async ({ page }) => {
    await placeText(page, 'Export Effects');
    await page.getByTitle('Enable Drop Shadow').click();
    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Screen' }).click();
    await page.getByTitle('Flip Horizontal').click();
    await expect.poll(async () => (await readState(page)).images.at(-1)?.flipX).toBe(true);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const node = exported['infinite-canvas'].nodes.at(-1);

    expect(node.type).toBe('text');
    expect(node.data.shadow).toMatchObject({ enabled: true });
    expect(node.data.blendMode).toBe('screen');
    expect(node.data.flipX).toBe(true);
  });
});
