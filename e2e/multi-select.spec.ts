import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function imagePositions(page: Page): Promise<{ x: number; y: number }[]> {
  const state = await readState(page);
  return (state.images ?? []).map((img: { x: number; y: number }) => ({ x: img.x, y: img.y }));
}

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // addImage() auto-selects the new image, which is what makes the
  // per-image toolbar (Bring to Front, etc.) appear.
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  // The Konva <Image> itself loads asynchronously (a separate `onload`
  // after the state update above), so a drag started immediately can miss
  // it and hit the empty stage underneath instead. Two animation frames is
  // enough for the image to decode and Konva to redraw with it in place.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

// Every upload lands at the same viewport-center point (auto-selected), so
// tests spread images apart first — dragging each fresh upload away from
// center before uploading the next — to get three distinct, non-overlapping
// images to marquee-select and move independently. Images are 300x300 and
// spread horizontally (not vertically) so all three, plus the marquee boxes
// drawn around them, stay inside the default 1280x720 viewport.
async function setupThreeSeparatedImages(page: Page, center: { x: number; y: number }) {
  await uploadFixtureImage(page); // image A stays at center
  await uploadFixtureImage(page); // image B, dragged right of center
  await drag(page, center, { x: center.x + 400, y: center.y });
  await uploadFixtureImage(page); // image C, dragged left of center
  await drag(page, center, { x: center.x - 400, y: center.y });

  // Saving to localStorage happens in a separate effect, async from the
  // state updates above. Polling for a count of 3 alone isn't enough — that
  // count is already true right after C's upload, before its drag-left has
  // landed — so also wait for B and C's positions to reflect their drags.
  await expect.poll(async () => {
    const positions = await imagePositions(page);
    return (
      positions.length === 3 &&
      positions[1].x > center.x + 300 &&
      positions[2].x < center.x - 300
    );
  }).toBe(true);
  return await imagePositions(page); // [A, B, C] in upload order
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Multi-Select and Group Move"
test.describe('Multi-Select and Group Move', () => {
  test('marquee-selecting images and dragging one moves the whole group together', async ({ page }) => {
    const center = await getCanvasCenter(page);
    const [startA, startB, startC] = await setupThreeSeparatedImages(page, center);

    // Marquee box wide enough to overlap all three images.
    await drag(page, { x: center.x - 600, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });

    // Drag image A (at `center`) by a delta.
    const delta = { x: -80, y: -60 };
    await drag(page, center, { x: center.x + delta.x, y: center.y + delta.y });

    await expect.poll(() => imagePositions(page)).toEqual([
      { x: startA.x + delta.x, y: startA.y + delta.y },
      { x: startB.x + delta.x, y: startB.y + delta.y },
      { x: startC.x + delta.x, y: startC.y + delta.y },
    ]);
  });

  test('images outside the marquee box are unaffected by the group move', async ({ page }) => {
    const center = await getCanvasCenter(page);
    const [startA, startB, startC] = await setupThreeSeparatedImages(page, center);

    // Marquee box covers A and B only, not C (which is 400px left of center).
    await drag(page, { x: center.x - 100, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });

    const delta = { x: 40, y: 30 };
    await drag(page, center, { x: center.x + delta.x, y: center.y + delta.y });

    await expect.poll(() => imagePositions(page)).toEqual([
      { x: startA.x + delta.x, y: startA.y + delta.y },
      { x: startB.x + delta.x, y: startB.y + delta.y },
      startC,
    ]);
  });

  test('arrow keys nudge every selected image together', async ({ page }) => {
    const center = await getCanvasCenter(page);
    const [startA, startB, startC] = await setupThreeSeparatedImages(page, center);

    // Marquee-select all three, then nudge with the keyboard.
    await drag(page, { x: center.x - 600, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    await expect.poll(() => imagePositions(page)).toEqual([
      { x: startA.x + 1, y: startA.y + 1 },
      { x: startB.x + 1, y: startB.y + 1 },
      { x: startC.x + 1, y: startC.y + 1 },
    ]);
  });

  test('clicking empty canvas clears the selection so dragging moves only one image', async ({ page }) => {
    const center = await getCanvasCenter(page);
    const [startA, startB, startC] = await setupThreeSeparatedImages(page, center);

    // Marquee-select A and B, then prove the group is actually active by
    // moving A a little and confirming B follows — this also rules out the
    // later "moves only A" check just being the app's no-selection default.
    await drag(page, { x: center.x - 100, y: center.y - 200 }, { x: center.x + 600, y: center.y + 200 });
    const probe = { x: 10, y: 5 };
    await drag(page, center, { x: center.x + probe.x, y: center.y + probe.y });
    await expect.poll(() => imagePositions(page)).toEqual([
      { x: startA.x + probe.x, y: startA.y + probe.y },
      { x: startB.x + probe.x, y: startB.y + probe.y },
      startC,
    ]);

    // Undo the probe move, then click empty canvas to clear the selection.
    // (20, 650) is below the toolbar and below every image's bounding box.
    await page.keyboard.press('Control+z');
    await expect.poll(() => imagePositions(page)).toEqual([startA, startB, startC]);
    await page.mouse.click(20, 650);

    const delta = { x: 25, y: 15 };
    await drag(page, center, { x: center.x + delta.x, y: center.y + delta.y });

    await expect.poll(() => imagePositions(page)).toEqual([
      { x: startA.x + delta.x, y: startA.y + delta.y },
      startB,
      startC,
    ]);
  });
});
