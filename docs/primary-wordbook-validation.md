# Shared English wordbooks — release validation

Validated on 2026-10-01. User explicitly authorized implementation and deployment.

## Data and compatibility

- Oxford primary: 1,047 unique terms, 12 grade/semester books, 1,164 memberships.
- Shared dictionary: 3,707 IDs; all 3,464 existing IDs retained, 804 overlaps and 243 additions. Existing English progress is keyed by the same IDs.
- IndexedDB v7 installs dictionary, catalogues and metadata atomically. English corpus revision 6 / primary catalogue revision 2 also refresh interim local preview data without clearing progress.
- Original 85 MB download is not committed. Generated data contains selected fields only; the release scan found no raw HTML fields, absolute user path or known credential prefixes.
- Original eight missing bilingual examples filled with reviewed editorial sentences. Additional broken, unrelated or incorrect examples were replaced or excluded; 52 editorial entries record the decisions. Four requested definition corrections and toucan terminology have dictionary reference URLs.
- All rows checked automatically; all initially flagged entries and editorial additions inspected, plus one sample from each of twelve source books. Remaining 48 warnings were inspected: short legitimate sentences, inflected forms, possessive substitutions or hyphen/space variants. The entire source corpus has NOT received a sentence-by-sentence human editorial review. Source attribution is retained; access to a website does not itself establish publication rights.

## Automated evidence

- Baseline: 389 tests. Final: **427 tests in 55 files passed**.
- `npm run check:wordbooks`, `npm run typecheck`, `npm run build`, `git diff --check`: passed.
- Migration/preservation, failed-import rollback, shared progress and quota, range selection, session provenance, concurrent selections, clear-English scope, Wordle/high-school audio boundaries and AI input-based cache covered.
- Regression tests first reproduced the language/book in-flight-save race, grade-semester ordering issue and Spanish retry/continue focus loss; all passed after fixes.
- Production PWA: 118 precached assets (~12 MB), including both dictionaries. English data is a separate chunk under the existing 5 MiB per-file cache limit; the non-fatal large-chunk advisory remains.

## Browser evidence

Used disposable local browser origin `http://127.0.0.1:4190/palabra-pwa/`; did not clear or modify the user's production learning records.

- Oxford grade/semester selection; completed all four rounds for `father` (other nine test words marked fluent); result showed 100% and shared English credit.
- Stopped the preview server and confirmed connection refusal. Reload recovered the spelling stage from cached application assets; completed spelling and saved results while the application server was unavailable. This is a same-origin-server-disconnection check, **not** a claim that the whole device network was disabled.
- Switched to high school, searched `tongue`, opened details and reloaded: retained “已标为熟练 · 无需复习”.
- Spanish draft survived exit/re-entry; English and Spanish bounded input regions inspected at 390×440 keyboard-simulation size. Header/exit and input/actions stayed reachable, with the middle content independently scrollable.
- Screenshots inspected at 390×844, 430×932, 768×900 and desktop widths, with light/dark themes. 768px and desktop remain centered at a maximum 480px content width.
- Background-tab screenshots initially timed out; a fresh visible preview tab resolved the browser inspection issue. No application workaround was added for that tool limitation.

## Review and limitations

One fresh read-only whole-branch review found two Important issues (filtered semester ordering and Spanish focus restoration); both fixed with failing-then-passing regressions. No optional minors reported. The independent reviewer did not claim linguistic review, publication-rights verification or device testing.

No physical iPhone/Android keyboard, actual system voice, full offline pronunciation package or live paid AI call was available for this acceptance pass. Desktop viewport simulation is not a substitute for real-phone keyboard testing. Source corpus content can still benefit from further age-appropriate editorial review.

## Execution rulings

1. Latest explicit deploy request supersedes older no-deploy wording; publish only after verification.
2. Packaged task scripts lacked executable bits: invoked briefs with bash and recorded equivalent base/test evidence without changing installed skills.
3. Mobile production QA combined with final wordbook QA to inspect the integrated build.

The frontend-design guidance kept the paper/blue-annotation style, text-based book selection and existing four-tab navigation. It did not introduce a new dashboard or replace the high-school book.
