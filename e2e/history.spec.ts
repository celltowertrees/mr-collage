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

async function imageCount(page: Page) {
  return (await readState(page)).images?.length ?? 0;
}

async function firstImageOpacity(page: Page) {
  return (await readState(page)).images?.[0]?.opacity;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Undo/Redo History"
test.describe('Undo/Redo History', () => {
  test('Ctrl+Z reverts the most recent change', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(() => imageCount(page)).toBe(1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => imageCount(page)).toBe(0);
  });

  test('Ctrl+Shift+Z redoes an undone change', async ({ page }) => {
    await uploadFixtureImage(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => imageCount(page)).toBe(0);

    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => imageCount(page)).toBe(1);
  });

  test('making a new change after an undo clears the redo history', async ({ page }) => {
    await uploadFixtureImage(page); // image A
    await uploadFixtureImage(page); // image B
    await expect.poll(() => imageCount(page)).toBe(2);

    await page.keyboard.press('Control+z'); // undo add of B
    await expect.poll(() => imageCount(page)).toBe(1);

    // A new change instead of a redo — this should drop the "B" redo branch.
    await uploadFixtureImage(page); // image C
    await expect.poll(() => imageCount(page)).toBe(2);

    await page.keyboard.press('Control+Shift+z'); // nothing left to redo
    await expect.poll(() => imageCount(page)).toBe(2);
  });

  test('undo is a no-op when there is nothing to undo', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    expect(errors).toEqual([]);
    await expect(page.locator('.empty-state')).toBeVisible();

    // The app is still responsive after the no-op undo.
    await uploadFixtureImage(page);
    await expect.poll(() => imageCount(page)).toBe(1);
  });

  test('the Undo button is disabled until there is a change to undo', async ({ page }) => {
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();

    await uploadFixtureImage(page);
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
  });

  test('rapid, continuous slider edits coalesce into a single undo step', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(() => firstImageOpacity(page)).toBe(1);

    // Simulate dragging the opacity slider through several intermediate
    // values in quick succession, like a real drag would fire.
    const opacity = page.getByLabel('Opacity');
    await opacity.fill('0.8');
    await opacity.fill('0.6');
    await opacity.fill('0.4');
    await expect.poll(() => firstImageOpacity(page)).toBeCloseTo(0.4);

    // One undo reverts the entire drag, not one intermediate value at a time.
    await page.keyboard.press('Control+z');
    await expect.poll(() => firstImageOpacity(page)).toBe(1);
  });
});
