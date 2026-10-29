import { test, expect, type Page } from '@playwright/test';

// A freshly placed 3D object is a 360x360 box at scale 1, centred in the
// viewport, so the gizmo's rings land at fixed offsets from the canvas centre
// (see GIZMO_* in src/components/Model3DRotationGizmo.tsx). Grab points are
// taken on each ring's far vertex, where no other ring or resize anchor is
// within reach.
const YAW_GRAB = { dx: 104, dy: 0 };   // wide ellipse, right vertex
const PITCH_GRAB = { dx: 0, dy: 104 }; // tall ellipse, bottom vertex
const ROLL_RADIUS = 144;               // outer circle

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

function lastObject(page: Page) {
  return readState(page).then((s) => s.images.at(-1));
}

const SAVE_SETTLE_MS = 600;

async function settledRotation(page: Page) {
  await page.waitForTimeout(SAVE_SETTLE_MS);
  return (await lastObject(page)).rotation3D as { x: number; y: number; z: number };
}

async function addShape(page: Page, shape: string) {
  await page.getByTitle('Add 3D Object').click();
  await page.getByRole('menuitem', { name: shape, exact: true }).click();
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  await expect.poll(async () => (await readState(page)).images.at(-1)?.kind).toBe('model3d');
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function dragRing(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  modifier?: 'Shift'
) {
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?enable=model3d');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "On-Object 3D Rotation Gizmo"
test.describe('On-Object 3D Rotation Gizmo', () => {
  test('dragging the yaw ring turns the object about its vertical axis only', async ({ page }) => {
    const c = await addShape(page, 'Cube');
    const before = await settledRotation(page);

    await dragRing(page, { x: c.x + YAW_GRAB.dx, y: c.y + YAW_GRAB.dy }, { x: c.x + YAW_GRAB.dx + 100, y: c.y });

    await expect.poll(async () => (await lastObject(page)).rotation3D.y).toBeGreaterThan(before.y);
    const after = await settledRotation(page);
    expect(after.x).toBe(before.x);
    expect(after.z).toBe(before.z);
  });

  test('dragging the pitch ring tips the object about its horizontal axis only', async ({ page }) => {
    const c = await addShape(page, 'Sphere');
    const before = await settledRotation(page);

    await dragRing(page, { x: c.x + PITCH_GRAB.dx, y: c.y + PITCH_GRAB.dy }, { x: c.x, y: c.y + PITCH_GRAB.dy + 80 });

    await expect.poll(async () => (await lastObject(page)).rotation3D.x).toBeGreaterThan(before.x);
    const after = await settledRotation(page);
    expect(after.y).toBe(before.y);
    expect(after.z).toBe(before.z);
  });

  test('dragging the roll ring around the object rolls it', async ({ page }) => {
    const c = await addShape(page, 'Torus');
    const before = await settledRotation(page);

    // A quarter turn around the outer ring: from its right vertex to its
    // bottom one, which should read as +90 degrees of roll.
    await dragRing(page, { x: c.x + ROLL_RADIUS, y: c.y }, { x: c.x, y: c.y + ROLL_RADIUS });

    await expect.poll(async () => (await lastObject(page)).rotation3D.z).toBeGreaterThan(before.z);
    const after = await settledRotation(page);
    expect(after.z).toBeGreaterThan(before.z + 80);
    expect(after.z).toBeLessThan(before.z + 100);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  test('holding Shift snaps the angle to 15 degree steps', async ({ page }) => {
    const c = await addShape(page, 'Cone');
    const before = await settledRotation(page);

    await dragRing(
      page,
      { x: c.x + YAW_GRAB.dx, y: c.y + YAW_GRAB.dy },
      { x: c.x + YAW_GRAB.dx + 97, y: c.y },
      'Shift'
    );

    const after = await settledRotation(page);
    expect(after.y).not.toBe(before.y);
    expect(after.y % 15).toBe(0);
  });

  test('a whole ring drag is a single undo step', async ({ page }) => {
    const c = await addShape(page, 'Cube');
    const before = await settledRotation(page);

    await dragRing(page, { x: c.x + YAW_GRAB.dx, y: c.y + YAW_GRAB.dy }, { x: c.x + YAW_GRAB.dx + 120, y: c.y });
    await expect.poll(async () => (await lastObject(page)).rotation3D.y).not.toBe(before.y);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await lastObject(page)).rotation3D).toEqual(before);
  });

  test('grabbing a ring rotates without moving or deselecting the object', async ({ page }) => {
    const c = await addShape(page, 'Cube');
    await settledRotation(page);
    const before = await lastObject(page);

    await dragRing(page, { x: c.x + YAW_GRAB.dx, y: c.y + YAW_GRAB.dy }, { x: c.x + YAW_GRAB.dx + 90, y: c.y + 40 });
    await settledRotation(page);

    const after = await lastObject(page);
    expect(after.rotation3D.y).not.toBe(before.rotation3D.y);
    // The ring turns the object in place — it is not a move handle.
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.rotation).toBe(before.rotation);
    // Still selected, so its toolbar controls are still on screen.
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
  });

  test('the toolbar no longer carries numeric rotation fields', async ({ page }) => {
    await addShape(page, 'Cube');

    await expect(page.getByLabel('Rot X')).toHaveCount(0);
    await expect(page.getByLabel('Rot Y')).toHaveCount(0);
    await expect(page.getByLabel('Rot Z')).toHaveCount(0);
    // Reset is still there, and still returns the object to its default pose.
    const c = await (async () => {
      const box = await page.locator('canvas').first().boundingBox();
      if (!box) throw new Error('canvas not found');
      return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    })();
    await dragRing(page, { x: c.x + YAW_GRAB.dx, y: c.y }, { x: c.x + YAW_GRAB.dx + 60, y: c.y });
    await page.getByTitle('Reset 3D Rotation').click();
    await expect.poll(async () => (await lastObject(page)).rotation3D).toEqual({ x: -20, y: 30, z: 0 });
  });

  test('the gizmo is only offered for 3D objects', async ({ page }) => {
    await page.setInputFiles('input[type="file"]', 'e2e/fixtures/orange-square.png');
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('canvas not found');
    const c = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

    // Dragging where a 3D object's yaw ring would sit is just empty canvas
    // here: it marquee-drags rather than rotating anything, and the image
    // picks up no 3D rotation.
    await dragRing(page, { x: c.x + 300, y: c.y + 300 }, { x: c.x + 400, y: c.y + 300 });
    const obj = await lastObject(page);
    expect(obj.kind).toBe('image');
    expect(obj.rotation3D).toBeUndefined();
  });
});
