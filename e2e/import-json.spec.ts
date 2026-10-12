import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

// A one-node collage holding a single text object, written the way Export
// JSON writes it.
const TEXT_FILE = {
  name: 'collage-icp.json',
  mimeType: 'application/json',
  buffer: Buffer.from(
    JSON.stringify({
      'infinite-canvas': {
        version: '0.2',
        viewport: { position: { x: 40, y: 30 }, scale: 1.5 },
        nodes: [
          {
            id: 'imported-text',
            type: 'text',
            position: { x: 120, y: 80 },
            size: { width: 200, height: 40 },
            baseSize: { width: 200, height: 40 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            data: {
              text: 'Imported',
              name: 'Text',
              fontFamily: 'Roboto',
              fontSize: 32,
              bold: false,
              italic: false,
              underline: false,
              color: '#000000',
            },
          },
        ],
      },
    })
  ),
};

interface StoredObject {
  id: string;
  kind: string;
  text?: string;
  zIndex: number;
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

async function objects(page: Page): Promise<StoredObject[]> {
  return (await readState(page)).images ?? [];
}

async function uploadFixtureImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTitle('Bring to Front')).toBeVisible();
}

async function chooseImportFile(page: Page, file: typeof TEXT_FILE) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTitle('Import ICP JSON').click(),
  ]);
  await chooser.setFiles(file);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Maps to CLAUDE.md → "Import a Collage from ICP JSON"
test.describe('Import a Collage from ICP JSON', () => {
  test('importing onto an empty canvas loads the file without asking', async ({ page }) => {
    await chooseImportFile(page, TEXT_FILE);

    await expect.poll(async () => (await objects(page)).map((o) => o.text)).toEqual(['Imported']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The file's pan and zoom come with it when nothing was there to keep.
    await expect.poll(async () => (await readState(page)).stageScale).toBe(1.5);
  });

  test('importing over existing objects asks whether to add or replace', async ({ page }) => {
    await uploadFixtureImage(page);
    await chooseImportFile(page, TEXT_FILE);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add to Canvas' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Replace Canvas' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('Add to Canvas keeps what is there and stacks the imported objects on top', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    const [existing] = await objects(page);

    await chooseImportFile(page, TEXT_FILE);
    await page.getByRole('button', { name: 'Add to Canvas' }).click();

    await expect.poll(async () => (await objects(page)).length).toBe(2);
    const all = await objects(page);
    const imported = all.find((o) => o.kind === 'text')!;
    expect(all.find((o) => o.id === existing.id)).toBeTruthy();
    expect(imported.text).toBe('Imported');
    expect(imported.zIndex).toBeGreaterThan(existing.zIndex);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Replace Canvas swaps the current objects for the file', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(1);

    await chooseImportFile(page, TEXT_FILE);
    await page.getByRole('button', { name: 'Replace Canvas' }).click();

    await expect.poll(async () => (await objects(page)).map((o) => o.kind)).toEqual(['text']);
    await expect.poll(async () => (await readState(page)).stageScale).toBe(1.5);
  });

  test('Cancel leaves the canvas untouched', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    const before = await objects(page);

    await chooseImportFile(page, TEXT_FILE);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await objects(page)).toEqual(before);
  });

  test('an import is undone in a single step', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(1);

    await chooseImportFile(page, TEXT_FILE);
    await page.getByRole('button', { name: 'Replace Canvas' }).click();
    await expect.poll(async () => (await objects(page)).map((o) => o.kind)).toEqual(['text']);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await objects(page)).map((o) => o.kind)).toEqual(['image']);
  });

  test('an exported collage imports back and survives a reload', async ({ page }) => {
    await uploadFixtureImage(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('Export ICP JSON').click(),
    ]);
    const exported = path.join(test.info().outputDir, 'collage-icp.json');
    await download.saveAs(exported);

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTitle('Import ICP JSON').click(),
    ]);
    await chooser.setFiles(exported);
    await page.getByRole('button', { name: 'Add to Canvas' }).click();
    await expect.poll(async () => (await objects(page)).length).toBe(2);
    const ids = (await objects(page)).map((o) => o.id);
    // The copy gets its own id, so its image data is stored separately.
    expect(new Set(ids).size).toBe(2);

    await page.reload();
    // loadState skips an image whose blob is missing, and the next save then
    // drops it from the metadata — so two objects still standing after a
    // reload-and-save, each with its own blob, means nothing was lost.
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(3);
    for (const id of ids) {
      const blob = await page.evaluate(
        (key) =>
          new Promise<string | undefined>((resolve) => {
            const open = indexedDB.open('mr-collage-db');
            open.onsuccess = () => {
              const req = open.result.transaction('images', 'readonly').objectStore('images').get(key);
              req.onsuccess = () => resolve(req.result as string | undefined);
              req.onerror = () => resolve(undefined);
            };
            open.onerror = () => resolve(undefined);
          }),
        id
      );
      expect(blob).toMatch(/^data:image\//);
    }
  });

  test('an unreadable file shows an error and changes nothing', async ({ page }) => {
    await uploadFixtureImage(page);
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    const before = await objects(page);

    await chooseImportFile(page, { ...TEXT_FILE, buffer: Buffer.from('not json') });

    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await objects(page)).toEqual(before);
  });
});
