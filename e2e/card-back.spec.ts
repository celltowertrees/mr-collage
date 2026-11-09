import { test, expect, type Page, type Download, type Locator } from '@playwright/test';
import fs from 'fs';
import { PNG } from 'pngjs';

interface CardState {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  includeBleed: boolean;
  addressGuides?: boolean;
  pair?: { id: string; side: 'front' | 'back' };
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function cards(page: Page): Promise<CardState[]> {
  return ((await readState(page)).images ?? []).filter((obj: CardState) => obj.kind === 'card');
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function addPostcardWithBack(page: Page) {
  await page.getByTitle('Add Card').click();
  await page.getByRole('menuitem', { name: /^Postcard/ }).click();
  await expect.poll(async () => (await cards(page)).length).toBe(1);
  await page.getByTitle('Add Back').click();
  await expect.poll(async () => (await cards(page)).length).toBe(2);
}

async function collectDownloads(page: Page, trigger: Locator, count: number): Promise<Download[]> {
  const downloads: Download[] = [];
  const done = new Promise<void>((resolve) => {
    page.on('download', (d) => {
      downloads.push(d);
      if (downloads.length === count) resolve();
    });
  });
  await trigger.click();
  await done;
  return downloads;
}

async function readPNG(download: Download) {
  const filePath = await download.path();
  if (!filePath) throw new Error('download did not save to disk');
  return PNG.sync.read(fs.readFileSync(filePath));
}

// Zooms out so a back card placed beside the front is on screen too.
async function zoomOut(page: Page) {
  const center = await getCanvasCenter(page);
  await page.mouse.move(center.x, center.y);
  // Ctrl+scroll zooms; a plain scroll pans.
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await readState(page)).stageScale).toBeLessThan(0.85);
  // Let the wheel gesture settle into state before reading the view back.
  await page.waitForTimeout(400);
}

// How many non-white pixels are on screen inside a card-local rectangle.
async function inkInCardRect(page: Page, card: CardState, rect: { x: number; y: number; width: number; height: number }) {
  const { stagePosition, stageScale } = await readState(page);
  const canvasBox = (await page.locator('canvas').first().boundingBox())!;
  const left = canvasBox.x + stagePosition.x + (card.x - card.width / 2 + rect.x) * stageScale;
  const top = canvasBox.y + stagePosition.y + (card.y - card.height / 2 + rect.y) * stageScale;
  const shot = PNG.sync.read(
    await page.screenshot({
      clip: { x: left, y: top, width: rect.width * stageScale, height: rect.height * stageScale },
    })
  );
  let ink = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    if (shot.data[i] < 230 || shot.data[i + 1] < 230 || shot.data[i + 2] < 230) ink++;
  }
  return ink;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Front and Back Cards"
test.describe('Front and Back Cards', () => {
  test('Add Back places a linked card of the same size beside the front, and selects it', async ({ page }) => {
    await addPostcardWithBack(page);
    const [front, back] = await cards(page);
    expect(front.pair).toEqual({ id: back.id, side: 'front' });
    expect(back.pair).toEqual({ id: front.id, side: 'back' });
    expect([back.width, back.height]).toEqual([front.width, front.height]);
    expect(back.x).toBeGreaterThan(front.x + front.width);
    expect(back.y).toBe(front.y);
    // The back is selected, and a linked card doesn't offer another back.
    await expect(page.getByLabel('Address Layout')).toBeVisible();
    await expect(page.getByTitle('Add Back')).toHaveCount(0);
  });

  test('exporting either side downloads both, named front and back', async ({ page }) => {
    await addPostcardWithBack(page);
    const downloads = await collectDownloads(page, page.getByTitle('Export Card'), 2);
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual(['card-1-back.png', 'card-1-front.png']);
    for (const d of downloads) {
      const png = await readPNG(d);
      expect([png.width, png.height]).toEqual([1875, 1275]);
    }
  });

  test('switching one side to portrait switches the other too', async ({ page }) => {
    await addPostcardWithBack(page);
    await page.getByTitle('Portrait').click();
    await expect.poll(async () => (await cards(page)).map((c) => [c.width, c.height])).toEqual([
      [400, 600],
      [400, 600],
    ]);
    // One undo puts both back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await cards(page)).map((c) => c.height)).toEqual([400, 400]);
  });

  test('deleting one side leaves the other as a plain card that can take a new back', async ({ page }) => {
    await addPostcardWithBack(page);
    // The back is selected; delete it.
    await page.getByTitle('Delete').click();
    await expect.poll(async () => (await cards(page)).length).toBe(1);
    const [front] = await cards(page);
    expect(front.pair).toBeUndefined();

    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 250, center.y - 200);
    await expect(page.getByTitle('Add Back')).toBeVisible();
    const [solo] = await collectDownloads(page, page.getByTitle('Export Card'), 1);
    expect(solo.suggestedFilename()).toBe('card-1-4x6in.png');
  });

  test('one undo removes a newly added back and unlinks the front', async ({ page }) => {
    await addPostcardWithBack(page);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await cards(page)).length).toBe(1);
    expect((await cards(page))[0].pair).toBeUndefined();
  });

  test('the pair stays linked through a reload', async ({ page }) => {
    await addPostcardWithBack(page);
    const before = await cards(page);
    await page.reload();
    await expect(page.getByTitle('Export All Cards')).toBeVisible();
    expect(await cards(page)).toEqual(before);
    const downloads = await collectDownloads(page, page.getByTitle('Export All Cards'), 2);
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual(['card-1-back.png', 'card-1-front.png']);
  });

  test('the address layout draws guides on the back that never reach the export', async ({ page }) => {
    await addPostcardWithBack(page);
    await page.getByLabel('Include Bleed').uncheck();
    await zoomOut(page);
    const back = (await cards(page))[1];
    // The stamp box sits in the top-right corner of a landscape back.
    const stampCorner = { x: 470, y: 15, width: 115, height: 115 };
    const before = await inkInCardRect(page, back, stampCorner);

    await page.getByLabel('Address Layout').check();
    await expect.poll(async () => (await cards(page))[1].addressGuides).toBe(true);
    await expect.poll(() => inkInCardRect(page, back, stampCorner)).toBeGreaterThan(before + 20);

    const downloads = await collectDownloads(page, page.getByTitle('Export Card'), 2);
    const backPNG = await readPNG(downloads.find((d) => d.suggestedFilename() === 'card-1-back.png')!);
    // The back is plain paper: no divider, lines, stamp box or captions.
    let inked = 0;
    for (let i = 0; i < backPNG.data.length; i += 4) {
      if (backPNG.data[i] <= 245 || backPNG.data[i + 1] <= 245 || backPNG.data[i + 2] <= 245) inked++;
    }
    expect(inked).toBe(0);

    await page.getByLabel('Address Layout').uncheck();
    await expect.poll(() => inkInCardRect(page, back, stampCorner)).toBeLessThanOrEqual(before);
  });

  test('the address layout is only offered on a back', async ({ page }) => {
    await page.getByTitle('Add Card').click();
    await page.getByRole('menuitem', { name: /^Postcard/ }).click();
    await expect(page.getByTitle('Add Back')).toBeVisible();
    await expect(page.getByLabel('Address Layout')).toHaveCount(0);

    // Nor on the front once it has a back.
    await page.getByTitle('Add Back').click();
    await expect(page.getByLabel('Address Layout')).toBeVisible();
    const center = await getCanvasCenter(page);
    await page.mouse.click(center.x - 250, center.y - 200);
    await expect(page.getByTitle('Export Card')).toHaveText('Export Front & Back');
    await expect(page.getByLabel('Address Layout')).toHaveCount(0);
    await expect(page.getByTitle('Add Back')).toHaveCount(0);
  });
});
