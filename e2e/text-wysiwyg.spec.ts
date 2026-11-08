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

// The on-screen box of a named Konva node (first match), or null if absent or hidden.
function nodeRect(page: Page, selector: string) {
  return page.evaluate((sel) => {
    type KNode = { getClientRect: () => Box; isVisible: () => boolean; name: () => string };
    const stage = (window as unknown as { Konva: { stages: { find: (s: string) => KNode[] }[] } }).Konva.stages[0];
    const node = stage.find(sel)[0];
    return node && node.isVisible() ? node.getClientRect() : null;
  }, selector);
}

function anchorRect(page: Page, name: string) {
  return page.evaluate((anchor) => {
    type KNode = { getClientRect: () => Box; name: () => string; isVisible: () => boolean };
    const stage = (window as unknown as { Konva: { stages: { find: (s: string) => KNode[] }[] } }).Konva.stages[0];
    const node = stage
      .find('Rect')
      .find((n) => n.name().startsWith(`${anchor} _anchor`) && n.isVisible());
    return node ? node.getClientRect() : null;
  }, name);
}

const editor = (page: Page) => page.locator('textarea.text-edit-overlay');

// Places a text object with the Text tool, replaces the placeholder with
// `content`, and finishes editing with Escape.
async function placeText(page: Page, content: string) {
  await page.getByTitle('Text (T)').click();
  const center = await getCanvasCenter(page);
  await page.mouse.click(center.x, center.y);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(content);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe(content);
  await nextFrames(page);
  // Where the text actually is: the click marks where it starts.
  const rect = (await nodeRect(page, '.wordart'))!;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "WYSIWYG Text Editing"
test.describe('WYSIWYG Text Editing', () => {
  test('a new text object starts with placeholder text, selected so typing replaces it', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);

    await expect(editor(page)).toBeFocused();
    await expect(editor(page)).toHaveValue('Your Text Here');
    await page.keyboard.type('Hi');
    await expect(editor(page)).toHaveValue('Hi');
  });

  test('typed characters appear on the canvas object itself while still editing', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.type('W');
    await nextFrames(page);
    const narrow = await nodeRect(page, '.wordart');

    await page.keyboard.type('WWWWW');
    await nextFrames(page);
    const wide = await nodeRect(page, '.wordart');

    // Still editing, and the canvas object (not an HTML box) grew with the text.
    await expect(editor(page)).toBeFocused();
    expect(wide!.width).toBeGreaterThan(narrow!.width * 3);
    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('WWWWWW');
    // The caret is drawn on the canvas.
    expect(await nodeRect(page, '.text-caret')).not.toBeNull();
  });

  test('Enter starts a new line instead of finishing', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('one\ntwo');
  });

  test('clicking empty canvas finishes editing and keeps the text', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.type('Keep');
    await page.mouse.click(center.x - 300, center.y - 200);

    await expect(editor(page)).toHaveCount(0);
    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('Keep');
  });

  test('the caret follows a rotated text object', async ({ page }) => {
    const center = await placeText(page, 'Turn');
    await page.getByLabel('Rotation').fill('90');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.rotation).toBe(90);
    await nextFrames(page);

    await page.mouse.dblclick(center.x, center.y);
    await expect(editor(page)).toBeFocused();
    await nextFrames(page);
    const caret = await nodeRect(page, '.text-caret');
    // An upright caret is tall and thin; turned 90° it lies on its side.
    expect(caret!.width).toBeGreaterThan(caret!.height);
  });

  test('double-clicking places the caret where you clicked', async ({ page }) => {
    await placeText(page, 'First');
    const rect = (await nodeRect(page, '.wordart'))!;

    await page.mouse.dblclick(rect.x + 2, rect.y + rect.height / 2);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('X');
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('XFirst');
  });

  test('dragging a corner handle changes the real font size', async ({ page }) => {
    await placeText(page, 'Grow');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.fontSize).toBe(32);
    // The font can still be arriving; wait until the box stops changing.
    let object = (await nodeRect(page, '.wordart'))!;
    await expect
      .poll(async () => {
        await page.waitForTimeout(150);
        const next = (await nodeRect(page, '.wordart'))!;
        const settled = Math.abs(next.width - object.width) < 0.5;
        object = next;
        return settled;
      })
      .toBe(true);

    // Text offers corner handles only.
    expect(await anchorRect(page, 'middle-right')).toBeNull();
    const corner = (await anchorRect(page, 'bottom-right'))!;
    const start = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + object.width / 2, start.y + object.height / 2, { steps: 8 });
    await page.mouse.move(start.x + object.width, start.y + object.height, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await readState(page)).images.at(-1)?.fontSize).toBeGreaterThan(48);
    const obj = (await readState(page)).images.at(-1);
    await nextFrames(page);
    const grown = (await nodeRect(page, '.wordart'))!;
    // The letters grew by the factor the font size did, re-rendered at the
    // new size rather than stretched by a leftover scale.
    // (Within 6%: the box's fixed 1px edge padding doesn't scale.)
    const ratio = obj.fontSize / 32 / (grown.width / object.width);
    expect(Math.abs(ratio - 1)).toBeLessThan(0.06);
    expect(obj.scaleX).toBe(1);
    expect(obj.scaleY).toBe(1);
    const textSection = page.locator('.toolbar-section', { has: page.getByTitle('Bold') });
    await expect(textSection.getByLabel('Size')).toHaveValue(String(Math.round(obj.fontSize)));
  });

  test('a text object emptied out is removed when editing finishes', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await readState(page)).images?.length ?? 0).toBe(0);
  });

  test('one undo reverts a whole typing session, however slowly it was typed', async ({ page }) => {
    const center = await placeText(page, 'First');

    await page.mouse.dblclick(center.x, center.y);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Sec');
    await page.waitForTimeout(800);
    await page.keyboard.type('ond');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('Second');

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await readState(page)).images.at(-1)?.text).toBe('First');
  });
});
