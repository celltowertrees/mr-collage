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

// Places a text object via the Text tool, types content, and commits it
// (Enter), leaving the new object selected with the Select tool active.
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

// Maps to CLAUDE.md → "Add Text to the Canvas"
test.describe('Add Text to the Canvas', () => {
  test('placing text with the Text tool adds a text object at the click point and opens it for editing', async ({
    page,
  }) => {
    const center = await placeText(page, 'Hello Collage');

    const state = await readState(page);
    const obj = state.images.at(-1);
    expect(obj.kind).toBe('text');
    expect(obj.text).toBe('Hello Collage');
    expect(Math.abs(obj.x - center.x)).toBeLessThan(5);
    expect(Math.abs(obj.y - center.y)).toBeLessThan(5);
  });

  test('double-clicking an existing text object re-opens it for editing', async ({ page }) => {
    const center = await placeText(page, 'First');

    await page.mouse.dblclick(center.x, center.y);
    const overlay = page.locator('textarea.text-edit-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveValue('First');

    await overlay.fill('Second');
    await overlay.press('Enter');

    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('Second');
  });

  test('toggling Bold, Italic, and Underline updates persisted state', async ({ page }) => {
    await placeText(page, 'Style me');

    await page.getByTitle('Bold').click();
    await page.getByTitle('Italic').click();
    await page.getByTitle('Underline').click();

    await expect.poll(async () => (await readState(page)).images.at(-1)?.bold).toBe(true);
    const obj = (await readState(page)).images.at(-1);
    expect(obj.italic).toBe(true);
    expect(obj.underline).toBe(true);
  });

  test('changing color and size updates persisted state', async ({ page }) => {
    await placeText(page, 'Color me');

    const textSection = page.locator('.toolbar-section', { has: page.getByTitle('Bold') });
    await textSection.getByLabel('Color').fill('#ff00aa');
    await textSection.getByLabel('Size').fill('64');

    await expect.poll(async () => (await readState(page)).images.at(-1)?.fontSize).toBe(64);
    expect((await readState(page)).images.at(-1).color.toLowerCase()).toBe('#ff00aa');
  });

  test('picking a font family updates persisted state', async ({ page }) => {
    await placeText(page, 'Font me');

    const textSection = page.locator('.toolbar-section', { has: page.getByTitle('Bold') });
    await textSection.getByLabel('Font').selectOption({ label: 'Playfair Display' });

    await expect.poll(async () => (await readState(page)).images.at(-1)?.fontFamily).toBe('Playfair Display');
  });

  test('exporting to ICP JSON includes the text content and font/style settings', async ({ page }) => {
    await placeText(page, 'Export me');
    await page.getByTitle('Bold').click();
    await expect.poll(async () => (await readState(page)).images.at(-1)?.bold).toBe(true);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const node = exported['infinite-canvas'].nodes.at(-1);

    expect(node.type).toBe('text');
    expect(node.data).toMatchObject({ text: 'Export me', bold: true });
    expect(node.data.fontFamily).toBeTruthy();
  });
});
