# Optional AI vocabulary analysis and sentence speech

Approved spec: user-provided implementation plan, 2026-09-27. Base: 7125284. No push/deploy.

## Deliverables

- [x] T1: IndexedDB v4 additive AI configuration, encrypted credentials, analysis cache and expiring global request lease; preserve all learning data. Web Crypto PBKDF2/AES-GCM, HTTPS destination-bound credentials, memory-only unlock.
- [x] T2: OpenAI-compatible nonstreaming client, bounded schema, cache input fingerprint, offline reuse, single request/60-second timeout, cancellation, failure handling and source-preserving merge.
- [x] T3: default-off AI settings with consent, provider/region/base URL/model, encryption/unlock/lock/test/clear. Current revealed English word analysis only, provenance and cache actions. Existing paper/cobalt visual system retained.
- [x] T4: user-triggered system sentence speech, prefer local US then local English, remote only online; real playback events, delayed voices, stop/replay, shared arbitration with word audio. No paid speech API.
- [x] T5: full tests/typecheck/build, isolated mobile/dark/offline browser QA, independent review; retain local feature branch (no push/deploy).

## Contracts and rulings

Main owns src/ai, storage, integration pages and AI UI. Audio sidecar owns src/audio and SentenceSpeechButton; exported `SentenceSpeechButton({text})` is rendered by parents only when AI enabled. Existing PronunciationPlayer word API remains compatible. This independent bounded subtask runs in parallel; main owns integration and final review.

AI schemas live in src/ai/types.ts. Cache is separate from original vocabulary. Only current term, meanings, examples and relationships leave the device. AI never changes quizzes/scheduling, creates vocabulary or asserts verified citations. Empty validated results are cacheable. Turning AI off stops requests, clears in-memory keys, hides additions but preserves caches. Deleted current-word results remain suppressed for the current view.

Security defaults: PBKDF2-SHA-256 600000 iterations, random 16-byte salt; AES-256-GCM random 12-byte IV; credential AAD binds normalized endpoint. Unlock required after reload. Cross-tab settings updates invalidate keys. No plaintext secret logs, URL parameters, SW caching or proxies. Password length minimum 8; forgetting it requires reset, not recovery.

Review focus: destination changes during unlock/request; repeated effects and tabs billing twice; clear/disable races resurrecting data; output truncation/refusal/malformed JSON replacing old success; stale system-voice callbacks starting after navigation.

Real provider calls require user-supplied credentials via UI, never chat. Real-device speech cannot be certified with headless mocks; report these limitations explicitly.

## Verification ledger

- Baseline: 109 existing tests; implementation tests use observed RED → GREEN cycles.
- Storage: explicit v3→v4 byte-for-byte preservation of all six original stores; learning reset retains AI configuration/cache; concurrent configuration CAS and expiring leases; scoped deletion fences only the affected word.
- Security/client: real Web Crypto round trips, wrong passwords/corruption/destination changes; normalized credentials across relock; portable request projection, response bounds/schema/refusal/truncation/HTTP/network errors; timeout, subscriber cancellation, pending cache-read cancellation, valid empty cache, no automatic retry, offline locked cache reuse.
- UI: settings consent/configuration/encryption/lock/unlock, unchanged-focus draft preservation, same-word deletion suppression, unrelated cross-tab deletion preservation, all four rounds hide analysis before answering, source-preserving merge and disable behavior.
- Browser QA (isolated Chromium production context, `/palabra-pwa/`): simulated provider invoked once for one viewed word; reload locked; offline reload/reopen reuses cache; no plaintext fixture key/password in IndexedDB or SW cache; cross-tab disabling locks peer; no page errors. Headless voice-unavailable error verified, not counted as real speech success.
- Screenshots reviewed at 390×844, 430×932, 768×1024 and centered 1440×900; dark mode included. No horizontal overflow. Buttons ≥44px; small supporting text light-mode contrast corrected from 4.36:1 to AA using `--muted: #647078`.
- Existing four-round production flow retested: spelling mistake comparison, offline restart/retry/completion, result persistence and skipped-word review priority all passed with no page errors.
- Independent review found focus-draft reset and unscoped cross-tab cache cancellation; both reproduced in tests and fixed, including the pending-read timing case. Reviewer confirmed both findings closed after scoped deletion/lease checks and shared-subscriber cancellation checks.
- Final automated run: 27 test files / 234 tests passed; TypeScript check and production build passed. The existing bundled vocabulary triggers Vite's >500 kB advisory; build and PWA precache succeed (114 assets, approximately 9 MB).
- Real DeepSeek/Qwen calls, actual mobile speech playback and device-specific offline voice availability remain unverified: no user credentials or real phone were provided. This does not authorize push/deploy; branch/worktree stay local.
