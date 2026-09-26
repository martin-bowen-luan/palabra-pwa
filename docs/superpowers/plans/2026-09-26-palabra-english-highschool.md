# Palabra English High-school Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with superpowers:test-driven-development.

**Goal:** Add a Chinese-UI English learning mode backed by 3,464 normalized high-school vocabulary entries, language-isolated progress, and downloadable offline American pronunciation audio.

**Architecture:** Generalize the Spanish-specific domain model, migrate IndexedDB to v3 without losing Spanish state, and import a sanitized English seed from the user-provided JSON corpus. Keep vocabulary metadata in IndexedDB, app-shell vocabulary offline, and pronunciation files in a separately managed Cache Storage pack.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, IndexedDB, Cache Storage, Vite PWA.

## Global Constraints

- The interface stays Simplified Chinese and preserves the existing paper-and-cobalt visual system.
- Spanish and English progress, sessions, streaks, and daily plans never mix.
- Never render or commit source HTML, sidebars, ads, or scripts from the source corpus.
- English spelling accepts configured British/American variants; American IPA/audio is primary.
- The deployed GitHub Pages base path remains `/palabra-pwa/`.

## Review Focus

- A v2 database with Spanish progress must migrate without losing references.
- Switching languages must not resume or alter the other language's active session.
- Empty or malformed English corpus records must fail import rather than ship partial data.
- Audio pack interruption and version changes must remain resumable and removable.
- GitHub Pages subpath URLs must resolve for data and audio both online and offline.

---

### Task 1: Generic language domain and IndexedDB v3

Add language-aware types and storage APIs, migrate v2 Spanish records to `es`, seed both language vocabularies idempotently, and make clear/read operations language-scoped. Write migration and isolation tests first, then run the full suite.

### Task 2: English corpus importer and normalized seed

Add a Node import script and parser tests. Validate exactly 3,464 unique schema-v2 records, extract only structured text fields, normalize US IPA, meanings, examples, variants, and source metadata, and emit an app-ready seed plus an audit report without raw HTML.

### Task 3: Language-aware app state and learning flow

Make AppState, daily plans, review scheduling, sessions, statistics, choice questions, and spelling checks use the selected language. Add tests proving switching does not cross-contaminate progress or active sessions.

### Task 4: Pronunciation playback and offline pack manager

Add a reusable audio player and Cache Storage pack manager with download progress, resume, deletion, revision handling, and on-demand caching. Test replay, missing/offline states, pack lifecycle, and URL construction under the Pages base path.

### Task 5: Language switch and English learning UI

Add the underlined language switch to all main pages, English IPA/speaker controls, bounded library rendering, language-aware copy, and the settings audio/source section. Add component tests and preserve keyboard, touch, dark-mode, and reduced-motion behavior.

### Task 6: PWA integration and release verification

Cache both vocabulary seeds but exclude the full audio pack from precache, run all tests/typecheck/build, inspect mobile and desktop screenshots, verify the offline English study loop, and update documentation.
