import { test, expect, type Page } from '@playwright/test';

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function viewport(page: Page) {
  const state = await readState(page);
  return state.stagePosition
    ? { x: state.stagePosition.x, y: state.stagePosition.y, scale: state.stageScale }
    : undefined;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.mouse.move(640, 360);
});

// Maps to CLAUDE.md → "Scroll to Pan with the Pan Tool"
test.describe('Scroll to Pan with the Pan Tool', () => {
  test('scrolling with the Pan tool pans the view without zooming', async ({ page }) => {
    await page.getByTitle('Pan (H)').click();
    await page.mouse.move(640, 360);
    const start = { x: 0, y: 0, scale: 1 };

    await page.mouse.wheel(0, 100);
    await expect.poll(() => viewport(page)).toEqual({ x: start.x, y: start.y - 100, scale: 1 });

    await page.mouse.wheel(60, 0);
    await expect.poll(() => viewport(page)).toEqual({ x: start.x - 60, y: start.y - 100, scale: 1 });
  });

  test('Shift+scroll with the Pan tool pans sideways', async ({ page }) => {
    await page.getByTitle('Pan (H)').click();
    await page.mouse.move(640, 360);

    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 80);
    await page.keyboard.up('Shift');
    await expect.poll(() => viewport(page)).toEqual({ x: -80, y: 0, scale: 1 });
  });

  test('Ctrl+scroll (or a pinch) with the Pan tool still zooms', async ({ page }) => {
    await page.getByTitle('Pan (H)').click();
    await page.mouse.move(640, 360);

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await viewport(page))?.scale).toBeGreaterThan(1);
  });

  test('scrolling with the Select tool still zooms', async ({ page }) => {
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await viewport(page))?.scale).toBeGreaterThan(1);
  });
});
