import { test, expect, type Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

function nextFrames(page: Page) {
  return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function wordArtRect(page: Page) {
  return page.evaluate(() => {
    type KNode = { getClientRect: () => Box };
    const stage = (window as unknown as { Konva: { stages: { find: (s: string) => KNode[] }[] } }).Konva.stages[0];
    const node = stage.find('.wordart')[0];
    return node ? node.getClientRect() : null;
  });
}

async function placeText(page: Page, content: string) {
  await page.getByTitle('Text (T)').click();
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  const editor = page.locator('textarea.text-edit-overlay');
  await expect(editor).toBeFocused();
  await page.keyboard.type(content);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe(content);
  await nextFrames(page);
}

const last = async (page: Page) => (await readState(page)).images.at(-1);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "WordArt Text Styles"
test.describe('WordArt Text Styles', () => {
  test('the WordArt gallery offers presets, and picking one restyles the selected text', async ({ page }) => {
    await placeText(page, 'Hooray');

    await page.getByTitle('WordArt Styles').click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    expect(await menu.getByRole('menuitem').count()).toBeGreaterThanOrEqual(10);

    await menu.getByRole('menuitem', { name: 'Sunset Arch' }).click();
    await expect(menu).not.toBeVisible();
    await expect.poll(async () => (await last(page)).warp?.shape).toBe('arch-up');
    const obj = await last(page);
    expect(obj.gradient).toBeTruthy();
    expect(obj.text).toBe('Hooray');
    expect(obj.fontSize).toBe(32);
  });

  test('a warp bends the text and its strength is adjustable', async ({ page }) => {
    await placeText(page, 'Bending along a curve');
    const flat = (await wordArtRect(page))!;

    await page.getByTitle('Warp').click();
    await page.getByRole('menuitem', { name: 'Arch Up' }).click();
    await expect.poll(async () => (await last(page)).warp?.shape).toBe('arch-up');
    await nextFrames(page);
    const arched = (await wordArtRect(page))!;
    expect(arched.height).toBeGreaterThan(flat.height * 1.3);

    const textSection = page.locator('.toolbar-section', { has: page.getByTitle('Bold') });
    await textSection.getByLabel('Amount').fill('90');
    await expect.poll(async () => (await last(page)).warp?.amount).toBe(90);

    await page.getByTitle('Warp').click();
    await page.getByRole('menuitem', { name: 'None' }).click();
    await expect.poll(async () => (await last(page)).warp).toBeUndefined();
  });

  test('gradient fill, outline and 3D extrusion apply and survive a reload', async ({ page }) => {
    await placeText(page, 'Fancy');
    const before = (await wordArtRect(page))!;

    await page.getByTitle('Gradient Fill').click();
    await expect.poll(async () => (await last(page)).gradient).toBeTruthy();
    await page.getByTitle('Outline').click();
    await expect.poll(async () => (await last(page)).outline?.width).toBeGreaterThan(0);
    await page.getByTitle('3D Extrusion').click();
    await expect.poll(async () => (await last(page)).extrusion?.depth).toBeGreaterThan(0);

    const textSection = page.locator('.toolbar-section', { has: page.getByTitle('Bold') });
    await textSection.getByLabel('Depth').fill('20');
    await expect.poll(async () => (await last(page)).extrusion?.depth).toBe(20);
    await nextFrames(page);
    const extruded = (await wordArtRect(page))!;
    expect(extruded.width).toBeGreaterThan(before.width + 10);

    await page.reload();
    await expect.poll(async () => (await wordArtRect(page))?.width ?? 0).toBeGreaterThan(before.width + 10);
    const obj = await last(page);
    expect(obj.gradient).toBeTruthy();
    expect(obj.outline).toBeTruthy();
    expect(obj.extrusion.depth).toBe(20);
  });

  test('a preset picked with the Text tool styles the next text placed', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    await page.getByTitle('WordArt Styles').click();
    await page.getByRole('menuitem', { name: 'Ocean Wave' }).click();

    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);
    await expect(page.locator('textarea.text-edit-overlay')).toBeFocused();
    await page.keyboard.type('Surf');
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await last(page))?.warp?.shape).toBe('wave');
  });
});
