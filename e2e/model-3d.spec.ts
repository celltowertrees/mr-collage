import { test, expect, type Page } from '@playwright/test';

const FIXTURE = 'e2e/fixtures/orange-square.png';

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

// Saves are debounced by SAVE_DEBOUNCE_MS in useCollage, so the tail of a
// gesture can still be sitting in a pending timer. Polling for a stable value
// isn't enough — two reads inside the quiet window before the trailing flush
// both see the same stale number — so wait the window out before taking a
// baseline to compare a later gesture against.
const SAVE_SETTLE_MS = 600;

async function settledRotation(page: Page) {
  await page.waitForTimeout(SAVE_SETTLE_MS);
  return (await lastObject(page)).rotation3D as { x: number; y: number; z: number };
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
    const rolled = { rotation3D: await settledRotation(page) };
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
    const before = { rotation3D: await settledRotation(page) };

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

  // Maps to CLAUDE.md → "Colour and Texture on 3D Objects"
  test('a preset texture can be applied, tiled, and cleared', async ({ page }) => {
    await addShape(page, 'Cube');
    const surface = page.locator('.toolbar-section', { has: page.getByTitle('Texture') });

    await expect(page.getByTitle('Texture')).toHaveText('No Texture');
    await page.getByTitle('Texture').click();
    await page.getByRole('menuitem', { name: 'Checker', exact: true }).click();

    await expect.poll(async () => (await lastObject(page)).material.texture?.preset).toBe('checker');
    await expect(page.getByTitle('Texture')).toHaveText('Checker');

    await surface.getByLabel('Tiling').fill('6');
    await expect.poll(async () => (await lastObject(page)).material.texture?.repeat).toBe(6);

    await page.getByTitle('Texture').click();
    await page.getByRole('menuitem', { name: 'None', exact: true }).click();
    await expect.poll(async () => (await lastObject(page)).material.texture).toBeUndefined();
  });

  test('the colour swatch tints the object independently of its texture', async ({ page }) => {
    await addShape(page, 'Sphere');
    const surface = page.locator('.toolbar-section', { has: page.getByTitle('Texture') });

    await surface.getByLabel('Colour').fill('#ff0000');
    await expect.poll(async () => (await lastObject(page)).material.color).toBe('#ff0000');

    await page.getByTitle('Texture').click();
    await page.getByRole('menuitem', { name: 'Stripes', exact: true }).click();
    await expect.poll(async () => (await lastObject(page)).material.texture?.preset).toBe('stripes');
    // Applying a texture leaves the colour alone — they compose.
    expect((await lastObject(page)).material.color).toBe('#ff0000');
  });

  test('an uploaded texture survives a reload', async ({ page }) => {
    await addShape(page, 'Cube');
    await page.getByTitle('Texture').click();
    await page.getByLabel('Texture image').setInputFiles(FIXTURE);

    await expect.poll(async () => (await lastObject(page)).material.texture?.source).toBe('image');
    // The pixels belong in IndexedDB, not in the localStorage metadata.
    const raw = await page.evaluate(() => localStorage.getItem('mr-collage-state') ?? '');
    expect(raw).not.toContain('data:image');

    await page.reload();
    await expect.poll(async () => (await lastObject(page))?.material?.texture?.source).toBe('image');

    // The metadata above proves the setting survived; the pixels live in
    // IndexedDB under the object's id, so check they came back too.
    const id = (await lastObject(page)).id;
    const blob = await page.evaluate(
      (key) =>
        new Promise<string | undefined>((resolve) => {
          const open = indexedDB.open('mr-collage-db');
          open.onsuccess = () => {
            const req = open.result.transaction('images', 'readonly').objectStore('images').get(key);
            req.onsuccess = () => resolve(req.result as string | undefined);
            req.onerror = () => resolve(undefined);
          };
          open.onerror = () => resolve(undefined);
        }),
      id
    );
    expect(blob).toContain('data:image');
  });

  // Maps to CLAUDE.md → "Cheap Incremental Saves": orbiting used to allocate a
  // fresh multi-megabyte canvas every frame.
  test('orbiting redraws in place instead of allocating a canvas per frame', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __canvases: number }).__canvases = 0;
      const create = Document.prototype.createElement;
      Document.prototype.createElement = function (tag: string, ...rest: unknown[]) {
        if (String(tag).toLowerCase() === 'canvas') {
          (window as unknown as { __canvases: number }).__canvases++;
        }
        return create.call(this, tag, ...(rest as []));
      } as typeof Document.prototype.createElement;
    });
    await page.reload();

    const center = await addShape(page, 'Torus Knot');
    await page.getByTitle('3D Rotate (R)').click();
    const before = await page.evaluate(() => (window as unknown as { __canvases: number }).__canvases);

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 300, center.y + 120, { steps: 40 });
    await page.mouse.up();

    await expect.poll(async () => (await lastObject(page)).rotation3D.y).not.toBe(30);
    const after = await page.evaluate(() => (window as unknown as { __canvases: number }).__canvases);

    // A couple of stray allocations would be tolerable; one per frame is not.
    expect(after - before).toBeLessThan(5);
  });
});
