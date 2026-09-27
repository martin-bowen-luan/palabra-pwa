# Spelling hints and part-of-speech display — 2026-09-27

User-approved bounded change, based on b206c78; branch `codex/spelling-hints`.

## Behavior

- English fourth-round prompt and wrong-choice comparison now render `partOfSpeech` alongside `meaningZh`. The first POS was stored separately, not truncated from the source.
- Letter hints reveal from the beginning, capped at floor(ASCII letters / 2), preserving spaces and punctuation, without changing the input value.
- Optional per-prompt hint state is persisted with the existing IndexedDB session CAS before showing letters. No database migration is required.
- Assisted correct answers are acknowledged as correct but enter the existing delayed-revisit queue. Only an unassisted correct revisit completes that word; hinting again repeats the requirement. Incorrect answers still repeat immediately. Skip behavior remains unchanged.
- Hint state is cleared on completion/retry/skip; prompt identity prevents it leaking across words. Old sessions without the optional fields retain their behavior.

## Verification

- 295 tests across 37 files passed; TypeScript, production build and diff checks passed. The existing large-bundle warning remains.
- Regression coverage includes missing POS, three-intervening-word scheduling, repeated hinting, short words, punctuation, cap, input preservation, reload, immediate retry, skip priority, stats and failed persistence.
- Isolated production-subpath Chromium profile: seeded a two-word spelling session (`soluble`, `table`), confirmed `adj.`, three-letter cap, untouched typed input, offline reload with hint state, assisted feedback, hidden hints on next word/revisit, and successful unassisted completion. No uncaught page errors.
- Eight screenshots generated across 390×844, 430×932, 768×1024 and 1440×1000 in light/dark modes; no horizontal overflow. Mobile light/dark and desktop views visually inspected.
- No changes to the user's browser data. Real-device Safari and screen-reader testing not performed.
- Review fixes: preserve literal spacing/punctuation in the mask (CSS supplies letter spacing); mount an empty live region before the first reveal and update it atomically. Added stale-tab regressions for hint-versus-answer in both write orders and deleted sessions; no important findings remain open. Actual screen-reader announcement still requires real assistive-technology verification.
- Local implementation only; no push or deployment performed in this task.
