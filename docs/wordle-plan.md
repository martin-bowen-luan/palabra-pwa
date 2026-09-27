# Wordle approved implementation plan

Source of truth: user-approved conversation plan, 2026-09-27. Base b47a30f.
Unlimited English five-letter games, six attempts, random local English answers (598 currently), no consecutive repeat when possible. English-home entry; immersive /wordle route; existing four bottom tabs unchanged. No progress, review, AI, pronunciation, leaderboard, hint or publication changes.

## Task 1: Rules and storage
TDD pure candidate filtering, two-pass repeated-letter scoring, keyboard priority and win/loss/duplicate rules. Add WordleGame/Guess/DictionaryEntry types. IndexedDB v5 adds singleton current game and positive dictionary cache; CAS revisions prevent overwriting another tab. Preserve draft and answer snapshot; clearing learning preserves game/cache; v4 migration preserves everything.

## Task 2: Wiktionary adapter
Local canonical/variant match, then positive cache, then credential-free official Action API with origin=*. parse/tocdata finds English; parse/text/revid reads that section. Require a POS definition, allow inflections, distinguish absent vs unparseable/unavailable. Extract at most three plain-text definitions, optional IPA, source revision/date and CC BY-SA attribution. Never insert HTML. One in-flight lookup, same word coalesced, cancellation and 15s total timeout, no automatic retry. Offline accepts local/cache only.

## Task 3: Controller and UI
TDD loading/restoration, durable accepted guesses before display, input retained on write failure, CAS recovery, cancellation on unmount, draft saving, new game. EnglishToday entry, /wordle route. Board six by five, screen/physical keyboard and five-letter paste, uppercase display/lowercase processing, accessible state labels plus green/yellow/gray legend. Top latest valid guess, selectable past rows; initial state no answer. Result reveals answer and local detail link. Responsive paper/cobalt/dark styling, reduced motion, safe areas.

## Task 4: Integration and acceptance
Run full tests/typecheck/build; review whole feature. Production subpath preview in 390/430/768/desktop; offline reload/cache use; few live Wiki queries. If environment blocks browser Wiki call explicitly record unverified real network behavior. Keep changes local; no push, merge or deployment.

Interfaces: shared types consumed by rules/storage/adapter/controller; storage injected into game route for App testability. No incompatible changes to existing learning interfaces.
