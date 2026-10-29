import { test, expect, type Page } from '@playwright/test';

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

function stageViewport(page: Page) {
  return page.evaluate(() => {
    const stage = (window as unknown as { Konva: { stages: { scaleX: () => number; x: () => number; y: () => number }[] } })
      .Konva.stages[0];
    return { x: stage.x(), y: stage.y(), scale: stage.scaleX() };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.mouse.move(640, 360);
});

// Maps to CLAUDE.md → "Responsive Canvas Rendering"
test.describe('Wheel zoom settles before it is saved', () => {
  test('a burst of wheel zooms is saved once, at the zoom it settles on', async ({ page }) => {
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
    const settled = await stageViewport(page);
    expect(settled.scale).toBeGreaterThan(1.3);

    await expect.poll(async () => (await readState(page)).stageScale).toBeCloseTo(settled.scale, 6);
    const saved = await readState(page);
    expect(saved.stagePosition.x).toBeCloseTo(settled.x, 6);
    expect(saved.stagePosition.y).toBeCloseTo(settled.y, 6);
  });

  test('the settled zoom survives a reload', async ({ page }) => {
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
    const settled = await stageViewport(page);
    await expect.poll(async () => (await readState(page)).stageScale).toBeCloseTo(settled.scale, 6);

    await page.reload();
    await expect.poll(async () => (await stageViewport(page)).scale).toBeCloseTo(settled.scale, 6);
  });
});
