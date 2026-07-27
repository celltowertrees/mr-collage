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

// See masking.spec.ts for why this wait is needed before mouseup, and why
// polling (not a single read) is needed after — the drawn shape is committed
// to state inside a React handler but persisted to localStorage by a
// separate useEffect that only runs on a later render.
async function waitForGradientMask(page: Page) {
  await expect.poll(async () => (await readState(page)).images[0]?.gradientMask).toBeTruthy();
  return (await readState(page)).images[0].gradientMask;
}

async function dragGradientLine(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Gradient Fade Mask on an Image"
test.describe('Gradient Fade Mask', () => {
  test('dragging a line fades the image from opaque at the start to transparent at the end', async ({
    page,
  }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Gradient Fade').click();

    const center = await getCanvasCenter(page);
    await dragGradientLine(page, { x: center.x - 100, y: center.y }, { x: center.x + 100, y: center.y });

    const gradientMask = await waitForGradientMask(page);
    expect(gradientMask.start).toBeTruthy();
    expect(gradientMask.end).toBeTruthy();

    // Back to select so the still-active tool's endpoint handles (rendered
    // right on top of the image) don't get sampled instead of the pixels
    // underneath them. The tool switch's re-render (detaching the handles)
    // is async, so give it a beat before sampling.
    await page.getByTitle('Select (V)').click();
    await page.waitForTimeout(100);

    const atStart = await samplePixel(page, center.x - 100, center.y);
    expect(atStart).toMatchObject(ORANGE);
    expect(atStart.a).toBeGreaterThanOrEqual(250);

    const atEnd = await samplePixel(page, center.x + 100, center.y);
    expect(atEnd.a).toBe(0);

    const beforeStart = await samplePixel(page, center.x - 140, center.y);
    expect(beforeStart).toMatchObject({ ...ORANGE, a: 255 });
  });

  test('dragging an endpoint handle updates the gradient direction', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Gradient Fade').click();

    const center = await getCanvasCenter(page);
    await dragGradientLine(page, { x: center.x - 100, y: center.y }, { x: center.x + 100, y: center.y });
    const initial = await waitForGradientMask(page);

    // The end handle renders at the screen point the gradient line's end was
    // last dropped at (stage is untransformed here, so stage coords == screen
    // coords) — drag it further out to re-shape the fade without redrawing.
    await dragGradientLine(
      page,
      { x: center.x + 100, y: center.y },
      { x: center.x + 140, y: center.y + 30 }
    );

    await expect
      .poll(async () => {
        const mask = (await readState(page)).images[0].gradientMask;
        return mask && (mask.end.x !== initial.end.x || mask.end.y !== initial.end.y);
      })
      .toBe(true);
  });

  test('a gradient fade combines with a shape mask instead of replacing it', async ({ page }) => {
    await uploadFixtureImage(page);
    const center = await getCanvasCenter(page);

    await page.getByTitle('Circle Mask').click();
    await dragGradientLine(page, { x: center.x, y: center.y }, { x: center.x + 100, y: center.y });
    await expect.poll(async () => (await readState(page)).images[0].mask?.type).toBe('circle');

    await page.getByTitle('Gradient Fade').click();
    await dragGradientLine(page, { x: center.x - 50, y: center.y }, { x: center.x + 50, y: center.y });
    await waitForGradientMask(page);

    const state = (await readState(page)).images[0];
    expect(state.mask.type).toBe('circle');
    expect(state.gradientMask).toBeTruthy();

    // Outside the 100px mask radius: hard-clipped by the shape mask regardless of the gradient.
    const outsideShape = await samplePixel(page, center.x + 120, center.y);
    expect(outsideShape.a).toBe(0);

    // Inside the shape but past the gradient's end point: faded to transparent.
    const pastGradientEnd = await samplePixel(page, center.x + 80, center.y);
    expect(pastGradientEnd.a).toBe(0);
  });

  test('clearing the gradient restores full opacity', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Gradient Fade').click();

    const center = await getCanvasCenter(page);
    await dragGradientLine(page, { x: center.x - 100, y: center.y }, { x: center.x + 100, y: center.y });
    await waitForGradientMask(page);

    await page.getByTitle('Clear Gradient').click();
    await expect.poll(async () => (await readState(page)).images[0].gradientMask).toBeUndefined();

    const atEnd = await samplePixel(page, center.x + 100, center.y);
    expect(atEnd).toMatchObject({ ...ORANGE, a: 255 });
  });

  test('exporting to ICP JSON includes the gradient start and end points', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.getByTitle('Gradient Fade').click();

    const center = await getCanvasCenter(page);
    await dragGradientLine(page, { x: center.x - 100, y: center.y }, { x: center.x + 100, y: center.y });
    await waitForGradientMask(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error('download did not save to disk');
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const gradientMask = exported['infinite-canvas'].nodes[0].data.gradientMask;

    expect(gradientMask.start).toBeTruthy();
    expect(gradientMask.end).toBeTruthy();
  });
});
