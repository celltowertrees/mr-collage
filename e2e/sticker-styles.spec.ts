import { test, expect, type Page } from '@playwright/test';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

// A 1×1 transparent PNG, standing in for a generated sticker.
const PIXEL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Answers every generation request with a sticker, recording the prompt sent.
async function capturePrompts(page: Page) {
  const prompts: string[] = [];
  await page.route(ENDPOINT, (route) => {
    prompts.push(JSON.parse(route.request().postData() ?? '{}').prompt);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }) });
  });
  return prompts;
}

async function openDialog(page: Page) {
  await page.getByTitle('Generate Sticker (AI)').click();
  const dialog = page.getByRole('dialog', { name: 'Generate Sticker' });
  await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill('cat smoking a cigar');
  await dialog.locator('summary').click();
  await dialog.getByPlaceholder('sk-...').fill('sk-test-not-a-real-key');
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Sticker Style Presets"
test.describe('Sticker Style Presets', () => {
  test('the style menu offers the preset styles', async ({ page }) => {
    const dialog = await openDialog(page);
    const options = dialog.getByLabel('Style').locator('option');
    await expect(options).toHaveText(['None', 'Real Photograph', 'Line Drawing', 'Fine Art Illustration', 'Clip Art']);
  });

  test('a picked style leads the prompt', async ({ page }) => {
    const prompts = await capturePrompts(page);
    const dialog = await openDialog(page);
    await dialog.getByLabel('Style').selectOption({ label: 'Real Photograph' });
    await dialog.getByRole('button', { name: /Generate/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].startsWith('A real photograph of cat smoking a cigar.')).toBe(true);
  });

  test('the picked style is spelled out before the sticker instructions', async ({ page }) => {
    const prompts = await capturePrompts(page);
    const dialog = await openDialog(page);
    await dialog.getByLabel('Style').selectOption({ label: 'Real Photograph' });
    await dialog.getByRole('button', { name: /Generate/ }).click();
    await expect(dialog).toHaveCount(0);
    const prompt = prompts[0];
    const styleAt = prompt.search(/photorealistic/i);
    expect(styleAt).toBeGreaterThan(0);
    expect(prompt).toMatch(/not an illustration/i);
    expect(styleAt).toBeLessThan(prompt.search(/transparent background/i));
  });

  test('with no style picked the prompt is sent as typed', async ({ page }) => {
    const prompts = await capturePrompts(page);
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: /Generate/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(prompts[0].startsWith('cat smoking a cigar.')).toBe(true);
  });
});
