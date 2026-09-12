import { test, expect, type Page } from '@playwright/test';

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

// Adds a primitive via the 3D object menu, leaving it selected.
async function addShape(page: Page, shape: string) {
  await page.getByTitle('Add 3D Object').click();
  await page.getByRole('menuitem', { name: shape, exact: true }).click();
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  await expect.poll(async () => (await readState(page)).images.at(-1)?.kind).toBe('model3d');
  return getCanvasCenter(page);
}

function lastObject(page: Page) {
  return readState(page).then((s) => s.images.at(-1));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "3D Objects on the Canvas"
test.describe('3D Objects on the Canvas', () => {
  test('placing a primitive puts a lit, posed 3D object on the canvas', async ({ page }) => {
    await addShape(page, 'Cube');

    const obj = await lastObject(page);
    expect(obj.shape).toBe('cube');
    // Posed off-axis by default so a cube reads as 3D rather than as a square.
    expect(obj.rotation3D.x).not.toBe(0);
    expect(obj.rotation3D.y).not.toBe(0);
    expect(obj.light.intensity).toBeGreaterThan(0);
    expect(obj.material.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('orbit-dragging turns the object about all three axes', async ({ page }) => {
    const center = await addShape(page, 'Sphere');
    const before = await lastObject(page);

    await page.getByTitle('3D Rotate (R)').click();

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y + 60, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => (await lastObject(page)).rotation3D.y).toBeGreaterThan(before.rotation3D.y);
    await expect.poll(async () => (await lastObject(page)).rotation3D.x).toBeGreaterThan(before.rotation3D.x);

    // Shift-drag rolls the object instead of yawing it.
    const rolled = await lastObject(page);
    await page.keyboard.down('Shift');
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 80, center.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await expect.poll(async () => (await lastObject(page)).rotation3D.z).toBeGreaterThan(rolled.rotation3D.z);
    await expect.poll(async () => (await lastObject(page)).rotation3D.y).toBe(rolled.rotation3D.y);
  });

  test('typing an exact angle turns the object to it', async ({ page }) => {
    await addShape(page, 'Torus');

    await page.getByLabel('Rot X').fill('45');
    await page.getByLabel('Rot X').blur();
    await expect.poll(async () => (await lastObject(page)).rotation3D.x).toBe(45);

    await page.getByLabel('Rot Z').fill('-90');
    await page.getByLabel('Rot Z').blur();
    await expect.poll(async () => (await lastObject(page)).rotation3D.z).toBe(-90);
  });

  test('a whole orbit drag is a single undo step', async ({ page }) => {
    const center = await addShape(page, 'Cube');
    const before = await lastObject(page);

    await page.getByTitle('3D Rotate (R)').click();
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 120, center.y + 40, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await lastObject(page)).rotation3D.y).not.toBe(before.rotation3D.y);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await lastObject(page)).rotation3D).toEqual(before.rotation3D);
  });

  test('the directional light and material are adjustable', async ({ page }) => {
    await addShape(page, 'Cube');

    await page.getByLabel('Azimuth').fill('200');
    await expect.poll(async () => (await lastObject(page)).light.azimuth).toBe(200);

    await page.getByLabel('Elevation').fill('-30');
    await expect.poll(async () => (await lastObject(page)).light.elevation).toBe(-30);

    await page.getByLabel('Intensity').fill('4');
    await expect.poll(async () => (await lastObject(page)).light.intensity).toBe(4);

    await page.getByLabel('Ambient').fill('1.2');
    await expect.poll(async () => (await lastObject(page)).light.ambient).toBe(1.2);

    await page.getByLabel('Roughness').fill('0.9');
    await expect.poll(async () => (await lastObject(page)).material.roughness).toBe(0.9);
  });

  test('a 3D object takes the same shared effects an image does', async ({ page }) => {
    await addShape(page, 'Cone');

    await page.getByTitle('Enable Drop Shadow').click();
    await expect.poll(async () => (await lastObject(page)).shadow?.enabled).toBe(true);

    await page.getByTitle('Flip Horizontal').click();
    await expect.poll(async () => (await lastObject(page)).flipX).toBe(true);

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Multiply' }).click();
    await expect.poll(async () => (await lastObject(page)).blendMode).toBe('multiply');

    await expect(page.getByTitle('Gradient Fade')).toBeVisible();
  });

  test('shape mask, vignette, and crop stay image-only', async ({ page }) => {
    await addShape(page, 'Cube');

    await expect(page.getByTitle('Circle Mask')).not.toBeVisible();
    await expect(page.getByTitle('Rectangle Mask')).not.toBeVisible();
    await expect(page.getByTitle('Freeform Mask (click points, double-click to finish)')).not.toBeVisible();
    await expect(page.getByTitle('Enable Vignette')).not.toBeVisible();
    await expect(page.getByTitle('Crop')).not.toBeVisible();
  });

  test('a posed 3D object survives a reload', async ({ page }) => {
    await addShape(page, 'Icosahedron');
    await page.getByLabel('Rot Y').fill('137');
    await page.getByLabel('Rot Y').blur();
    await page.getByLabel('Azimuth').fill('275');
    await expect.poll(async () => (await lastObject(page)).light.azimuth).toBe(275);

    await page.reload();

    await expect.poll(async () => (await lastObject(page))?.kind).toBe('model3d');
    const obj = await lastObject(page);
    expect(obj.shape).toBe('icosahedron');
    expect(obj.rotation3D.y).toBe(137);
    expect(obj.light.azimuth).toBe(275);
  });

  test('a 3D object can be duplicated and deleted like any other object', async ({ page }) => {
    await addShape(page, 'Cube');

    await page.getByTitle('Duplicate').click();
    await expect.poll(async () => (await readState(page)).images.length).toBe(2);
    expect((await lastObject(page)).kind).toBe('model3d');

    await page.getByTitle('Delete').click();
    await expect.poll(async () => (await readState(page)).images.length).toBe(1);
  });
});
