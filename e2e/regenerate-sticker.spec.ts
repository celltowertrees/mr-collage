import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT = 'https://api.openai.com/v1/images/generations';

// The first generation answers with the 200x200 quadrant fixture (red top-left),
// every later one with the 300x300 solid orange square — so a regeneration is
// provable by the colour under the image's top-left quadrant.
const QUADRANT_B64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'quadrant-square.png')).toString('base64');
const ORANGE_B64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'orange-square.png')).toString('base64');
const UPLOAD_FIXTURE = path.join(__dirname, 'fixtures', 'quadrant-square.png');
const RED = { r: 230, g: 25, b: 25 };
const TOP_LEFT = { dx: -60, dy: -60 };

// Answers generation requests in turn, recording the prompt each one sent.
async function mockGenerations(page: Page) {
  const prompts: string[] = [];
  await page.route(ENDPOINT, (route) => {
    prompts.push(JSON.parse(route.request().postData() ?? '{}').prompt);
    const b64 = prompts.length === 1 ? QUADRANT_B64 : ORANGE_B64;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: b64 }] }) });
  });
  return prompts;
}

async function generateSticker(page: Page, prompt: string, style?: string) {
  await page.getByTitle('Generate Sticker (AI)').click();
  const dialog = page.getByRole('dialog', { name: 'Generate Sticker' });
  await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill(prompt);
  if (style) await dialog.getByLabel('Style').selectOption({ label: style });
  await dialog.locator('summary').click();
  await dialog.getByPlaceholder('sk-...').fill('sk-test-not-a-real-key');
  await dialog.getByRole('button', { name: /Generate/ }).click();
  await expect(dialog).toHaveCount(0);
  await settle(page);
}

function settle(page: Page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function samplePixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return { r, g, b };
    },
    { x, y }
  );
}

function isRed(c: { r: number; g: number; b: number }) {
  return Math.abs(c.r - RED.r) <= 5 && Math.abs(c.g - RED.g) <= 5 && Math.abs(c.b - RED.b) <= 5;
}

const regenerateButton = (page: Page) => page.getByRole('button', { name: 'Regenerate from prompt' });
const regenerateDialog = (page: Page) => page.getByRole('dialog', { name: 'Regenerate Sticker' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Regenerate a Sticker from Its Prompt"
test.describe('Regenerate a Sticker from Its Prompt', () => {
  test('a generated sticker remembers its prompt and style', async ({ page }) => {
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar', 'Real Photograph');
    await expect
      .poll(async () => (await readState(page)).images?.[0]?.generation)
      .toEqual({ prompt: 'cat smoking a cigar', style: 'Real Photograph' });
  });

  test('the regenerate button sits at the bottom-right of the selection', async ({ page }) => {
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    const center = await getCanvasCenter(page);
    const box = await regenerateButton(page).boundingBox();
    if (!box) throw new Error('regenerate button not visible');
    // The sticker is 200x200 around the canvas centre: its bottom-right corner
    // is at centre + 100. The button hangs just below that corner, right-aligned.
    expect(Math.abs(box.x + box.width - (center.x + 100))).toBeLessThanOrEqual(12);
    expect(box.y).toBeGreaterThanOrEqual(center.y + 100);
    expect(box.y).toBeLessThanOrEqual(center.y + 140);

    // Mid-drag, before the move is committed, it keeps up with the sticker.
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 60, center.y + 30, { steps: 5 });
    await settle(page);
    const moved = await regenerateButton(page).boundingBox();
    await page.mouse.up();
    if (!moved) throw new Error('regenerate button not visible mid-drag');
    expect(Math.abs(moved.x + moved.width - (center.x + 160))).toBeLessThanOrEqual(12);
    expect(Math.abs(moved.y - box.y - 30)).toBeLessThanOrEqual(4);
  });

  test('selecting and deselecting logs no React errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 300, center.y + 250);
    await settle(page);
    await expect(regenerateButton(page)).toHaveCount(0);
    await page.mouse.click(center.x, center.y);
    await settle(page);
    await expect(regenerateButton(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the button is not offered for uploaded images or multi-selections', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(UPLOAD_FIXTURE);
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
    await settle(page);
    await expect(regenerateButton(page)).toHaveCount(0);

    await page.getByTitle('Delete').click();
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    await expect(regenerateButton(page)).toBeVisible();

    // A second generated sticker (300x300, over the first), then a marquee
    // from empty canvas around both.
    await generateSticker(page, 'dog in a hat');
    const center = await getCanvasCenter(page);
    await page.mouse.move(center.x - 200, center.y - 200);
    await page.mouse.down();
    await page.mouse.move(center.x + 200, center.y + 200, { steps: 5 });
    await page.mouse.up();
    await settle(page);
    await expect.poll(() => page.getByTitle('Bring to Front').count()).toBe(0);
    await expect(regenerateButton(page)).toHaveCount(0);
  });

  test('the dialog opens with the saved prompt and style', async ({ page }) => {
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar', 'Line Drawing');
    await regenerateButton(page).click();
    const dialog = regenerateDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses')).toHaveValue('cat smoking a cigar');
    await expect(dialog.getByLabel('Style')).toHaveValue('Line Drawing');
  });

  test('resubmitting regenerates the image in place with the edited prompt', async ({ page }) => {
    const prompts = await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    const center = await getCanvasCenter(page);
    expect(isRed(await samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy))).toBe(true);
    const before = (await readState(page)).images[0];

    await regenerateButton(page).click();
    const dialog = regenerateDialog(page);
    await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill('cat smoking a pipe');
    await dialog.getByRole('button', { name: /Regenerate/ }).click();
    await expect(dialog).toHaveCount(0);
    await settle(page);

    expect(prompts).toHaveLength(2);
    expect(prompts[1].startsWith('cat smoking a pipe.')).toBe(true);
    // New picture, same place.
    expect(isRed(await samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy))).toBe(false);
    await expect.poll(async () => (await readState(page)).images).toHaveLength(1);
    const after = (await readState(page)).images[0];
    expect(after.generation).toEqual({ prompt: 'cat smoking a pipe', style: '' });
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.rotation).toBe(before.rotation);
    // Displayed width kept: 200px, now spread over a 300px source.
    expect(after.width * after.scaleX).toBeCloseTo(before.width * before.scaleX, 5);
    // Still selected, so the button stays on it.
    await expect(regenerateButton(page)).toBeVisible();
  });

  test('a regeneration survives a reload', async ({ page }) => {
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    await regenerateButton(page).click();
    const dialog = regenerateDialog(page);
    await dialog.getByRole('button', { name: /Regenerate/ }).click();
    await expect(dialog).toHaveCount(0);
    await settle(page);
    // Let the save land before reloading.
    await expect.poll(async () => (await readState(page)).images?.[0]?.generation?.prompt).toBe('cat smoking a cigar');
    await page.waitForTimeout(500);

    await page.reload();
    await expect.poll(async () => (await readState(page)).images).toHaveLength(1);
    await page.waitForTimeout(300);
    const center = await getCanvasCenter(page);
    await expect
      .poll(async () => isRed(await samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy)))
      .toBe(false);
    const pixel = await samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy);
    // Something was drawn there (not the blank canvas).
    expect(pixel.r + pixel.g + pixel.b).toBeGreaterThan(0);
  });

  test('one undo restores the original image and prompt', async ({ page }) => {
    await mockGenerations(page);
    await generateSticker(page, 'cat smoking a cigar');
    await regenerateButton(page).click();
    const dialog = regenerateDialog(page);
    await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill('cat smoking a pipe');
    await dialog.getByRole('button', { name: /Regenerate/ }).click();
    await expect(dialog).toHaveCount(0);
    await settle(page);

    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    const center = await getCanvasCenter(page);
    expect(isRed(await samplePixel(page, center.x + TOP_LEFT.dx, center.y + TOP_LEFT.dy))).toBe(true);
    await expect
      .poll(async () => (await readState(page)).images?.[0]?.generation?.prompt)
      .toBe('cat smoking a cigar');
  });
});
