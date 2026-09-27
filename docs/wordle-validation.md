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
