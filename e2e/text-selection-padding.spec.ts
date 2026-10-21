import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

// The on-screen boxes of the selected object and of each Transformer handle.
function selectionGeometry(page: Page, objectClass: 'Text' | 'Image') {
  return page.evaluate((cls) => {
    type Box = { x: number; y: number; width: number; height: number };
    const stage = (window as unknown as { Konva: { stages: { find: (s: string) => { getClientRect: () => Box; name: () => string }[] }[] } })
      .Konva.stages[0];
    const object = stage.find(cls)[0].getClientRect();
    const anchors = stage
      .find('Rect')
      .filter((n) => /_anchor$/.test(n.name()) && !/rotater/.test(n.name()))
      .map((n) => ({ name: n.name(), ...n.getClientRect() }));
    return { object, anchors };
  }, objectClass);
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Selection Handles Clear of Text"
test.describe('Selection Handles Clear of Text', () => {
  test('a selected text object\'s resize handles sit clear of its letters', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const overlay = page.locator('textarea.text-edit-overlay');
    await overlay.fill('hello');
    await overlay.press('Enter');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('hello');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const { object, anchors } = await selectionGeometry(page, 'Text');
    expect(anchors).toHaveLength(8);
    for (const anchor of anchors) {
      expect(overlaps(anchor, object), `${anchor.name} overlaps the text`).toBe(false);
    }
  });

  test('an image\'s resize handles still sit on its edges', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const { object, anchors } = await selectionGeometry(page, 'Image');
    const right = anchors.find((a) => a.name.startsWith('middle-right'))!;
    expect(Math.abs(right.x + right.width / 2 - (object.x + object.width))).toBeLessThan(1);
  });
});
