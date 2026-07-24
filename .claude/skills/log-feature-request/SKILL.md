---
name: log-feature-request
description: Use this skill whenever the user asks Claude to build, add, fix, or change how this codebase behaves — phrases like "I'd like to be able to...", "add a feature", "I want to add", "can we build", "it would be great if", "can you make it so", "fix it so that", or any request that adds or changes observable, testable behavior (new UI capability, storage/persistence changes, architecture changes with user-visible effects). Logs the request as a standardized changelog entry in CLAUDE.md once the work is implemented, so CLAUDE.md stays a running record of the app's testable surface area — what it does, why, and where to look — for writing tests against later.
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

## Workflow

1. **At request time**, note today's date (from the `currentDate` context if available, otherwise ask or infer) and a one-line summary of what the user asked for. Don't write to CLAUDE.md yet — you don't know the implementation details until the work is done.
2. **Do the feature work as normal** — plan, implement, verify.
3. **Once the feature is complete**, append an entry to the `## Features` section of `CLAUDE.md` (create the file and section if they don't exist yet — see template below) describing the resulting behavior as Gherkin scenarios. Not a design doc — just enough that someone (or a future test) can read the scenarios and know exactly what to check.
4. Mention to the user that you've logged it, in passing (one short clause is enough — don't make a big deal of it).

## CLAUDE.md structure

If `CLAUDE.md` doesn't exist yet, create it with at least this section (other sections can coexist above/below it — don't clobber existing content):

```markdown
## Features

<entries go here, newest last>
```

## Entry format

Append each new entry to the end of the `## Features` section using this exact template. The implementation is written as **Gherkin** (`Feature` / `Scenario` / `Given`/`When`/`Then`) instead of prose — the point is that each entry doubles as a spec someone can turn directly into an automated test later, so describe *behavior* (inputs, actions, observable outcomes), not internal mechanics.

````markdown
### <Feature Title>
- **Requested:** <YYYY-MM-DD>
- **Ask:** <one-sentence summary of what the user asked for, in their words where reasonable>

```gherkin
Feature: <Feature Title>
  # <key files/components touched, comma-separated — a Gherkin comment>

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

Cover the feature's distinct behaviors as separate `Scenario`s — the happy path, plus meaningful edge cases or failure modes (e.g. "mask present" vs "no mask", "storage succeeds" vs "blob is missing on load"). Two to four scenarios is typical; don't force scenarios that don't exist just to pad the list, and don't describe implementation details (function names, data structures) inside `Given`/`When`/`Then` — those belong in the file-pointer comment, not the behavior spec.

**Example:**

````markdown
### Drop Shadow on Masked Objects
- **Requested:** 2026-07-24
- **Ask:** Add a drop shadow to any object that follows the shape of its mask, if one is applied.

```gherkin
Feature: Drop Shadow on Masked Objects
  # src/types.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx, src/store.ts

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
