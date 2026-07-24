# MR. COLLAGE 🤠

Yeehaw, and welcome to the spread. MR. COLLAGE is a digital collage builder on an infinite canvas — drag your pictures in, rope 'em into whatever shape suits you, slap a shadow on 'em, and ride off into a JPEG or a JSON file when you're done.

Built on React, TypeScript, Vite, and Konva (via react-konva) for the canvas rendering.

## What this rig can do

- **Bring in the herd** — upload images, paste 'em straight from your clipboard, or drag-and-drop a whole bunch onto the canvas at once
- **Roam free** — pan and zoom across an infinite canvas, no fences in sight
- **Wrangle each image** — drag, resize, rotate, adjust opacity, and reorder front-to-back, all per image
- **Mask 'em into shape** — circle, rectangle, or freeform polygon; draw right on the canvas and clear it whenever you're done with it
- **Cast a shadow** — drop shadows follow whatever mask you've thrown on, not just the image's plain ol' bounding box (color, blur, offset, and opacity, all tunable from the toolbar)
- **Keyboard shortcuts** — `V` to select, `H` to pan, hold `Space` to pan on the fly, `Delete`/`Backspace` to send an image packin'
- **Ride out with your work** — export a JPEG cropped to your content, or an ICP JSON file describing the whole spread (position, size, rotation, masks, shadows, the works)
- **Nothin' gets lost** — auto-saves as you go; image data lives in IndexedDB, everything else in localStorage, so a big collage won't run you into a storage quota fence

Every feature's got its own changelog entry over in [`CLAUDE.md`](CLAUDE.md), written up as Gherkin scenarios — what was asked for, and exactly how it behaves.

## Saddlin' up (getting started)

```bash
npm install
npm run dev
```

That'll get the dev server runnin' — open up the URL it hollers back at you and start wranglin'.

## The rest of the toolshed

| Command | What it does |
|---|---|
| `npm run dev` | Fire up the dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | Round up any lint varmints |
| `npm run typecheck` | Make sure TypeScript's happy, no build needed |
| `npm test` | Run the Vitest unit tests (pure logic — storage, export, no canvas involved) |
| `npm run test:e2e` | Run the Playwright end-to-end tests against a real browser (masking, drop shadow — anything that needs real canvas rendering) |

## How it's tested

There's two herds of tests here, and each one covers different ground:

- **Vitest** (`src/__tests__/`) handles pure logic — data transforms, storage, export — nothin' that needs a screen.
- **Playwright** (`e2e/`) drives a real Chromium browser, since Konva needs genuine canvas rendering to test properly — mockin' the canvas can't catch a shadow that's bein' clipped when it shouldn't be.

Every PR gets run through both, plus a lint and typecheck pass, courtesy of GitHub Actions (see `.github/workflows/ci.yml`).

## Ridin' with Claude Code

This repo's got a couple of project skills tucked under `.claude/skills/` worth knowin' about:

- **`log-feature-request`** — every new feature gets a test written first (Gherkin scenarios → a real failing test → then the implementation), and a changelog entry in `CLAUDE.md` once it's all green.
- **`cowboy-commits`** — every commit message and pull request round these parts gets told in full cowboy twang. This here README, however, was a special request — most days it stays in plain English.
