import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VISION_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const GENERATION_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const FIXTURE = path.join(__dirname, 'fixtures', 'quadrant-square.png');
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

interface EditRequest {
  fields: Record<string, string>;
  // The uploaded PNGs, base64-encoded.
  files: Record<string, string>;
}

// Splits a multipart/form-data body into its text fields and file parts.
function parseMultipart(body: Buffer, contentType: string): EditRequest {
  const boundary = Buffer.from(`--${/boundary=(.+)$/.exec(contentType)![1]}`);
  const out: EditRequest = { fields: {}, files: {} };
  let at = body.indexOf(boundary);
  while (at !== -1) {
    const next = body.indexOf(boundary, at + boundary.length);
    if (next === -1) break;
    const part = body.subarray(at + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const header = part.subarray(0, split).toString();
    const content = part.subarray(split + 4);
    const name = /name="([^"]+)"/.exec(header)![1].replace('[]', '');
    if (/filename=/.test(header)) out.files[name] = content.toString('base64');
    else out.fields[name] = content.toString();
    at = next;
  }
  return out;
}

// Decodes a PNG in the page and reads back its size and some pixels, each
// given as a fraction of the picture's width and height.
function readPng(page: Page, b64: string, points: { fx: number; fy: number }[]) {
  return page.evaluate(
    async ({ b64, points }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: points.map(({ fx, fy }) => {
          const [r, g, b, a] = ctx.getImageData(Math.floor(fx * bitmap.width), Math.floor(fy * bitmap.height), 1, 1).data;
          return { r, g, b, a };
        }),
      };
    },
    { b64, points }
  );
}

// Answers the OpenAI calls, recording what each was sent.
async function mockOpenAI(page: Page) {
  const sent = { visionCalls: 0, edits: [] as EditRequest[], generationCalls: 0 };
  await page.route(VISION_ENDPOINT, (route) => {
    sent.visionCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: VISION_PROMPT } }] }),
    });
  });
  await page.route(GENERATION_ENDPOINT, (route) => {
    sent.generationCalls += 1;
    return route.fulfill({ status: 500, body: 'backgrounds must not use the text-only endpoint' });
  });
  await page.route(EDIT_ENDPOINT, async (route) => {
    const request = route.request();
    const edit = parseMultipart(request.postDataBuffer()!, (await request.headerValue('content-type')) ?? '');
    sent.edits.push(edit);
    // Answer as the API does: a picture of the size that was asked for.
    const [width, height] = edit.fields.size.split('x').map(Number);
    const b64 = await page.evaluate(
      ({ width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#e8862a';
        ctx.fillRect(0, 0, width, height);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { width, height }
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ b64_json: b64 }] }),
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

// Maps to CLAUDE.md → "Generate Background Tool Restored" and
// "Content-Aware Background Generation"
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
    expect(sent.edits).toHaveLength(0);
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
    expect(sent.edits[0].fields.prompt).toMatch(/^A foggy pine forest\./);
    // A 600x400 rectangle is wide, so the landscape size is asked for.
    expect(sent.edits[0].fields.size).toBe('1536x1024');

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

  test('the model is shown the objects where they sit, and told which pixels are theirs', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await page.locator('.bg-prompt-generate').click();
    await expect.poll(() => sent.edits.length).toBe(1);
    expect(sent.generationCalls).toBe(0);

    // The 200x200 fixture sits at the middle of the 600x400 rectangle, so it
    // covers the middle third across and the middle half down. Its top-left
    // quadrant is red.
    const corner = { fx: 0.05, fy: 0.05 };
    const centre = { fx: 0.5, fy: 0.5 };
    const redQuadrant = { fx: 0.4, fy: 0.35 };

    const picture = await readPng(page, sent.edits[0].files.image, [corner, redQuadrant]);
    expect([picture.width, picture.height]).toEqual([1536, 1024]);
    expect(picture.pixels[0]).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(picture.pixels[1].r).toBeGreaterThan(200);
    expect(picture.pixels[1].g).toBeLessThan(60);

    // Mask: transparent where the background is to be painted, opaque over
    // the object so it is kept.
    const mask = await readPng(page, sent.edits[0].files.mask, [corner, centre]);
    expect([mask.width, mask.height]).toEqual([1536, 1024]);
    expect(mask.pixels[0].a).toBe(0);
    expect(mask.pixels[1].a).toBe(255);

    expect(sent.edits[0].fields.prompt).toMatch(/exactly where/i);
  });

  test('a rectangle that is not an output shape is fitted, not stretched', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);
    const original = (await readState(page)).images[0];

    // 600x240: wider than the 3:2 picture the model returns.
    await drawBgRect(page, { dx: -300, dy: -120 }, { dx: 300, dy: 120 });
    await page.locator('.bg-prompt-generate').click();
    await expect.poll(async () => (await readState(page)).images?.length).toBe(2);

    // The model is sent a 3:2 frame grown around the rectangle, so the object
    // is a smaller share of its height: 200 of 400, not 200 of 240.
    const mask = await readPng(page, sent.edits[0].files.mask, [{ fx: 0.5, fy: 0.2 }, { fx: 0.5, fy: 0.5 }]);
    expect(mask.pixels[0].a).toBe(0);
    expect(mask.pixels[1].a).toBe(255);

    // What comes back is trimmed to the rectangle's own shape and laid over
    // it at one scale, rather than squashed to fit.
    const bg = (await readState(page)).images.find((o: { id: string }) => o.id !== original.id);
    expect(bg.width / bg.height).toBeCloseTo(600 / 240, 1);
    expect(bg.scaleX).toBeCloseTo(bg.scaleY, 2);
    expect(bg.width * bg.scaleX).toBeCloseTo(600, 0);
    expect(bg.height * bg.scaleY).toBeCloseTo(240, 0);
  });

  test('an earlier background is not treated as an object', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await page.locator('.bg-prompt-generate').click();
    await expect.poll(async () => (await readState(page)).images?.length).toBe(2);

    // Over the background alone, there is nothing to build a scene around.
    await drawBgRect(page, { dx: -290, dy: -190 }, { dx: -150, dy: -110 });
    await expect(page.locator('.bg-error-toast')).toContainText(/No images found within the drawn area/);

    // Over the object again, the old background is left out of what is sent.
    await page.locator('.bg-error-dismiss').click();
    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await page.locator('.bg-prompt-generate').click();
    await expect.poll(() => sent.edits.length).toBe(2);
    const mask = await readPng(page, sent.edits[1].files.mask, [{ fx: 0.05, fy: 0.05 }, { fx: 0.5, fy: 0.5 }]);
    expect(mask.pixels[0].a).toBe(0);
    expect(mask.pixels[1].a).toBe(255);
  });

  test('objects that fill the drawn area are explained, not sent', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    // Wholly inside the 200x200 image: no empty canvas to paint into.
    await drawBgRect(page, { dx: -50, dy: -50 }, { dx: 50, dy: 50 });

    await expect(page.locator('.bg-error-toast')).toContainText(/no empty canvas to paint a background into/);
    expect(sent.visionCalls).toBe(0);
  });

  test('cancelling at the prompt adds nothing', async ({ page }) => {
    const sent = await mockOpenAI(page);
    await saveApiKey(page);
    await uploadFixtureImage(page);

    await drawBgRect(page, { dx: -300, dy: -200 }, { dx: 300, dy: 200 });
    await expect(page.locator('.bg-prompt-textarea')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('.bg-status-panel')).toHaveCount(0);
    expect(sent.edits).toHaveLength(0);
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
