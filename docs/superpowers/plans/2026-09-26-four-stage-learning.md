# Four-stage learning implementation plan

**Goal:** Implement separate English learning/review, four group rounds, actionable mistakes and priority review.
**Architecture:** Pure session/spacing/diff functions; AppState handles atomic storage; dedicated English study component and selectable word relations.
**Tech stack:** Existing React, TypeScript, IndexedDB, CSS Modules, Vitest.
**Spec:** ../specs/2026-09-26-four-stage-learning.md

- [x] Domain: add session round/mode/skips, isolated group generation, expanding-spacing review priority, spelling alignment. Test stage transitions, repeat/skip, due boundary and overdue fairness.
- [x] State/storage: integrate four-stage start/answer/next/skip/fluent, retain legacy session path and atomic revision checks. Refresh due data on focus and each minute.
- [x] UI: separate learning/review actions, four-round study, answer-check recall and spelling diff, result skip count and correct next-group action.
- [x] Word detail: source-backed relation enrichment and selectable tabs, preserve irregular forms and offline sources.
- [x] Verification: focused domain tests, complete app flows including reload and skip persistence, full suite/typecheck/build, browser mobile and offline smoke checks.

Review focus: unfinished legacy sessions; simultaneous tabs; skip at final item; same word repeating with fresh input; no due review and full new-word goal.

Execution decisions: implement inline; user supplied the stage clarification and authorized these changes. Keep source-backed relation coverage explicit rather than guessing roots from spelling. No production deployment is included in this feature-edit request.

Browser QA: isolated Chromium production preview under `/palabra-pwa/`; 390×844, 430×932, 768×1024 and 1440×900 screenshots inspected, no horizontal overflow. Light/dark home, four rounds, misspelling diff, offline reload of persisted wrong-answer feedback, immediate retry/delayed repeat, offline completion and final-word skip all exercised. IndexedDB confirmed one scheduling update per word, and skipped priority persisted. Source-backed root tabs worked offline. No uncaught page errors. This is browser emulation, not physical iOS device testing.

Independent review found an affix import defect (legacy suffix `ant` was resolved as the noun “ant”). Added failing importer and shipped-corpus regression tests, then normalized legacy prefix/suffix positions before dictionary lookup and regenerated source-backed data. Also fixed a zero-count distractor fallback that had emitted more than four choices in a large corpus.

Final verification (2026-09-26): 109 tests across 19 files passed; TypeScript check and production build passed; `git diff --check` clean. The build retains a non-blocking large-JavaScript-chunk warning (bundled offline vocabulary). Regenerated relations cover 948 words: 544 with components, 422 with derived terms (18 overlap). Missing relationships remain explicit empty states.
