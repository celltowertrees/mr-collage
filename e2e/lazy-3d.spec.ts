import { test, expect } from '@playwright/test';

// Maps to CLAUDE.md → "Lazy-Loaded 3D Renderer"
test.describe('Lazy-Loaded 3D Renderer', () => {
  test('the 3D renderer is not fetched until the 3D menu is opened', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));
    const isRenderer = (url: string) => /model3dRenderer|\/three(\.module)?\.js|deps\/three/.test(url);

    await page.goto('/?enable=model3d');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTitle('Add 3D Object')).toBeVisible();
    expect(requested.filter(isRenderer)).toEqual([]);

    await page.getByTitle('Add 3D Object').click();
    await expect.poll(() => requested.some(isRenderer)).toBe(true);
  });
});
