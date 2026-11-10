import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VISION_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const FIXTURE = path.join(__dirname, 'fixtures', 'quadrant-square.png');
// Stands in for the generated background.
const ORANGE_B64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'orange-square.png')).toString('base64');
const VISION_PROMPT = 'A quiet harbour at dawn, fishing boats moored along a stone quay.';

const bgTool = (page: Page) => page.getByTitle(/^Generate Background/);

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function canvasCenter(page: Page) {
  const box = await page.locator('.konvajs-content').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // The Konva <Image> decodes a frame or two later.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function saveApiKey(page: Page) {
  await page.evaluate(() => localStorage.setItem('mr-collage-openai-key', 'sk-test-not-a-real-key'));
}

// Answers both OpenAI calls, recording what each was sent.
async function mockOpenAI(page: Page) {
  const sent = { visionCalls: 0, imageBodies: [] as Record<string, unknown>[] };
  await page.route(VISION_ENDPOINT, (route) => {
    sent.visionCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: VISION_PROMPT } }] }),
    });
  });
  await page.route(IMAGE_ENDPOINT, (route) => {
    sent.imageBodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ b64_json: ORANGE_B64 }] }),
    });
  });
  return sent;
}

// Drags a rectangle with the Generate Background tool, offsets from canvas centre.
async function drawBgRect(page: Page, from: { dx: number; dy: number }, to: { dx: number; dy: number }) {
  const c = await canvasCenter(page);
  await bgTool(page).click();
  await page.mouse.move(c.x + from.dx, c.y + from.dy);
  await page.mouse.down();
  await page.mouse.move(c.x + to.dx, c.y + to.dy, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Generate Background Tool Restored"
test.describe('Generate Background Tool Restored', () => {
  test('the toolbar offers Generate Background by default', async ({ page }) => {
    await expect(page.getByTitle('Upload Image')).toBeVisible();
    await expect(bgTool(page)).toBeVisible();
  });

  test('drawing over objects proposes a prompt to edit', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });

    await expect(page.locator('.bg-prompt-textarea')).toHaveValue(VISION_PROMPT);
    expect(sent.visionCalls).toBe(1);
    expect(sent.imageBodies).toHaveLength(0);
  });

  test('generating slots the background in beneath the objects', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);
    const original = (await readState(page)).images[0];

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await page.locator('.bg-prompt-textarea').fill('A foggy pine forest.');
    await page.locator('.bg-prompt-generate').click();

    await expect.poll(async () => (await readState(page)).images?.length).toBe(2);
    expect(String(sent.imageBodies[0].prompt)).toMatch(/^A foggy pine forest\./);
    // A 600x400 rectangle is wide, so the landscape size is asked for.
    expect(sent.imageBodies[0].size).toBe('1536x1024');

    const bg = (await readState(page)).images.find((o: { id: string }) => o.id !== original.id);
    expect(bg.name).toBe('AI Background');
    expect(bg.zIndex).toBeLessThan(original.zIndex);
    // It fills the drawn rectangle, which was centred on the image.
    expect(bg.x).toBeCloseTo(original.x, 0);
    expect(bg.y).toBeCloseTo(original.y, 0);
    expect(bg.width * bg.scaleX).toBeCloseTo(600, 0);
    expect(bg.height * bg.scaleY).toBeCloseTo(400, 0);
    await expect(page.locator('.bg-status-panel')).toHaveCount(0);
  });

  test('cancelling at the prompt adds nothing', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await expect(page.locator('.bg-prompt-textarea')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('.bg-status-panel')).toHaveCount(0);
    expect(sent.imageBodies).toHaveLength(0);
    expect((await readState(page)).images).toHaveLength(1);
  });

  test('a rectangle over empty canvas is explained, not sent', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -420, dy: -260 }, { dx: -300, dy: -180 });

    await expect(page.locator('.bg-error-toast')).toContainText(/No images found within the drawn area/);
    expect(sent.visionCalls).toBe(0);
  });

  test('a missing API key is explained, not sent', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });

    await expect(page.locator('.bg-error-toast')).toContainText(/No OpenAI API key found/);
    expect(sent.visionCalls).toBe(0);
  });
});
