import { test, expect, type Page } from '@playwright/test';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

// A 1×1 transparent PNG, standing in for a generated sticker.
const PIXEL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function openAndSubmit(page: Page) {
  await page.getByTitle('Generate Sticker (AI)').click();
  const dialog = page.getByRole('dialog', { name: 'Generate Sticker' });
  await dialog.getByPlaceholder('a fluffy orange cat wearing sunglasses').fill('a red balloon');
  await dialog.locator('summary').click();
  await dialog.getByPlaceholder('sk-...').fill('sk-test-not-a-real-key');
  await dialog.getByRole('button', { name: /Generate/ }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

// Maps to CLAUDE.md → "Descriptive Sticker Generation Errors"
test.describe('Descriptive Sticker Generation Errors', () => {
  test('a successful generation adds the sticker and closes the dialog', async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }) })
    );
    const dialog = await openAndSubmit(page);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTitle('Bring to Front')).toBeVisible();
  });

  test('a rejected key says so, with OpenAI\'s own message', async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Incorrect API key provided.', code: 'invalid_api_key' } }),
      })
    );
    const dialog = await openAndSubmit(page);
    const error = dialog.locator('.sticker-error');
    await expect(error).toContainText(/API key was rejected/i);
    await expect(error).toContainText('Incorrect API key provided.');
  });

  test('an unreachable server is reported as a connection problem', async ({ page }) => {
    await page.route(ENDPOINT, (route) => route.abort('internetdisconnected'));
    const dialog = await openAndSubmit(page);
    await expect(dialog.locator('.sticker-error')).toContainText(/couldn't reach OpenAI/i);
  });

  test('a request that never answers times out with an explanation', async ({ page }) => {
    await page.clock.install();
    await page.route(ENDPOINT, () => { /* never respond */ });
    const dialog = await openAndSubmit(page);
    await page.clock.fastForward('03:01');
    const error = dialog.locator('.sticker-error');
    await expect(error).toContainText(/No response from OpenAI after 180s/);
    await expect(error).toContainText(/usually takes/i);
  });

  test('the wait shows elapsed time and can be cancelled', async ({ page }) => {
    await page.clock.install();
    await page.route(ENDPOINT, () => { /* never respond */ });
    const dialog = await openAndSubmit(page);
    await page.clock.fastForward('00:25');
    await expect(dialog.locator('.sticker-progress')).toContainText(/2[5-6]s/);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.locator('.sticker-progress')).toHaveCount(0);
    await expect(dialog.locator('.sticker-error')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Generate/ })).toBeEnabled();
  });
});
