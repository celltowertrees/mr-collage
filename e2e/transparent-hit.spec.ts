import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

type KNode = { id: () => string };
type KStage = { findOne: (s: string) => (KNode & { nodes: () => KNode[] }) | undefined };

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

async function upload(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const before = (await imageIds(page)).length;
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect.poll(async () => (await imageIds(page)).length).toBe(before + 1);
  await frames(page);
}

// A 300×300 PNG that is transparent except for an opaque blue circle of
// radius 100 in the middle — a sticker with a clear background.
async function transparentSticker(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1e40ff';
    ctx.beginPath();
    ctx.arc(150, 150, 100, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function getCanvasCenter(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Pixel-Accurate Selection on Transparent Images"
test.describe('Pixel-Accurate Selection on Transparent Images', () => {
  // The orange square sits 200px right of centre; the sticker lands on top of
  // it at centre, so the sticker's clear bottom-right corner covers orange.
  async function setup(page: Page) {
    const center = await getCanvasCenter(page);
    await upload(page, FIXTURE);
    await drag(page, center, { x: center.x + 200, y: center.y });
    await expect.poll(async () => (await readState(page)).images[0].x).toBeGreaterThan(center.x + 100);
    await upload(page, await transparentSticker(page));
    const [orange, sticker] = await imageIds(page);
    return { center, orange, sticker };
  }

  test('clicking a transparent part of a sticker selects what is visible beneath it', async ({ page }) => {
    const { center, orange } = await setup(page);
    await page.mouse.click(center.x + 130, center.y + 130);
    await expect.poll(() => selectedIds(page)).toEqual([orange]);
  });

  test('clicking the opaque part of a sticker selects the sticker', async ({ page }) => {
    const { center, orange, sticker } = await setup(page);
    await page.mouse.click(center.x + 130, center.y + 130);
    await expect.poll(() => selectedIds(page)).toEqual([orange]);
    await page.mouse.click(center.x + 20, center.y + 20);
    await expect.poll(() => selectedIds(page)).toEqual([sticker]);
  });

  test('clicking a sticker’s transparent part over empty canvas clears the selection', async ({ page }) => {
    const { center } = await setup(page);
    await page.mouse.click(center.x - 130, center.y - 130);
    await expect.poll(() => selectedIds(page)).toEqual([]);
  });

  test('an opaque image still selects anywhere inside its box', async ({ page }) => {
    const center = await getCanvasCenter(page);
    await upload(page, FIXTURE);
    const [orange] = await imageIds(page);
    await page.mouse.click(center.x + 400, center.y + 250); // empty canvas
    await expect.poll(() => selectedIds(page)).toEqual([]);
    await page.mouse.click(center.x + 140, center.y + 140); // near its corner
    await expect.poll(() => selectedIds(page)).toEqual([orange]);
  });
});
