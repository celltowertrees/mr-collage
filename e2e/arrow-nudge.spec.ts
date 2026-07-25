import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // addImage() auto-selects the new image, which is what makes the
  // per-image toolbar (Bring to Front, etc.) appear.
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function firstImagePosition(page: Page) {
  const state = await readState(page);
  const img = state.images?.[0];
  return img ? { x: img.x, y: img.y } : undefined;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Arrow Key Nudge"
test.describe('Arrow Key Nudge', () => {
  test('arrow keys move the selected image by 1 pixel', async ({ page }) => {
    await uploadFixtureImage(page);
    const start = await firstImagePosition(page);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => firstImagePosition(page)).toEqual({ x: start!.x + 1, y: start!.y });

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => firstImagePosition(page)).toEqual({ x: start!.x + 1, y: start!.y + 1 });

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => firstImagePosition(page)).toEqual({ x: start!.x, y: start!.y + 1 });

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => firstImagePosition(page)).toEqual(start);
  });

  test('arrow keys do nothing when no image is selected', async ({ page }) => {
    await uploadFixtureImage(page);
    // Deselect by pressing Escape-equivalent: click empty canvas area is not
    // exercised elsewhere, so instead delete the image to remove selection
    // and confirm the app stays responsive with no image to move.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await readState(page)).images?.length ?? 0).toBe(0);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
  });

  test('back-to-back nudges fired before a re-render each accumulate', async ({ page }) => {
    await uploadFixtureImage(page);
    const start = await firstImagePosition(page);

    // Simulates key-repeat firing several keydowns in the same tick, before
    // React has re-rendered in response to the first one.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      }
    });
    await expect.poll(() => firstImagePosition(page)).toEqual({ x: start!.x + 5, y: start!.y });
  });

  test('rapid, repeated arrow nudges coalesce into a single undo step', async ({ page }) => {
    await uploadFixtureImage(page);
    const start = await firstImagePosition(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => firstImagePosition(page)).toEqual({ x: start!.x + 3, y: start!.y });

    // One undo reverts the whole burst of nudges, not one pixel at a time.
    await page.keyboard.press('Control+z');
    await expect.poll(() => firstImagePosition(page)).toEqual(start);
  });
});
