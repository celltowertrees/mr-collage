import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'orange-square.png');

// Listens in on React's commits the way React DevTools does — through the
// global hook every renderer (react-dom AND react-konva's) reports to — and
// records the id of every CollageImageNode that actually re-rendered. A
// subtree React skipped entirely keeps the very same child fiber, so it's not
// walked; a memo bailout clones the fiber without the PerformedWork flag. The
// name is matched loosely because the dev build may suffix a memo-wrapped
// function's name (CollageImageNode2) to avoid a clash with its binding.
function installRenderProbe() {
  const PERFORMED_WORK = 1;
  const w = window as unknown as { __renderedImageIds: string[] };
  w.__renderedImageIds = [];
  let nextId = 1;
  type Fiber = {
    child: Fiber | null;
    sibling: Fiber | null;
    alternate: Fiber | null;
    flags: number;
    type: { name?: string } | null;
    memoizedProps: { image?: { id: string } } | null;
  };
  const walk = (fiber: Fiber | null) => {
    for (let f = fiber; f; f = f.sibling) {
      if (f.alternate && /^CollageImageNode\d*$/.test(f.type?.name ?? '') && (f.flags & PERFORMED_WORK) !== 0) {
        const id = f.memoizedProps?.image?.id;
        if (id) w.__renderedImageIds.push(id);
      }
      if (!f.alternate || f.child !== f.alternate.child) walk(f.child);
    }
  };
  (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject: () => nextId++,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => walk(root.current),
    onPostCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
  };
}

function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mr-collage-state') ?? '{}'));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installRenderProbe);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe('Render isolation', () => {
  test('adjusting one object re-renders only that object', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.locator('input[type="file"]').setInputFiles(FIXTURE);
      await expect.poll(async () => (await readState(page)).images?.length).toBe(i + 1);
    }
    const ids: string[] = (await readState(page)).images.map((img: { id: string }) => img.id);
    const selectedId = ids[2]; // each upload selects itself; the last one stays selected
    await expect(page.getByTitle('Bring to Front')).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __renderedImageIds: string[] }).__renderedImageIds = [];
    });
    await page.locator('label.toolbar-field', { hasText: 'Opacity' }).locator('input[type="range"]').fill('0.5');
    await expect.poll(async () => (await readState(page)).images[2].opacity).toBe(0.5);

    const rendered = await page.evaluate(
      () => (window as unknown as { __renderedImageIds: string[] }).__renderedImageIds
    );
    expect(rendered.length).toBeGreaterThan(0);
    expect(new Set(rendered)).toEqual(new Set([selectedId]));
  });
});
