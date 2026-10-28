import { test, expect, type Page } from '@playwright/test';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

// A 1×1 transparent PNG, standing in for a generated sticker.
const PIXEL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Answers every generation request with a sticker, recording the request body sent.
async function captureBodies(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(ENDPOINT, (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }) });
  });
  return bodies;
}

async function generate(page: Page, style?: string) {
  await page.getByTitle('Generate Sticker (AI)').click();
  const dialog = page.getByRole('dialog', { name: 'Generate Sticker' });
  await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill('cat smoking a cigar');
  if (style) await dialog.getByLabel('Style').selectOption({ label: style });
  await dialog.locator('summary').click();
  await dialog.getByPlaceholder('sk-...').fill('sk-test-not-a-real-key');
  await dialog.getByRole('button', { name: /Generate/ }).click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Transparent Sticker Output"
test.describe('Transparent Sticker Output', () => {
  test('a sticker request asks for a transparent PNG', async ({ page }) => {
    const bodies = await captureBodies(page);
    await generate(page);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].background).toBe('transparent');
    expect(bodies[0].output_format).toBe('png');
  });

  test('the prompt asks for an isolated subject with no scenery', async ({ page }) => {
    const bodies = await captureBodies(page);
    await generate(page, 'Real Photograph');
    const prompt = bodies[0].prompt as string;
    expect(prompt.startsWith('A real photograph of cat smoking a cigar.')).toBe(true);
    expect(prompt).toMatch(/isolated/i);
    expect(prompt).toMatch(/transparent background/i);
    expect(prompt).toMatch(/no scenery/i);
  });
});
