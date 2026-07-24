---
name: log-feature-request
description: Use this skill whenever the user asks Claude to build, add, fix, or change how this codebase behaves — phrases like "I'd like to be able to...", "add a feature", "I want to add", "can we build", "it would be great if", "can you make it so", "fix it so that", or any request that adds or changes observable, testable behavior (new UI capability, storage/persistence changes, architecture changes with user-visible effects). Drafts Gherkin scenarios for the request and writes a real failing test from them (Vitest or Playwright, whichever fits) BEFORE the feature itself is implemented, then logs the request as a standardized CLAUDE.md changelog entry once the feature is done and the test passes — so CLAUDE.md stays a running record of the app's testable surface area, and every entry is backed by a real test from day one instead of a test written later.
---

# Log Feature Request

This project keeps a running changelog of feature work in `CLAUDE.md` under a `## Features` section. Every time the user asks for new functionality, that request gets logged as a standardized entry once the work is done.

## Why this exists

`CLAUDE.md` is the first thing read at the start of every session in this repo. A living log of "what was asked for, and what got built" gives future sessions (and the user) a quick way to see the app's history without digging through git log or guessing from the code — and doubles as a map of the app's testable surface area, so tests can be written against documented behavior later. It's a changelog, not a spec — keep entries short.

## When to log

Log a new entry for anything that adds or changes **observable, testable behavior** — this is broader than just new UI. It includes:
- New user-facing capabilities (a new tool, control, or interaction)
- Storage/persistence or data-format changes (e.g. what gets saved, how it's loaded, what happens on failure)
- Architecture changes with effects someone could write a test against, even without new UI

Skip things that have no behavior of their own to test:
- Pure styling/formatting passes with no functional change
- Config/tooling changes (lint rules, CI, dependency bumps) that don't alter app behavior
- Typo or comment-only fixes
- Small tweaks to an already-logged feature (e.g. changing a default slider value) — unless substantial enough to be its own entry

If you're unsure whether something counts, err toward logging it — a short unnecessary entry costs little, but a missing one loses history and leaves behavior undocumented for future tests.

## Workflow: test-first, not test-eventually

This is the part that makes the changelog worth more than a wiki page: the test for a new scenario gets written — and confirmed failing — **before** the feature exists, not backfilled after. That's the difference between "documented so tests could theoretically be written later" and "every entry in CLAUDE.md is already backed by a real, currently-green test." Skipping straight to implementation and writing the test after is the one thing this skill exists to prevent.

1. **At request time**, note today's date (from the `currentDate` context if available, otherwise ask or infer), a one-line summary of what the user asked for, and draft the Gherkin `Scenario`s for the behavior being requested — the happy path plus any obvious edge cases. This is the same Gherkin that'll eventually go in CLAUDE.md; writing it now, before any code, is what turns it into a real spec instead of a retroactive description.
2. **Turn those scenarios into a real test, before touching the feature code.** Pick the right layer:
   - Pure logic — no rendering, no DOM, no canvas (data transforms, storage, exports) → a Vitest test under `src/__tests__/*.test.ts`, following the pattern in `src/__tests__/store.test.ts`.
   - Anything involving Konva rendering, canvas pixels, or toolbar/UI interaction → a Playwright spec under `e2e/*.spec.ts`, following the patterns in `e2e/masking.spec.ts` and `e2e/drop-shadow.spec.ts` (pixel sampling for visual behavior, `expect.poll` after interactions that write to state asynchronously, etc.).
   Each Gherkin `Scenario` should map to one test case (or one clear assertion within a test) — don't write vaguer tests than the scenarios already describe.
3. **Run the new test and confirm it fails.** A failing test is the checkpoint that proves the test actually exercises the not-yet-built behavior, rather than trivially passing against nothing. If it passes before the feature exists, the test isn't testing the right thing — fix the test, not the "problem."
4. **Now implement the feature** — plan, implement, iterate — until the new test(s) pass, and the full existing suite (`npm test`, `npm run test:e2e`) still passes too.
5. **Once everything's green**, append an entry to the `## Features` section of `CLAUDE.md` (create the file and section if they don't exist yet — see template below) using the same Gherkin scenarios from step 1 (adjust only if implementation revealed the scenario itself was wrong, not just to describe mechanics), plus a pointer to the test file(s) that cover it.
6. Mention to the user, in passing, that you've logged it and where the test lives (one short clause — don't make a big deal of it).

If a scenario is genuinely impossible to pin down before any code exists — some exploratory spike is needed to even know what the right behavior is — it's fine to prototype first, but write the test the moment the behavior is clear and confirm it fails before finishing the implementation. That should be the rare exception, not the default.

## CLAUDE.md structure

If `CLAUDE.md` doesn't exist yet, create it with at least this section (other sections can coexist above/below it — don't clobber existing content):

```markdown
## Features

<entries go here, newest last>
```

## Entry format

Append each new entry to the end of the `## Features` section using this exact template. The implementation is written as **Gherkin** (`Feature` / `Scenario` / `Given`/`When`/`Then`) instead of prose — because by the time you're logging it, these scenarios are already the real spec a real test was written from (see the workflow above), not a description written after the fact. Describe *behavior* (inputs, actions, observable outcomes), not internal mechanics.

````markdown
### <Feature Title>
- **Requested:** <YYYY-MM-DD>
- **Ask:** <one-sentence summary of what the user asked for, in their words where reasonable>

```gherkin
Feature: <Feature Title>
  # <key source files touched> — tested in <test file(s), e.g. src/__tests__/foo.test.ts or e2e/foo.spec.ts>

  Scenario: <short description of one behavior>
    Given <starting state>
    When <action taken>
    Then <observable, checkable outcome>

  Scenario: <another distinct behavior — edge case, failure mode, etc.>
    Given ...
    When ...
    Then ...
```
````

Cover the feature's distinct behaviors as separate `Scenario`s — the happy path, plus meaningful edge cases or failure modes (e.g. "mask present" vs "no mask", "storage succeeds" vs "blob is missing on load"). Two to four scenarios is typical; don't force scenarios that don't exist just to pad the list, and don't describe implementation details (function names, data structures) inside `Given`/`When`/`Then` — those belong in the file-pointer comment, not the behavior spec. Every scenario listed here should correspond to a passing test — if you find yourself writing a scenario with no test behind it, go write that test before finishing up.

**Example:**

````markdown
### Drop Shadow on Masked Objects
- **Requested:** 2026-07-24
- **Ask:** Add a drop shadow to any object that follows the shape of its mask, if one is applied.

```gherkin
Feature: Drop Shadow on Masked Objects
  # src/types.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx, src/store.ts — tested in e2e/drop-shadow.spec.ts

  Scenario: Shadow on an unmasked image
    Given an image has no mask applied
    When the user enables Drop Shadow in the toolbar
    Then a shadow is cast directly from the image, following its alpha silhouette

  Scenario: Shadow on a masked image
    Given an image has a mask applied (circle, rectangle, or polygon)
    When the user enables Drop Shadow
    Then the shadow follows the outline of the mask shape rather than the image's full bounding box

  Scenario: Adjust shadow appearance
    Given Drop Shadow is enabled on an image
    When the user changes the shadow color, blur, offset, or opacity in the toolbar
    Then the rendered shadow updates to match
```
````

Keep the title short (3-6 words) and specific enough to distinguish it from other entries — it's a heading, not a sentence.
