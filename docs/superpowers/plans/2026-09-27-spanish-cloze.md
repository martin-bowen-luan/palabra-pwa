# Spanish dictionary and contextual cloze implementation

## Global Constraints

Approved user spec: enrich the existing 300 Spanish entries, preserve IDs and existing learning data; add independent gender/number/conjugation units; four indicative tenses (present, preterite, imperfect, future), including vosotros. Generate real contextual sentences during implementation, never metalinguistic placeholders or runtime AI calls. Every admitted unit needs a reviewed sentence, Chinese translation, explicit blank and unambiguous grammatical cue. Keep provenance and pinned source revision. No user API keys, paid service calls, push or deployment.

Spanish daily target is TOTAL unique new+review units, default 50 (10/20/30/50), groups at most 10, reviews first. Max five new units per lemma per day, one per group. Incorrect answers retry immediately then after up to three other units; assisted success requires unassisted revisit. Skip stays high priority; fluent affects only current unit. Accent-sensitive NFC spelling. Existing English/Wordle/AI behavior unchanged. Offline PWA and paper/cobalt/light-dark design retained.

## Interfaces

`src/spanish/types.ts` owns `SpanishGrammar`, `SpanishCloze`, `SpanishLearningData`, `SpanishDailyRecord`, and `SpanishSessionState`. VocabularyEntry gains optional `spanishData: SpanishLearningData`. SpanishLearningData = { lemmaId: string; lemma: string; kind: 'lemma'|'form'; grammar: SpanishGrammar; grammarLabel: string; eligible: boolean; cloze: SpanishCloze; source: {url:string; revision:string; license:string} }. SpanishGrammar = { gender?:'masculine'|'feminine'|'common'|'variable'; number?:'singular'|'plural'|'invariable'; mood?:'indicative'|'infinitive'; tense?:'present'|'preterite'|'imperfect'|'future'; person?:1|2|3; pronoun?:string; noteZh?:string }. SpanishCloze = { id:string; before:string; answer:string; after:string; translationZh:string; cueZh:string; reviewed:boolean; provenance:'original'; reviewVersion:1 }. Case of answer may differ from entry term, compare NFC case insensitive. A word form can have multiple independent grammatical analyses. Existing base entries keep IDs even when sharing a lemma family.

Corpus exports `spanishVocabulary: VocabularyEntry[]` from `src/spanish/vocabulary.ts`. Main integrator owns types.ts optional field and storage wiring. Corpus author owns src/spanish/types.ts initially (only grammar/cloze/learning data types), src/spanish/data/**, src/spanish/vocabulary.ts, corpus tests, import script, license and corpus documentation. Do not edit existing src/data/vocabulary.ts; it is the legacy 300-entry input.

## Task 1: Corpus and source extraction

Create independently authored contextual sentences for 300 bases and course forms, grammar and Chinese descriptions, explicit blank fragments, source snapshot, extractor and validation tests. Retrieve actual Wiktionary/Kaikki data, pin source snapshot/hash/revision, select needed lemmas/forms. Do not assert human/native review happened. Review sentences yourself and record limits. No broad seed patterns mechanically replacing subjects/endings as primary corpus. Run tests covering real data coverage, placeholders, accented forms, same-spelling different grammar and provenance. Corpus must not silently fabricate source claims; escalate inaccessible source. Report all missing coverage rather than filler. Do not commit outside your ownership. Tests first. Report /tmp/spanish-corpus-report.md.

## Task 2: Persistence and scheduling

IDB v6 adds Spanish daily records. Spanish state persists input/hints/feedback/queue, commits progress + active session + daily completion in one CAS transaction. Old sessions without cloze marker continue legacy path. Stable base IDs, new forms unlearned. Add total goal separately from shared English dailyNewWords. Build group reviews first, cap unique IDs at remaining daily target, family-spread new forms, optional extra group. New review defaults 10m,1d,2d,4d,7d,15d,30d, no batch rewrite old dates. Persist draft and snapshot cloze on session so recovery doesn't change questions. Tests: upgrade/atomic rollback/stale tabs/cross-day/reset/scheduling.

## Task 3: Study and dictionary UI integration

Dedicated Spanish controller/hook and page minimize changes to legacy AppState. Route active cloze sessions to new page; preserve old sessions. Spanish today uses totals + learn/review, settings goal control, dictionary grouped search and grammar table. Sentence first, quiet Chinese/grammar annotations, one input, accent keys, hint/skip/fluent. Feedback shows spelling diff + known grammatical alternative; no invented diagnosis. Errors retry, assisted then unassisted recheck; progress per resolved item, skip counts practiced not mastered. Fully persist transition before next action. Tests with real storage/components. 44px controls and reduced motion.

## Task 4: Review and acceptance

Run npm test, npm run typecheck, npm run build. Inspect 390/430/768/desktop light-dark, offline restart, partial input restore, 10-item group finish and review. Independently review corpus language/ambiguity and code/data safety. Fix and re-review findings. Document real-device limitations and no deployment. Commit only verified local work, preserve existing parent commits.

## Progress

- Baseline: bf7462a, 295 tests / 37 files passing, clean linked worktree.
- Architecture: corpus sidecar is disjoint from controller/persistence integration; source and sentence preparation can proceed while controller integration is implemented locally.
