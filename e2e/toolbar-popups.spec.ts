import { test, expect, type Page, type Locator } from '@playwright/test';

// Reads a popup's own background and its options' text colour, and reports
// both the background's alpha and the WCAG contrast ratio between the two.
// A popup that paints no panel (alpha 0) or paints text the same colour as
// what's behind it is one the user simply cannot see, which is the whole
// point of these assertions.
async function legibility(popup: Locator) {
  return popup.evaluate((el) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: m[0] ?? 0, g: m[1] ?? 0, b: m[2] ?? 0, a: m[3] ?? 1 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bg = parse(getComputedStyle(el).backgroundColor);
    // The selected option is deliberately painted in the accent style;
    // measure a plain one, which is what most of the menu looks like.
    const option = el.querySelector('[role="menuitem"]:not(.active)');
    const fg = parse(getComputedStyle(option ?? el).color);
    const [hi, lo] = [luminance(bg), luminance(fg)].sort((a, b) => b - a);
    return { alpha: bg.a, contrast: (hi + 0.05) / (lo + 0.05) };
  });
}

async function addCube(page: Page) {
  await page.getByTitle('Add 3D Object').click();
  await page.getByRole('menuitem', { name: 'Cube', exact: true }).click();
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Legible Toolbar Popup Menus"
test.describe('Legible Toolbar Popup Menus', () => {
  test('the 3D shape menu is drawn on an opaque, readable panel', async ({ page }) => {
    await page.getByTitle('Add 3D Object').click();
    const popup = page.locator('.blend-mode-popup');
    await expect(popup).toBeVisible();

    // Every shape really is in the menu — the bug was never a missing list.
    await expect(popup.getByRole('menuitem')).toHaveCount(7);
    await expect(popup.getByRole('menuitem', { name: 'Torus Knot' })).toBeVisible();

    const { alpha, contrast } = await legibility(popup);
    expect(alpha).toBeGreaterThanOrEqual(0.9);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('the blend mode and texture menus use the same readable panel', async ({ page }) => {
    await addCube(page);

    await page.getByTitle('Blend Mode').click();
    let popup = page.locator('.blend-mode-popup');
    await expect(popup).toBeVisible();
    let seen = await legibility(popup);
    expect(seen.alpha).toBeGreaterThanOrEqual(0.9);
    expect(seen.contrast).toBeGreaterThanOrEqual(4.5);
    await page.getByTitle('Blend Mode').click();

    await page.getByTitle('Texture').click();
    popup = page.locator('.blend-mode-popup');
    await expect(popup).toBeVisible();
    seen = await legibility(popup);
    expect(seen.alpha).toBeGreaterThanOrEqual(0.9);
    expect(seen.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('menu options still pick their value', async ({ page }) => {
    await addCube(page);
    const state = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));

    await page.getByTitle('Blend Mode').click();
    await page.getByRole('menuitem', { name: 'Multiply' }).click();
    await expect.poll(async () => (await state()).images.at(-1).blendMode).toBe('multiply');
  });
});
