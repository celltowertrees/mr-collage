import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 300x300. Added at its natural size (300 units = 3in on a card) → 100dpi.
const LOW_RES = path.join(__dirname, 'fixtures', 'orange-square.png');

// 2400x1600. New images are capped at 400 units wide, so this lands at
// 4in → 600dpi.
function highResPNG(): Buffer {
  const png = new PNG({ width: 2400, height: 1600 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 20;
    png.data[i + 1] = 110;
    png.data[i + 2] = 60;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function imageCount(page: Page): Promise<number> {
  return ((await readState(page)).images ?? []).filter((o: { kind: string }) => o.kind === 'image').length;
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function addPostcard(page: Page) {
  await page.getByTitle('Add Card').click();
  await page.getByRole('menuitem', { name: /^Postcard/ }).click();
  await expect(page.getByTitle('Export Card')).toBeVisible();
}

async function upload(page: Page, files: string | { name: string; mimeType: string; buffer: Buffer }) {
  const before = await imageCount(page);
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect.poll(() => imageCount(page)).toBe(before + 1);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
}

// The card's top edge, clear of a 300-unit image in the middle.
async function selectCard(page: Page) {
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x - 250, center.y - 200);
  await expect(page.getByTitle('Export Card')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Low-Resolution Print Warnings"
test.describe('Low-Resolution Print Warnings', () => {
  test('a card warns about a low-res image on it, naming its print resolution', async ({ page }) => {
    await addPostcard(page);
    await upload(page, LOW_RES);
    await selectCard(page);

    const warning = page.getByTitle('Select Low-Resolution Images');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('1 image');
    await expect(warning).toContainText('100dpi');
  });

  test('a high-res image on a card raises no warning', async ({ page }) => {
    await addPostcard(page);
    await upload(page, { name: 'big.png', mimeType: 'image/png', buffer: highResPNG() });
    await expect(page.getByText(/Prints at \d+dpi/)).toHaveCount(0);
    await selectCard(page);
    await expect(page.getByTitle('Select Low-Resolution Images')).toHaveCount(0);
  });

  test('a low-res image off the card raises no warning', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await addPostcard(page);
    await upload(page, LOW_RES);
    await drag(page, center, { x: center.x - 600, y: center.y });
    await expect.poll(async () => (await readState(page)).images.find((o: { kind: string }) => o.kind === 'image').x)
      .toBeLessThan(center.x - 500);
    await expect(page.getByText(/Prints at \d+dpi/)).toHaveCount(0);
    await selectCard(page);
    await expect(page.getByTitle('Select Low-Resolution Images')).toHaveCount(0);
  });

  test('a selected low-res image on a card shows its print resolution', async ({ page }) => {
    await addPostcard(page);
    await upload(page, LOW_RES);
    await expect(page.getByText('Prints at 100dpi')).toBeVisible();
  });

  test("clicking the card's warning selects the low-res images", async ({ page }) => {
    await addPostcard(page);
    await upload(page, LOW_RES);
    await selectCard(page);
    await page.getByTitle('Select Low-Resolution Images').click();
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
    await expect(page.getByTitle('Export Card')).toHaveCount(0);
  });

  test('exporting still downloads, and says which card has soft images', async ({ page }) => {
    await addPostcard(page);
    await upload(page, LOW_RES);
    await selectCard(page);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTitle('Export Card').click()]);
    expect(download.suggestedFilename()).toBe('card-1-4x6in.png');

    const notice = page.getByRole('status');
    await expect(notice).toContainText('card-1');
    await expect(notice).toContainText('150dpi');
    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice).toHaveCount(0);
  });

  test('exporting a sharp card shows no notice', async ({ page }) => {
    await addPostcard(page);
    await upload(page, { name: 'big.png', mimeType: 'image/png', buffer: highResPNG() });
    await selectCard(page);
    await Promise.all([page.waitForEvent('download'), page.getByTitle('Export Card').click()]);
    await page.waitForTimeout(300);
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
