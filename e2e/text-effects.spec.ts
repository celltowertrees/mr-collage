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
// objects support the same mask/gradient-fade/vignette/shadow/blend-mode/flip
// effects as images (crop is the one exception, since it's inherently about
// cropping a source image's own pixels).
test.describe('Text objects support the same effects as images', () => {
  test('drawing a circle mask on a selected text object persists a mask', async ({ page }) => {
    const center = await placeText(page, 'Mask Me');
    await page.getByTitle('Circle Mask').click();

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 40, center.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    await expect.poll(async () => (await readState(page)).images.at(-1)?.mask?.type).toBe('circle');

    await page.getByTitle('Select (V)').click();
    await expect(page.getByTitle('Clear Mask')).toBeVisible();
    await page.getByTitle('Clear Mask').click();
    await expect.poll(async () => (await readState(page)).images.at(-1)?.mask).toBeUndefined();
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

  test('enabling a vignette on text updates persisted state', async ({ page }) => {
    await placeText(page, 'Vignette Me');

    await page.getByTitle('Enable Vignette').click();
    await expect.poll(async () => (await readState(page)).images.at(-1)?.vignette?.enabled).toBe(true);

    await page.getByLabel('Inner Radius').fill('0.2');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.vignette?.innerRadius).toBeCloseTo(0.2);
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

    await expect.poll(async () => (await readState(page)).images.at(-1)?.flipX).toBe(true);
    expect((await readState(page)).images.at(-1).flipY).toBe(true);
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
