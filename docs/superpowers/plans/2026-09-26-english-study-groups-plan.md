# 英语词汇增强与分组练习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前语言的已背词可查、错词在每组内练到会、英语卡展示可信近义词和特殊变形、英语四选一使用非今日形近词干扰项并发音，同时把每日任务拆成最多 10 个不同词一组。

**Architecture:** 构建期从现有 3464 条英语源 JSON 提取简短结构化词形数据，借英语词库 revision 原子刷新 IndexedDB。纯函数分别负责每日分组、错词队列与四选一候选；AppState 持久化动作并协调页面，展示组件只呈现状态。旧学习会话通过可选字段兼容恢复。

**Tech Stack:** React、TypeScript、Vite、CSS Modules、Vitest、Testing Library、IndexedDB、PWA Service Worker；不加 UI 库、账号或后端。

**Spec:** `docs/superpowers/specs/2026-09-26-english-study-groups-design.md`

## Global Constraints

- 英语限定近义词、特殊变形、形近词四选一和自动读音；已背词与组内错词循环适用于当前语言。
- 每组最多 10 个不同词，含到期复习；20 个新词须分组，下一组由用户点击开始。
- 本地词库为运行时唯一词表来源；不提交原始 HTML 或词典长文；词库刷新不得清除进度、设置和会话。
- 当前轮答错先立即重做，答对后最多穿插 3 个不同词再回访；回访答对才完成，退出可恢复。
- 测验正确率按不同词的首次测试答案计算，反复作答不虚增；失败后的同组成功不提升跨日复习阶段。
- 沿用现有练习纸、钴蓝批注、浅/深色模式；44px 触控区、键盘焦点、减少动画和断网学习保持可用。

## Review Focus

1. `变形` 含常规形式、噪声或 HTML：只保留可信的特殊词形，不能把标签和脚本渲染进页面（Task 1 测试）。
2. 组内只有一个错词或组尾不足三个其他词：必须可回访并结束，不能形成永不完成的队列（Task 3 测试）。
3. 20 词目标混有到期复习时：每组总词数仍≤10，第二组不重复抽词或提前宣告今日完成（Task 2、4 测试）。
4. 英语词库只剩少量可用干扰项或中文释义重复时：绝不展示少于四项的“四选一”；降级到拼写题（Task 6 测试）。
5. 浏览器拦截自动播放或学习中途离线重启：答题继续、可手动重播，已保存的重做/回访状态不丢（Task 4、6、7 测试）。

---

## File Map

- `scripts/import-english-vocabulary.mjs` / `.test.mjs`：提取、清洗近义词和特殊变形；重建 `src/data/vocabulary-en.json` 与来源报告。
- `src/types.ts`、`src/data/storage.ts` / `.test.ts`：可选词条补充字段、组内队列、英语词库 revision、原子保存学习动作。
- `src/domain/studyGroups.ts` / `.test.ts`：从每日目标与历史组生成最多 10 词的下一组。
- `src/domain/practiceQueue.ts` / `.test.ts`：纯函数管理立即重做、延迟回访和完成条件。
- `src/domain/choiceOptions.ts` / `.test.ts`：稳定随机、形近排序、今日排除与不足四项信号。
- `src/app/AppState.tsx`、`src/App.test.tsx`：调度、原子持久化、旧会话恢复及跨页面验收。
- `src/pages/TodayPage.tsx`、`src/pages/ResultPage.tsx`、`src/pages/LibraryPage.tsx`、`src/pages/StudyPage.tsx`、`src/styles/App.module.css`：分组按钮、已背筛选、词形补充、练习反馈及发音。

### Task 1: 导入英语近义词与特殊变形

**Files:** Modify `scripts/import-english-vocabulary.mjs`, `scripts/import-english-vocabulary.test.mjs`, `src/types.ts`, `src/data/storage.ts`, `src/data/vocabulary-en.json`, `docs/english-vocabulary-report.json`; test `src/data/storage.test.ts`.

**Interfaces:** Produces `VocabularyEntry.relatedTerms?: string[]` and `VocabularyEntry.specialForms?: Array<{ label: string; form: string }>`; `normalizeEnglishRecord(record, index)` populates them. English revision rises from 2 to 3; DB schema version remains 3.

- [ ] **Step 1: Write failing importer tests.** Extend `sourceRecord.sections` with `{ title: '变形', text: '过去式：went\n过去分词：gone\n现在分词：going' }` and `{ title: '英英释义', text: '同义词：move, travel' }`; assert `normalizeEnglishRecord({ ...sourceRecord, word: 'go', ... }, 0).specialForms` contains `went/gone` but not `going`, and `relatedTerms` contains normalized `move/travel`. Test malformed labels and `<script>` are excluded. Add `validateCorpus` test asserting self/duplicate/out-of-corpus related terms are removed.

  ```js
  const go = normalizeEnglishRecord({
    ...sourceRecord, word: 'go',
    sections: [
      { title: '变形', text: '过去式：went\n过去分词：gone\n现在分词：going' },
      { title: '英英释义', text: '同义词：move, travel' },
    ],
  }, 0)
  expect(go.specialForms).toEqual([
    { label: '过去式', form: 'went' },
    { label: '过去分词', form: 'gone' },
  ])
  expect(go.relatedTerms).toEqual(['move', 'travel'])
  ```
- [ ] **Step 2: Run red tests.** `npm test -- scripts/import-english-vocabulary.test.mjs src/data/storage.test.ts`; expect assertions for missing fields or unchanged revision to fail.
- [ ] **Step 3: Implement conservative extraction.** Parse only `sections` text, strip markup, limit related terms to 3 and special forms to 4, normalize case/whitespace; discard default `-s/-ed/-ing` forms and invalid tokens. In `validateCorpus`, filter related terms against the normalized corpus ID set. Increment `DEFAULT_VOCABULARY_REVISIONS.en` to `3`; keep source URL on the word. Regenerate via `npm run import:english` only after checking the existing import script and source paths; never add raw input files.

  ```js
  const sections = Array.isArray(record.sections) ? record.sections : []
  const specialForms = parseSpecialForms(sections).slice(0, 4)
  const relatedTerms = parseRelatedTerms(sections).slice(0, 3)
  // validateCorpus performs a second pass after all term IDs are known:
  const terms = new Set(normalized.map((entry) => entry.term))
  return normalized.map((entry) => ({
    ...entry,
    relatedTerms: entry.relatedTerms?.filter((term) => term !== entry.term && terms.has(term)).slice(0, 3),
  }))
  ```
- [ ] **Step 4: Run green and storage preservation tests.** `npm test -- scripts/import-english-vocabulary.test.mjs src/data/storage.test.ts`; assert the refresh leaves an existing `en:` progress record, settings, history and active session unchanged. Check generated JSON has exactly 3464 entries and no `main_html`/`sidebar_html` strings.
- [ ] **Step 5: Commit.** `git add scripts/import-english-vocabulary.mjs scripts/import-english-vocabulary.test.mjs src/types.ts src/data/storage.ts src/data/storage.test.ts src/data/vocabulary-en.json docs/english-vocabulary-report.json && git commit -m "feat: import English word relations and special forms"`.

### Task 2: 每日任务切成最多十词的组

**Files:** Create `src/domain/studyGroups.ts`, `src/domain/studyGroups.test.ts`; modify `src/types.ts` only if an explicit group identifier is required.

**Interfaces:** Produces `buildNextStudyGroup(vocabulary: VocabularyEntry[], progress: Record<string, WordProgress>, sessions: StudySession[], dailyNewWords: number, now?: Date, extraNewWords?: number): DailyPlan` and `hasMoreStudyGroups(...)` using the same inputs. Existing `buildDailyPlan` remains the source of due/new candidate ordering.

- [ ] **Step 1: Write failing group tests.** With 25 unseen words, assert daily target `20` yields 10 IDs, then after a completed `StudySession` with `newCount: 10` and progress for those ten yields the next ten, then no more; target `15` yields 10+5. With 4 due reviews and target 20, first group contains 4 review + 6 new; no group exceeds 10. Assert `extraNewWords: 5` creates at most 5 new words separately.

  ```ts
  const today = new Date('2026-09-26T08:00:00.000Z')
  const words = Array.from({ length: 25 }, (_, index) => ({
    id: `en:word-${index}`, language: 'en' as const, term: `word-${index}`,
    partOfSpeech: 'n.', meaningZh: `词义${index}`, category: '测试', examples: [],
  }))
  const learnedFirstTen = Object.fromEntries(words.slice(0, 10).map((word) => [word.id, {
    wordId: word.id, language: 'en' as const, stage: 0, status: 'learning' as const,
    nextReviewAt: '2026-09-27T08:00:00.000Z', reviewCount: 1, correctCount: 1,
    lastReviewedAt: today.toISOString(),
  }]))
  const completedTen = {
    id: 'group-1', language: 'en' as const, date: '2026-09-26', newCount: 10,
    reviewCount: 0, correctCount: 10, totalCount: 10, durationSeconds: 60, completed: true,
  }
  const learnedTwenty = Object.fromEntries(words.slice(0, 20).map((word) => [word.id, {
    ...learnedFirstTen[words[0].id], wordId: word.id,
  }]))
  const completedSecondTen = { ...completedTen, id: 'group-2' }
  const first = buildNextStudyGroup(words, {}, [], 20, today)
  expect(first.all).toHaveLength(10)
  const second = buildNextStudyGroup(words, learnedFirstTen, [completedTen], 20, today)
  expect(second.newWords).toHaveLength(10)
  expect(new Set([...first.all, ...second.all].map((word) => word.id)).size).toBe(20)
  expect(buildNextStudyGroup(words, learnedTwenty, [completedTen, completedSecondTen], 20, today).all).toHaveLength(0)
  ```
- [ ] **Step 2: Run red test.** `npm test -- src/domain/studyGroups.test.ts`; expect missing module/function.
- [ ] **Step 3: Implement group selection.** Compute `completedNewToday` from completed sessions whose `date === toLocalDate(now)`; `remainingNew = Math.max(0, dailyNewWords - completedNewToday)` (or 5 for explicit extra group). Call `buildDailyPlan(vocabulary, progress, remainingNew, now)`, take first 10 distinct IDs for normal groups, and split back into `review`/`newWords` while preserving order. For extra group, select only up to 5 unseen words. `hasMoreStudyGroups` checks resulting `all.length > 0` without mutating storage.

  ```ts
  const completedNewToday = sessions
    .filter((session) => session.completed && session.date === toLocalDate(now))
    .reduce((sum, session) => sum + session.newCount, 0)
  const remainingNew = Math.max(0, dailyNewWords - completedNewToday)
  if (extraNewWords > 0) {
    const newWords = buildDailyPlan(vocabulary, progress, Math.min(5, extraNewWords), now).newWords.slice(0, 5)
    return { all: newWords, review: [], newWords }
  }
  const candidates = buildDailyPlan(vocabulary, progress, remainingNew, now)
  const all = candidates.all.slice(0, 10)
  const ids = new Set(all.map((word) => word.id))
  return {
    all,
    review: candidates.review.filter((word) => ids.has(word.id)),
    newWords: candidates.newWords.filter((word) => ids.has(word.id)),
  }
  ```
- [ ] **Step 4: Run green test.** `npm test -- src/domain/studyGroups.test.ts`; assert due-review overflow produces an additional review group without duplicating new words.
- [ ] **Step 5: Commit.** `git add src/domain/studyGroups.ts src/domain/studyGroups.test.ts src/types.ts && git commit -m "feat: cap study groups at ten distinct words"` (omit `src/types.ts` from staging if unchanged).

### Task 3: 可恢复的立即重做与穿插回访队列

**Files:** Create `src/domain/practiceQueue.ts`, `src/domain/practiceQueue.test.ts`; modify `src/types.ts`.

**Interfaces:** Produces `PracticeQueue = { pendingIds: string[]; delayed: Array<{ wordId: string; remaining: number }>; stateById: Record<string, 'fresh' | 'retry' | 'revisit'>; firstAnswers: Record<string, boolean>; promptNumber: number }`, `createPracticeQueue(ids: string[]): PracticeQueue`, `currentPracticeWord(queue): string | undefined`, `advancePractice(queue, correct): PracticeQueue`, `removePracticeWord(queue, wordId): PracticeQueue`. `ActiveSession.practice?: PracticeQueue` persists it; old sessions initialize from phase IDs sliced at `currentIndex`.

- [ ] **Step 1: Write failing pure-function tests.** For `['a','b','c','d','e']`, assert `advancePractice(createPracticeQueue(...), false)` still presents `a`; after `true`, present `b`, then after three different successful words revisit `a`; only a correct revisit removes it. Assert repeated wrong on revisit repeats immediately, then reschedules. For one-word queue, wrong→right→revisit→right must become empty. Assert `removePracticeWord` deletes a fluent word from both `pendingIds` and `delayed`.

  ```ts
  let queue = createPracticeQueue(['a', 'b', 'c', 'd', 'e'])
  queue = advancePractice(queue, false)
  expect(currentPracticeWord(queue)).toBe('a')
  queue = advancePractice(queue, true)
  expect(currentPracticeWord(queue)).toBe('b')
  for (const id of ['b', 'c', 'd']) {
    expect(currentPracticeWord(queue)).toBe(id)
    queue = advancePractice(queue, true)
  }
  expect(currentPracticeWord(queue)).toBe('a')
  queue = advancePractice(queue, true)
  expect(currentPracticeWord(queue)).toBe('e')
  ```
- [ ] **Step 2: Run red test.** `npm test -- src/domain/practiceQueue.test.ts`; expect missing module/function.
- [ ] **Step 3: Implement immutable queue transitions.** On first wrong record `firstAnswers[id] = false`, change state to `retry`, leave head. On `retry` correct remove head and add delayed revisit with `remaining: 3`; on fresh correct remove head; on revisit correct remove head and state. Decrement delayed counters only after a *different* word is completed, inject due revisits before the next fresh item, and flush at group tail if no other word remains. Increase `promptNumber` whenever the visible prompt changes so audio and option seeds can distinguish revisits.

  ```ts
  const wordId = queue.pendingIds[0]
  const state = queue.stateById[wordId] ?? 'fresh'
  const firstAnswers = wordId in queue.firstAnswers
    ? queue.firstAnswers
    : { ...queue.firstAnswers, [wordId]: correct }
  if (!correct) return { ...queue, firstAnswers, stateById: { ...queue.stateById, [wordId]: 'retry' }, promptNumber: queue.promptNumber + 1 }
  const pendingIds = queue.pendingIds.slice(1)
  const delayed = state === 'retry'
    ? [...queue.delayed, { wordId, remaining: 3 }]
    : queue.delayed
  // Extract advanceDelayed(delayed, completedWordId) so the same word never
  // decrements its own delay; inject due IDs into pendingIds, or flush at tail.
  ```
- [ ] **Step 4: Run green tests and a serialization test.** `npm test -- src/domain/practiceQueue.test.ts`; assert `JSON.parse(JSON.stringify(queue))` resumes the same current word and delayed order.
- [ ] **Step 5: Commit.** `git add src/domain/practiceQueue.ts src/domain/practiceQueue.test.ts src/types.ts && git commit -m "feat: persist immediate retry and delayed recall queue"`.

### Task 4: 接入学习状态、分组结果与原子保存

**Files:** Modify `src/app/AppState.tsx`, `src/data/storage.ts`, `src/data/storage.test.ts`, `src/pages/TodayPage.tsx`, `src/pages/ResultPage.tsx`, `src/pages/StudyPage.tsx`, `src/App.test.tsx`.

**Interfaces:** Consumes `buildNextStudyGroup`, `hasMoreStudyGroups`, `PracticeQueue` functions. Add storage methods `commitStudyStep(progress: WordProgress | undefined, active: ActiveSession): Promise<void>` (single IndexedDB transaction) and `completeStudyGroup(completed: StudySession, language: LearningLanguage): Promise<void>` (put session + delete active in one transaction). AppState exposes `moreGroupsToday: boolean` and `startNextGroup(): Promise<ActiveSession | undefined>`.

- [ ] **Step 1: Write failing integration tests.** In `src/App.test.tsx`, with `dailyNewWords: 20`, assert session `wordIds.length === 10`, completing first group yields “开始下一组” instead of “今日已完成”, and starting next creates the remaining ten. With one word, select “忘记” or “模糊”, assert same heading appears again after action; select “认识”, assert later revisit is required before result. Exit during revisit, remount with the same storage, assert the pending word resumes. Add a due-review case where first failure resets stage and later same-group success does not raise it.

  ```tsx
  const storage = await renderApp('/today', async (client) => {
    await client.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
  })
  await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
  expect((await storage.getActiveSession('es'))?.wordIds).toHaveLength(10)
  for (let index = 0; index < 10; index += 1) {
    await user.click(await screen.findByRole('button', { name: '标为熟练' }))
    if (index < 9) {
      await waitFor(async () => expect((await storage.getActiveSession('es'))?.wordIds).toHaveLength(9 - index))
    }
  }
  await user.click(await screen.findByRole('button', { name: '开始下一组' }))
  expect((await storage.getActiveSession('es'))?.wordIds).toHaveLength(10)
  ```
- [ ] **Step 2: Run red integration/storage tests.** `npm test -- src/App.test.tsx src/data/storage.test.ts`; expect group-size, immediate-repeat and atomic-storage assertions to fail.
- [ ] **Step 3: Implement atomic storage and orchestration.** Save progress+active in one readwrite transaction over `wordProgress`/`activeSession`, and result+active deletion over `sessions`/`activeSession`. `startSession` uses `buildNextStudyGroup`; active sessions remain resumable. `rateCurrentWord` and `completeQuizItem` advance `activeSession.practice`, moving learn→quiz only when the learn queue is empty, and quiz→result only when the quiz queue is empty. Track failures per word in the session so later same-group success does not advance review stage. Convert legacy `currentIndex` sessions to a queue lazily without deleting them. `markCurrentWordFluent` removes the word from current and future queues, but `StudySession.newCount` still counts the originally assigned new words so a fully fluent group does not make the daily target loop forever. Aggregate first quiz answers into `correctCount`/`answeredCount` once per word.

  ```ts
  const tx = db.transaction(['wordProgress', 'activeSession'], 'readwrite')
  if (nextProgress) tx.objectStore('wordProgress').put(nextProgress)
  tx.objectStore('activeSession').put(nextSession)
  await transactionDone(tx)
  // In the provider, derive the card via currentPracticeWord(active.practice),
  // then persist nextProgress + nextSession before publishing React state.
  ```
- [ ] **Step 4: Update UI copy and run green tests.** Today shows group progress separately from daily target; result offers “开始下一组” when `moreGroupsToday`, otherwise “回到今日”. Study header uses unique words completed out of group size, not the number of repeated prompts. Run `npm test -- src/App.test.tsx src/data/storage.test.ts` and `npm run typecheck`.

  ```tsx
  {moreGroupsToday
    ? <button onClick={() => void startNextGroup().then((group) => { if (group) navigate('/study') })}>开始下一组</button>
    : <button onClick={() => navigate('/today')}>回到今日</button>}
  ```
- [ ] **Step 5: Commit.** `git add src/app/AppState.tsx src/data/storage.ts src/data/storage.test.ts src/pages/TodayPage.tsx src/pages/ResultPage.tsx src/pages/StudyPage.tsx src/App.test.tsx && git commit -m "feat: connect grouped study and retry flow"`.

### Task 5: 已背词列表与英语词形补充

**Files:** Modify `src/pages/LibraryPage.tsx`, `src/pages/StudyPage.tsx`, `src/styles/App.module.css`, `src/App.test.tsx`; optionally create `src/components/WordRelations.tsx` if both pages need identical rendering.

**Interfaces:** Consumes `progress[word.id]`, `VocabularyEntry.relatedTerms` and `.specialForms`; does not change scheduler or storage APIs.

- [ ] **Step 1: Write failing component tests.** Seed two English words, persist progress for one (including a `skipReview: true` case), switch to `/library`→“已背”, assert only progressed words appear and search still filters. Assert an empty language shows “还没有背过单词”. On an English learning card, reveal meaning and assert `relatedTerms: ['height']` and `specialForms: [{ label: '过去式', form: 'went' }]` appear; on a Spanish card or empty supplemental fields, assert those headings are absent.

  ```tsx
  const englishLearned = {
    id: 'en:go', language: 'en' as const, term: 'go', partOfSpeech: 'v.',
    meaningZh: '去', category: '高考 3500', examples: [],
    relatedTerms: ['move'], specialForms: [{ label: '过去式', form: 'went' }],
  }
  const englishUnseen = { ...englishLearned, id: 'en:stay', term: 'stay', meaningZh: '停留' }
  const learnedProgress = {
    wordId: 'en:go', language: 'en' as const, stage: 4,
    status: 'mastered' as const, skipReview: true,
    nextReviewAt: '2026-10-01T00:00:00.000Z', reviewCount: 1, correctCount: 1,
    lastReviewedAt: '2026-09-26T00:00:00.000Z',
  }
  await renderApp('/library', async (client) => { await client.putProgress(learnedProgress) }, {
    vocabularySeeds: { en: [englishLearned, englishUnseen] },
  })
  await user.click(await screen.findByRole('button', { name: '英语' }))
  await user.click(screen.getByRole('button', { name: '已背' }))
  expect(screen.getByText(englishLearned.term)).toBeInTheDocument()
  expect(screen.queryByText(englishUnseen.term)).not.toBeInTheDocument()
  ```
- [ ] **Step 2: Run red test.** `npm test -- src/App.test.tsx`; expect missing tab/relations assertions.
- [ ] **Step 3: Implement presentation.** Add `view: 'all' | 'learned'` state to LibraryPage, filter before search/pagination, reset selection on language change. Render relation rows in the existing definition area with divider-only treatment; avoid cards, shadows and empty labels. Ensure filter controls have 44px targets, visible focus and dark-mode colors.

  ```tsx
  const visibleCorpus = view === 'learned'
    ? vocabulary.filter((word) => Boolean(progress[word.id]))
    : vocabulary
  {word.language === 'en' && word.relatedTerms?.length
    ? <p className={styles.wordRelations}>近义词：{word.relatedTerms.join('、')}</p>
    : null}
  {word.language === 'en' && word.specialForms?.length
    ? <p className={styles.wordRelations}>特殊变形：{word.specialForms.map((item) => `${item.label} ${item.form}`).join('；')}</p>
    : null}
  ```
- [ ] **Step 4: Run green test.** `npm test -- src/App.test.tsx` and `npm run typecheck`; inspect 390px and 768px widths for overflow and long forms.
- [ ] **Step 5: Commit.** `git add src/pages/LibraryPage.tsx src/pages/StudyPage.tsx src/styles/App.module.css src/App.test.tsx && git commit -m "feat: show learned words and English relations"`; add `src/components/WordRelations.tsx` before commit only if it was created.

### Task 6: 英语形近词干扰项、稳定随机与发音

**Files:** Create `src/domain/choiceOptions.ts`, `src/domain/choiceOptions.test.ts`; modify `src/pages/StudyPage.tsx`, `src/components/PronunciationButton.tsx` only if a replay callback is needed, `src/App.test.tsx`.

**Interfaces:** Produces `buildEnglishChoiceOptions(target: VocabularyEntry, vocabulary: VocabularyEntry[], excludedIds: ReadonlySet<string>, seed: string): VocabularyEntry[] | undefined`; `undefined` means switch this question to spelling because four distinct English entries with distinct Chinese meanings cannot be formed. Seed derives from active session ID, target ID and `practice.promptNumber`. Private helpers in the same file: `lookalikeScore(a: string, b: string): number`, `seededPickDistinctMeanings(words: VocabularyEntry[], count: number, seed: string): VocabularyEntry[]`, `seededShuffle(words: VocabularyEntry[], seed: string): VocabularyEntry[]`.

- [ ] **Step 1: Write failing option tests.** With terms `form`, `from`, `farm`, `foam` plus today IDs, assert target is present once, three selected distractors are outside today's set, all meanings differ, and same seed returns identical ordering. Two seeds should be able to produce different orders. Assert a sparse corpus returns `undefined`, not a 1–3 option array. Test a candidate with duplicated Chinese meaning is skipped.

  ```ts
  const excluded = new Set(['en:today-word'])
  const first = buildEnglishChoiceOptions(target, corpus, excluded, 'session-1:form:1')
  expect(first).toHaveLength(4)
  expect(first?.filter((item) => item.id === target.id)).toHaveLength(1)
  expect(first?.some((item) => excluded.has(item.id))).toBe(false)
  expect(new Set(first?.map((item) => item.meaningZh)).size).toBe(4)
  expect(buildEnglishChoiceOptions(target, corpus, excluded, 'session-1:form:1')).toEqual(first)
  ```
- [ ] **Step 2: Run red test.** `npm test -- src/domain/choiceOptions.test.ts`; expect missing module/function.
- [ ] **Step 3: Implement scoring and shuffle.** Score candidates using normalized Levenshtein distance plus common prefix, take a small high-ranked pool, choose three via deterministic seed and Fisher–Yates shuffle. Exclude target, today's group IDs, and progress `lastReviewedAt` on the current local date; use other non-today English words as fallback. Return `undefined` if fewer than three valid choices remain. Do not mutate `vocabulary`.

  ```ts
  const candidates = vocabulary.filter((item) =>
    item.language === 'en' && item.id !== target.id && !excludedIds.has(item.id)
    && item.meaningZh !== target.meaningZh)
  const nearest = [...candidates].sort((a, b) =>
    lookalikeScore(target.term, a.term) - lookalikeScore(target.term, b.term))
  const near = seededPickDistinctMeanings(nearest.slice(0, 24), 3, seed)
  const fallback = seededPickDistinctMeanings(
    nearest.slice(24).filter((item) => !near.some((picked) => picked.meaningZh === item.meaningZh)),
    3 - near.length, seed,
  )
  const distractors = [...near, ...fallback]
  if (distractors.length < 3) return undefined
  return seededShuffle([target, ...distractors], seed)
  ```
- [ ] **Step 4: Write failing UI/audio tests.** In an English choice question, spy on `pronunciationPlayer.play`: entering the prompt calls it once; clicking the speaker calls it again. Simulate rejected autoplay and assert four choices (or spelling fallback) remain operable and no unhandled rejection appears. Resume the same active question and assert option order is unchanged. Assert Spanish quiz does not auto-play.

  ```tsx
  const play = vi.spyOn(pronunciationPlayer, 'play').mockResolvedValue(undefined)
  await renderApp('/study', async (client) => {
    await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', enableSpelling: false })
    await client.saveActiveSession({
      id: 'active-session:en', language: 'en', wordIds: ['en:altitude'],
      newWordIds: [], reviewWordIds: ['en:altitude'], currentIndex: 0,
      phase: 'quiz', correctCount: 0, answeredCount: 0,
      startedAt: new Date().toISOString(),
    })
  })
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
  await user.click(screen.getByRole('button', { name: /播放 .* 发音/ }))
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  ```
- [ ] **Step 5: Implement UI and run green.** `StudyPage` uses the option function only for English choice mode; if `undefined`, use spelling mode for that prompt. A keyed effect attempts `pronunciationPlayer.play(word).catch(() => undefined)` on English choice prompt entry, and the existing button manually replays it. Stop old sound on transition. Run `npm test -- src/domain/choiceOptions.test.ts src/App.test.tsx src/audio/pronunciation.test.ts`.

  ```tsx
  useEffect(() => {
    if (activeSession?.phase !== 'quiz' || word?.language !== 'en' || mode !== 'choice') return
    void pronunciationPlayer.play(word).catch(() => undefined)
    return () => pronunciationPlayer.stop()
  }, [activeSession?.id, activeSession?.practice?.promptNumber, mode, word?.id])
  ```
- [ ] **Step 6: Commit.** `git add src/domain/choiceOptions.ts src/domain/choiceOptions.test.ts src/pages/StudyPage.tsx src/components/PronunciationButton.tsx src/App.test.tsx && git commit -m "feat: build English lookalike choices with replayable audio"` (omit untouched files).

### Task 7: 全流程与离线验收

**Files:** Modify `src/App.test.tsx`, `src/data/storage.test.ts`, `README.md` only for newly visible behavior; no new runtime feature.

**Interfaces:** Exercises all Tasks 1–6 together; does not introduce new public APIs.

- [ ] **Step 1: Write failing end-to-end component scenarios before any final fix.** Cover 20 新词→10 词组→错词立即重做→穿插回访→组结果→“开始下一组”→第二组；在回访中卸载并重新挂载同一 IndexedDB；英语/西语切换后“已背”互不串库；标熟练后不再回访或次日复习。

  ```tsx
  const firstTerm = 'altitude'
  const storage = await renderApp('/today', async (client) => {
    await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', dailyNewWords: 20 })
  })
  await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
  expect((await storage.getActiveSession('en'))?.wordIds).toHaveLength(10)
  expect(await screen.findByRole('heading', { name: firstTerm })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '点击查看释义' }))
  await user.click(screen.getByRole('button', { name: '忘记' }))
  expect(await screen.findByRole('heading', { name: firstTerm })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '结束' }))
  cleanup()
  render(<MemoryRouter initialEntries={['/today']}><App storageClient={storage} /></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: '继续今天的学习' }))
  expect(await screen.findByRole('heading', { name: firstTerm })).toBeInTheDocument()
  ```
- [ ] **Step 2: Run red tests and fix only observed integration gaps.** `npm test -- src/App.test.tsx src/data/storage.test.ts`; record each failing assertion and the minimal production change, rerun until green.
- [ ] **Step 3: Run automated verification.** Execute `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` separately; record exit codes and failing test names if any.
- [ ] **Step 4: Check visual and accessibility states.** Start `npm run preview -- --port 4181`; inspect 390×844、430×932、768px and desktop center widths in shallow/dark modes. Verify keyboard focus, ≥44px controls, no horizontal overflow, and reduced-motion behavior. Capture screenshots for comparison.
- [ ] **Step 5: Check offline recovery.** After one successful production load, go offline, restart the preview page, open all/learned vocabulary, resume a pending revisit, complete its quiz, and verify persisted `StudySession`. Do not present simulator results as proof of real-phone autoplay.
- [ ] **Step 6: Request whole-branch review and resolve important findings.** Give reviewer spec path, base SHA, HEAD SHA and test results; fix critical/important issues, then repeat Step 3.
- [ ] **Step 7: Commit final integration/test/docs changes.** `git add src/App.test.tsx src/data/storage.test.ts README.md && git commit -m "test: verify grouped offline English study flow"` (only stage files actually changed).
