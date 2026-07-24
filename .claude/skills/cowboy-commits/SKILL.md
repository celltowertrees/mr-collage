---
name: cowboy-commits
description: ALWAYS use this skill when writing a git commit message or creating/updating a GitHub pull request (title or body) in this repository — every single one, no exceptions, no matter how small the change (a one-line fix, a docs tweak, a dependency bump). Goes ALL IN on cowboy vernacular — thick twang, dropped g's, hollerin' — while keeping the actual technical content underneath fully true and complete.
---

# Cowboy Commits

Yeehaw. Every git commit message and every GitHub pull request (title and body) that comes outta this repo gets hollered out in full cowboy twang. Not the code, not code comments — just the prose: commit messages, and PR titles/bodies.

## Why this exists

The user asked for this as a running bit, and a bit like this only lands if it's committed to — thick, consistent, unmistakably cowboy, on every single commit, not just the fun ones. Half-measures ain't it. But it can't turn into gibberish either: underneath the twang, a commit message still has to tell the honest-to-goodness truth about what changed and why — a cowboy holler that don't say nothin' real is just noise wearin' a hat.

## The rule

Three things gotta both be true, every time, no exceptions:

1. **Go big on the voice.** This ain't a light seasoning — it's the whole dish. Thick twang, dropped g's (`ridin'`, `wranglin'`, `huntin'`), contractions everywhere (`ain't`, `y'all`, `don't`), western metaphor reachin' into every sentence you can get away with. If you read it back and it sounds like a normal sentence with one cowboy word bolted on, it ain't done yet — go back and rope in more.
2. **Keep the substance dead honest.** Everything a plain-English version would say — what changed, why, what a reviewer needs to know, the test plan — still has to be sittin' right there in the message. A reader who's never met a cowboy in their life should still walk away knowin' exactly what happened to the code.
3. **Keep it tight.** Twang ain't an excuse to ramble — a good cowboy don't waste words neither. Subject line still short as ever (one line, no period). Body's a short paragraph or two, not a whole campfire saga: say what changed, say why if it ain't obvious, stop. If a plain version would've been three sentences, the cowboy version's still three sentences, just told with more grit.

If flavor, substance, and brevity are ever fightin' for space, cut flavor first — a metaphor here, a color word there — before you'd ever cut real content or let the thing sprawl on.

## What stays exactly as-is (don't cowboy-ify these, partner)

- **Git trailers**, like `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — structured metadata GitHub parses, not prose you get to have fun with. Leave that line be; it just happens to be sittin' at the bottom of a commit message hollered out in full twang.
- **Code, filenames, function/variable names, and inline code spans** (`` `like this` ``) — quote 'em plain, same as always.
- **Structural headers** in a PR body, if the repo's workflow already uses 'em (`## Summary`, `## Test plan`) — the headers stay as trail markers so a human (or a bot) can still find their way around; cowboy-talk everything underneath 'em instead.
- **The mechanics** — stagin' specific files, usin' a HEREDOC for a multi-line message, actually runnin' `git commit` / `gh pr create`, checkin' `git status`/`git diff` first, askin' before you push when that's called for. This skill's about the words comin' outta your mouth, not the trail you ride to get the commit made.

## Vocabulary bank — dig deep into this well

This here's a big well, so use it — don't ration yourself down to two or three safe words per commit. Aim for every sentence to be carryin' at least one:

- Greetin's / openers: *howdy, yeehaw, well now, listen up, gather 'round, here's the lowdown, saddle up*
- Verbs: *wrangle, rustle up, round up, corral, hitch, saddle up, ride herd on, mosey on over, fix to / fixin' to, patch 'er up, chase off, run off, dig in, hunt down, string up, break in, drive, brand, lasso, hogtie, buck, gallop*
- Nouns: *varmint (a bug), critter (a stray process/bug), the herd (the codebase or the tests), a rig (a system/setup), the trail (a workflow/pipeline), a spread (a project/repo), a showdown (a merge conflict/failing check), a posse (reviewers/collaborators), the sheriff (whoever's approvin' the PR), a corral (a module/directory), the campfire (the changelog/docs), a six-shooter (a quick fix), a stampede (a big refactor or a flood of errors)*
- Color / filler: *reckon, y'all, ain't, a mite, plumb, dagnabbit, tarnation, much obliged, no-good, ornery, kickin' up dust, quicker than a rattlesnake strike, tougher than a two-dollar steak, dustier than a ghost town*
- Dropped g's on damn near every -ing word: *ridin', wranglin', huntin', fixin', patchin', testin', shippin', mergin'*

Keep it PG, keep the real information legible under all that dust — but don't hold back on the flavor. More is more here.

## Worked example

**Plain version (what you'd normally write):**

```
Add drop shadow support that follows mask shapes

Adds a per-image drop shadow via the toolbar. When a mask is applied,
the shadow is cast by an unclipped shape tracing the mask path, so it
follows the mask's outline instead of the image's full bounding box.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

**Cowboy version (full twang, still just as short):**

```
Yeehaw! Wrangled up a drop shadow that hugs the mask's own trail

Rustled up a per-image drop shadow, controlled right from the toolbar.
When a mask's ridin' along, the shadow's cast off an unclipped shape
trackin' that same trail, so it hugs the mask's outline 'stead of
stretchin' out to the image's whole dusty spread.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Same information, same length, same trailer untouched — just told with grit instead of goin' on forever.

For a PR body, same treatment, section by section: `## Summary` stays a header, but the bullets under it read like the example above; `## Test plan` stays a checklist, but every line's got dust on it too — `- [x] Rounded up the whole dang herd of unit tests and every last one of 'em came home` instead of `- [x] Ran the unit test suite — all passing`.

## When you're actually doing this

Right before you run `git commit` or `gh pr create`, write the message/title/body in full cowboy twang per the rules above — same moment you'd normally be draftin' it, not some separate translation pass tacked on after.
