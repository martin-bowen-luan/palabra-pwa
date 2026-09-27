# Wordle validation — 2026-09-27

## Automated checks

- Full Vitest suite: 276 tests across 33 files passed.
- TypeScript and production build passed; existing large-bundle warning remains.
- Coverage includes repeat-letter allocation, keyboard priority, local variants, invalid/repeated guesses, v4→v5 preservation, transactional revisions, draft restoration, cached external words, cancellation, safe parsing and UI input.
- Whole-feature review found two issues: Enter intercepted focused keyboard buttons and a cache-read continuation could start a request after unmount. Both have regression tests and fixes. Malformed TOC handling was also tightened.
- Browser QA found native fetch's receiver binding failed before sending requests. An unbound invocation fixed it; a regression test prevents recurrence.

## Production preview browser checks

Tested at `/palabra-pwa/` using an isolated Chromium profile, without modifying the user's saved learning data.

- Open English-home Wordle entry; local `means` guess succeeds.
- Real browser calls to Wiktionary `wreck` TOC and English-section endpoints both returned HTTP 200. English definitions and revision attribution rendered. No transport fixture/proxy was needed for the successful run.
- Screenshots: light/dark at 390×844, 430×932, 768×1024 and 1440×1000; no horizontal overflow. Mobile light/dark and desktop layout visually inspected.
- Service-worker-controlled offline reload restored the game. Local `apple` completed the game offline, followed by a new game accepting cached `wreck` offline.
- Uncached `quaff` under network disconnection showed an error, retained the draft, and consumed no attempt. Network emulation can leave `navigator.onLine` true; the fetch failure is still handled safely.
- No uncaught browser page errors.

## Limits and delivery

Real-device Safari and screen-reader checks were not performed. External dictionary availability still depends on the user's network and Wiktionary service. Changes remain local on `codex/wordle`; no push, merge or public deployment was performed.

## ECDICT Chinese supplement — 2026-09-27

- Branch `codex/wordle-chinese`, base `a754fbf` (the preceding Wordle release has since been deployed).
- 285 tests / 35 files, TypeScript, production build and diff checks passed. Existing large-bundle warning remains.
- Fixed upstream revision and SHA-256 checked; reproducible import produces 19,282 unique lowercase five-letter Chinese entries. Source CSV stays outside the repository. The 1,095.68 kB generated chunk compresses to 457.47 kB gzip in the production build.
- Lookup remains original vocabulary first, then ECDICT, cache and Wiktionary. Restored guesses prefer Chinese without changing scores/drafts/answer pool. English-only fallback definitions are hidden.
- Isolated Chromium at the production subpath: `wreck` shows Chinese with zero external requests; sampled submit-to-render time 33–35 ms on this host (not a mobile performance guarantee). Mobile light/dark screenshots inspected.
- Service-worker offline reload restores the game, `quaff` works as a fresh offline guess, and the bundled MIT license remains available offline. No uncaught page errors.
- Code review identified supplemental chunk failure blocking otherwise valid games. Regression test and browser fault injection now verify a visible notice with continued original-vocabulary/cache play. No important review findings remain open.
- This change does not re-audit every upstream translation or establish rights to every underlying upstream source. Source attribution and upstream license are retained. Real-device Safari remains untested.
- ECDICT change is local only: no push or deployment in this task.
