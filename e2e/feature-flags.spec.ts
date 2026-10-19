import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Temporarily Disabled Toolbar Tools"
test.describe('Temporarily Disabled Toolbar Tools', () => {
  test('the 3D object tool is not offered', async ({ page }) => {
    await expect(page.getByTitle('Upload Image')).toBeVisible();
    await expect(page.getByTitle('Add 3D Object')).toHaveCount(0);
  });

  test('the background generation tool is not offered', async ({ page }) => {
    await expect(page.getByTitle('Upload Image')).toBeVisible();
    await expect(page.getByTitle(/^Generate Background/)).toHaveCount(0);
  });

  test('a disabled tool can be switched back on from the URL', async ({ page }) => {
    await page.goto('/?enable=model3d,backgroundGeneration');
    await expect(page.getByTitle('Add 3D Object')).toBeVisible();
    await expect(page.getByTitle(/^Generate Background/)).toBeVisible();
  });

  test('a 3D object already on the canvas still works', async ({ page }) => {
    await page.goto('/?enable=model3d');
    await page.getByTitle('Add 3D Object').click();
    await page.getByRole('menuitem', { name: 'Cube', exact: true }).click();
    await expect(page.getByTitle('3D Rotate (R)')).toBeVisible();

    // Reload with the tool switched off: the saved cube comes back, and
    // selecting it still offers its 3D controls.
    await page.goto('/');
    await expect(page.getByTitle('Add 3D Object')).toHaveCount(0);
    const box = await page.locator('.konvajs-content').boundingBox();
    if (!box) throw new Error('canvas not found');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTitle('3D Rotate (R)')).toBeVisible();
  });
});
