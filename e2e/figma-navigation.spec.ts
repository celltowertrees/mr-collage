import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

type KNode = { id: () => string; getClientRect: () => { x: number; y: number; width: number; height: number } };
type KStage = {
  x: () => number;
  y: () => number;
  scaleX: () => number;
  width: () => number;
  height: () => number;
  findOne: (s: string) => (KNode & { nodes: () => KNode[] }) | undefined;
  find: (s: string) => KNode[];
};

function stageViewport(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { Konva: { stages: KStage[] } }).Konva.stages[0];
    return { x: Math.round(stage.x()), y: Math.round(stage.y()), scale: stage.scaleX() };
  });
}

function selectedIds(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { Konva: { stages: KStage[] } }).Konva.stages[0];
    return stage.findOne('Transformer')?.nodes().map((n) => n.id()) ?? [];
  });
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function imageIds(page: Page): Promise<string[]> {
  return ((await readState(page)).images ?? []).map((img: { id: string }) => img.id);
}

async function frames(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function uploadFixtureImage(page: Page) {
  const before = (await imageIds(page)).length;
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect.poll(async () => (await imageIds(page)).length).toBe(before + 1);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
  await frames(page);
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  button: 'left' | 'middle' = 'left'
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up({ button });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.mouse.move(640, 360);
});

// Maps to CLAUDE.md → "Figma-Style Canvas Navigation"
test.describe('Figma-Style Canvas Navigation', () => {
  test('a plain scroll under the Select tool pans without zooming', async ({ page }) => {
    await page.mouse.wheel(30, 120);
    await expect.poll(() => stageViewport(page)).toEqual({ x: -30, y: -120, scale: 1 });
  });

  test('Ctrl/Cmd+scroll or a pinch zooms about the pointer', async ({ page }) => {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await stageViewport(page)).scale).toBeGreaterThan(1);
  });

  test('holding Space and dragging pans without switching tool', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await page.keyboard.down('Space');
    await drag(page, center, { x: center.x + 120, y: center.y + 40 });
    await page.keyboard.up('Space');

    await expect.poll(() => stageViewport(page)).toEqual({ x: 120, y: 40, scale: 1 });
    await expect(page.getByTitle('Select (V)')).toHaveClass(/active/);
    await expect(page.getByTitle('Pan (H)')).not.toHaveClass(/active/);
  });

  test('releasing Space returns to the tool that was active', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.keyboard.down('Space');
    await drag(page, center, { x: center.x - 80, y: center.y });
    await page.keyboard.up('Space');

    await expect.poll(() => stageViewport(page)).toEqual({ x: -80, y: 0, scale: 1 });
    await expect(page.getByTitle('Text (T)')).toHaveClass(/active/);
    // A pan isn't a click: no text object was placed.
    expect(await imageIds(page)).toEqual([]);
  });

  test('Space+drag over an image pans rather than moving the image', async ({ page }) => {
    await uploadFixtureImage(page);
    const before = (await readState(page)).images[0];
    const center = await getCanvasCenter(page);
    await page.keyboard.down('Space');
    await drag(page, center, { x: center.x + 100, y: center.y });
    await page.keyboard.up('Space');

    await expect.poll(() => stageViewport(page)).toEqual({ x: 100, y: 0, scale: 1 });
    const after = (await readState(page)).images[0];
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });

  test('a middle-button drag pans from any tool', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await drag(page, center, { x: center.x + 60, y: center.y - 90 }, 'middle');
    await expect.poll(() => stageViewport(page)).toEqual({ x: 60, y: -90, scale: 1 });
    await expect(page.getByTitle('Select (V)')).toHaveClass(/active/);
  });

  test('Ctrl/Cmd+= zooms in, Ctrl/Cmd+- zooms out, and Shift+0 returns to 100%', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+Equal');
    await expect.poll(async () => (await stageViewport(page)).scale).toBeCloseTo(2, 5);
    await page.keyboard.press('ControlOrMeta+Minus');
    await page.keyboard.press('ControlOrMeta+Minus');
    await expect.poll(async () => (await stageViewport(page)).scale).toBeCloseTo(0.5, 5);
    await page.keyboard.press('Shift+Digit0');
    await expect.poll(async () => (await stageViewport(page)).scale).toBeCloseTo(1, 5);
  });

  test('Shift+1 zooms to fit every object on screen', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await uploadFixtureImage(page);
    await uploadFixtureImage(page);
    await drag(page, center, { x: center.x + 450, y: center.y });
    await page.keyboard.press('ControlOrMeta+Equal');
    await page.keyboard.press('ControlOrMeta+Equal');
    await page.keyboard.press('Shift+Digit1');

    await expect
      .poll(() =>
        page.evaluate(() => {
          const stage = (window as unknown as { Konva: { stages: KStage[] } }).Konva.stages[0];
          const ids = (JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}').images ?? []).map(
            (i: { id: string }) => i.id
          );
          return ids.every((id: string) => {
            const r = stage.findOne(`#${id}`)?.getClientRect();
            return (
              !!r && r.x >= 0 && r.y >= 0 && r.x + r.width <= stage.width() && r.y + r.height <= stage.height()
            );
          });
        })
      )
      .toBe(true);
  });

  test('dragging an unselected image selects it and moves it alone', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await uploadFixtureImage(page);
    await drag(page, center, { x: center.x - 350, y: center.y }); // A moves left, stays selected
    await uploadFixtureImage(page); // B at centre, now selected
    const [a, b] = await imageIds(page);
    // Select A, then drag B without clicking it first.
    await page.mouse.click(center.x - 350, center.y);
    await expect.poll(() => selectedIds(page)).toEqual([a]);
    const aBefore = (await readState(page)).images[0];

    await drag(page, center, { x: center.x + 200, y: center.y });
    await expect.poll(() => selectedIds(page)).toEqual([b]);
    await expect.poll(async () => (await readState(page)).images[1].x).toBeGreaterThan(center.x + 100);
    const aAfter = (await readState(page)).images[0];
    expect(aAfter.x).toBe(aBefore.x);
  });

  test('Shift+pressing an unselected image adds it to the selection', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await uploadFixtureImage(page);
    await drag(page, center, { x: center.x - 350, y: center.y });
    await uploadFixtureImage(page);
    const [a, b] = await imageIds(page);
    await expect.poll(() => selectedIds(page)).toEqual([b]);

    await page.keyboard.down('Shift');
    await page.mouse.click(center.x - 350, center.y);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await selectedIds(page)).sort()).toEqual([a, b].sort());
  });
});
