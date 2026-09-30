# 小学词书与共享英语记忆 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小学牛津版 1,047 词加入可切换词书，与高考共享词条和记忆，保留年级/学期归属及全部旧记录。

**Architecture:** 英语公共词典保留原 `en:<term>` ID，词书目录仅引用成员、展示资料和册归属；WordProgress 继续按 wordId 共享。IndexedDB v7 原子安装公共词典和两本英语目录；页面的新词候选集随词书改变，而英语复习记录、日目标和活动会话保持统一。

**Tech Stack:** React、TypeScript、Vite、CSS Modules、IndexedDB、现有 Vitest/fake-indexeddb；导入器为 Node ESM，不新增 UI 或存储库。

**Spec:** `docs/superpowers/specs/2026-09-30-primary-oxford-wordbook-design.md`。实现前完整读取；第 9 节由配套 `2026-09-30-mobile-study-viewport.md` 执行，不在这里重复实施。

## Global Constraints

- 新词书名“小学必背单词（牛津版）”；高考词书不替换，西语不改变。
- 1,047 个唯一小学词、12 册、1,164 次归属；804 重合词共用原 ID，其余 243 个新增词形。数据检查若不同先停下核对，不硬编码通过。
- 原文件 `/home/martin/Documents/Codex/2026-09-26/xie/outputs/小学牛津版完整词典.json` 只读，约 85 MB 的原始 HTML/正文不提交，不打包。
- 学习与复习进度共用；英语目标 5/10/15/20、四关、每组最多十词、题型设置与现有调度不变。
- 小学年级筛选只影响新词；当前书复习与全部英语复习有明确入口。
- 全英语一组未完成会话；切书可浏览，继续学习先恢复旧组，不丢进度来切书。
- 不使用用户密钥或付费服务批量生成内容；不变更 Supabase、不推送或部署。
- 英/西文配色字体沿用当前方案；离线词库与在线/系统发音可用性分别报告。
- DB 当前 v6，使用 v7；好友小组未实施，之后必须重新分配其迁移版本。

## Review Focus

1. 同一词出现在不同册，年级和学期分别命中不同归属时被错误筛选：Task 1/3 的同一 membership 组合测试。
2. 重合词含大小写、连字符、短语、词性前英文字符，合并后丢字或碰撞：Task 1 的规范化与释义解析测试。
3. 同时打开旧页面升级，词书目录已更新但词条缺失：Task 2 的事务失败/旧连接测试。
4. 未完成高考组时切小学，导致题目和干扰项偷换：Task 3/4 的恢复及交错加载测试。
5. 只改 getVocabulary 后 Wordle 意外扩大题池、AI 串摘要、离线漏新资源：Task 5 的边界与生产离线测试。

## 文件结构

- 新建 `src/wordbooks/types.ts`、`catalog.ts`、`catalog.test.ts`、`WordbookSwitch.tsx`、`PrimaryRangeFilter.tsx`：目录类型、纯选择函数与选择控件。
- 新建 `scripts/import-primary-wordbook.mjs`、`.test.mjs`、`scripts/lib/english-record-fields.mjs`：v3 来源解析及旧导入器可复用字段工具。
- 新建 `src/data/primary-editorial.json`、`english-wordbooks.json`、`docs/primary-vocabulary-report.json`：审核补充、规范化公共词典+目录产物、质量报告。
- 修改 `scripts/import-english-vocabulary.mjs` 与原测试：提取字段工具时保留旧 v2 流程；不要直接把所有 schema 判定放宽。
- 修改 `src/data/englishVocabulary.ts`、`src/data/vocabulary-en.test.ts`、`src/data/storage.ts`、`src/types.ts`；新建 `src/data/wordbooksStorage.test.ts`、`src/data/wordbooksCorpus.test.ts`。
- 修改 `src/app/AppState.tsx`，新建 `src/wordbooks/planning.ts`、`.test.ts`、`WordbooksApp.test.tsx`：候选集与会话资料选择。
- 修改 `src/pages/EnglishToday.tsx`、`LibraryPage.tsx`、`ProgressPage.tsx`、`SettingsPage.tsx`、`EnglishStudyPage.tsx`、`ResultPage.tsx`、`src/components/WordRelations.tsx`、`src/styles/App.module.css`。
- 修改 `src/wordle/controller.ts`、`src/wordle/controller.test.ts`、`src/components/AudioPackSettings.tsx`、`src/audio/audioPack.ts`、`src/audio/audioPack.test.ts`，并按实际消费点更新 AI 回归测试。
- 修改 `package.json` 增加可重复导入和产物校验命令；新建 `docs/primary-wordbook-validation.md`。

## Task 1：公共词典、目录、字段提取与缺口补齐

**Interfaces（新建 `src/wordbooks/types.ts`，词典补充类型在 `src/types.ts`）:**

```ts
export type WordbookId = 'en-highschool' | 'en-oxford-primary'
export interface PrimaryRange {grade?:1|2|3|4|5|6; semester?:1|2}
export interface BookMembership {sourceBookId:string;grade:1|2|3|4|5|6;semester:1|2}
export interface WordbookMember {
  wordId:string; order:number; memberships:BookMembership[]
  displayTerm?:string; senseIds?:string[]; exampleKeys?:string[]
}
export interface WordbookCatalog {
  id:WordbookId; language:'en'; title:string; revision:number; members:WordbookMember[]
}
export interface DictionarySense {
  id:string; partOfSpeech:string; meaningZh:string; source?:VocabularySource
}
// VocabularyEntry 增加可选 senses:DictionarySense[]、sources:VocabularySource[]。
// 原有必需字段和旧例句字段不删除。
export interface EnglishWordbookBundle {
  revision:number; words:VocabularyEntry[]; books:WordbookCatalog[]
}
```

Node 导入器导出 `normalizePrimaryDataset(dataset, highschoolWords, editorial, options?:{expectedCount?:number})` 和 `validatePrimaryBundle(bundle)`；前者返回 `{bundle,report}`。CLI 使用显式 `--source`、`--out`、`--report`，不依赖提交绝对源路径。

- [ ] 先写 importer 的最小失败测试，测试允许传 expectedCount=1 的 fixture，但生产固定校验 1,047；不要用真实 85MB 文件作为每个单测 fixture。

```js
const fixture={expected_words:1,downloaded_words:1,source_books:[
  {name:'小学牛津版二年级 下学期',url:'https://www.koolearn.com/dict/tag_395_1.html'}],
  entries:[{schema_version:3,word:'X-ray',definition:'n. X光照片；',
    books:['小学牛津版二年级 下学期'],detail_url:'https://www.koolearn.com/dict/wd_test.html',
    sections:[{title:'双语例句',text:'The doctor looked at my X-ray.\n医生看了我的X光片。'}],
    raw_html:'<script>doNotImport()</script>'}]}
const prior=[{id:'en:x-ray',language:'en',term:'x-ray',partOfSpeech:'n.',
  meaningZh:'X光照片',category:'高考 3500',examples:[]}]
const {bundle}=normalizePrimaryDataset(fixture,prior,{}, {expectedCount:1})
expect(bundle.words).toHaveLength(1)
expect(bundle.books.find(b=>b.id==='en-oxford-primary').members[0].wordId).toBe('en:x-ray')
expect(bundle.words[0].senses.some(s=>s.meaningZh==='X光照片')).toBe(true)
expect(JSON.stringify(bundle)).not.toMatch(/raw_html|doNotImport|<script/)
```

- [ ] 添加坏 JSON、错误 schema、缺词形/释义/归属、重复规范词形、未知册名、例句标题误配、错义、非 HTTPS 音频测试。`normalizePrimaryDataset` 的第四参数明确为 `{expectedCount?:number}`，缺省 1,047；源解析失败与质量缺口在报告中区分，不静默跳过。
- [ ] 运行 `npm test -- scripts/import-primary-wordbook.test.mjs` 得到预期失败，然后实现 NFC+trim+压缩内部空格+lowercase 的 key；匹配 old term map 并复用原 id，新的使用 `en:${key}`。禁止去连字符或标点后再匹配。
- [ ] 提取可靠字段解析到 `scripts/lib/english-record-fields.mjs`：显式匹配 `n.`/`adj.`/`vt.` 等词性和独立“释义”标签，不按首个汉字切割；分组保存义项来源。对 v2 旧 importer 保留输入版本、原产物格式和数量校验，运行原测试防回归。
- [ ] 构建完整源册映射（中文一至六年级与上/下），一词多归属保留；目录 order 按年级/学期再源文件首次出现排列，不声称课内顺序。合并义项和例句按稳定文本 key 去重，源信息数组并集；旧有效显示字段优先，小学常用资料仅以 senseIds/exampleKeys 引用。
- [ ] 编辑 `primary-editorial.json`：记录四条缺失释义及八条例句的补充、出处/编辑标记和审核结论。以下为需要逐条复核的原创候选，不冒充已验证语料：

```json
{
  "X-ray": ["The doctor looked at my X-ray.", "医生看了我的X光片。"],
  "felt pen": ["I drew a red flower with a felt pen.", "我用毡头笔画了一朵红花。"],
  "shaker": ["Please pass me the salt shaker.", "请把盐瓶递给我。"],
  "soya milk": ["I drink soya milk with breakfast.", "我吃早餐时喝豆奶。"],
  "on one's way to": ["I met Lily on my way to school.", "我在去学校的路上遇见了莉莉。"],
  "litter bin": ["Please put the empty bag in the litter bin.", "请把空袋子放进垃圾桶。"],
  "toucan": ["The toucan has a large, colourful beak.", "这只巨嘴鸟有一张色彩鲜艳的大喙。"],
  "kilogramme": ["We need one kilogramme of rice.", "我们需要一千克大米。"]
}
```

四个待核验的常用义为 cherry 樱桃、sandcastle 沙堡、seaweed 海藻、berry 浆果；同时复核 shaker 的盐瓶义与 toucan 不能误作犀鸟。执行时通过各词 `detail_url` 或权威公开词典核验义项，记录实际访问来源；无证据时列缺口，不捏造链接。
- [ ] 对全部 1,047 条做自动质量报告；按每批最多 100 条查看结构可疑项（缺中文、残句、错误配对、占位、义项错位）。人工审核补充项和报告标记项，对普通记录抽查各册。保存审核范围和未审核范围，不宣称整份逐句人工审校。仍有必须字段缺口时阻止发布用产物。
- [ ] 生成合并产物，在 `src/data/wordbooksCorpus.test.ts` 验证 1,047/1,164/12/804/243 和 3,707 公共英语词条。本任务暂不改变运行时 seed，Task 2 安装目录时再接入，避免只有新词却没有来源目录的半接入状态。
- [ ] 新增离线 `check:wordbooks` 命令只验证已提交产物、引用与报告，无原始文件也可构建；导入命令 `import:primary` 需要用户源文件但 CI 不需要该路径。测试与 typecheck 通过后提交 `feat: normalize primary Oxford vocabulary into shared English catalog`。

## Task 2：IndexedDB v7 原子安装与旧记录保留

**Files:** `src/data/storage.ts`、`src/data/wordbooksStorage.test.ts`、`src/types.ts`。

**Consumes:** Task 1 的 bundle、WordbookCatalog、WordbookId。

**Produces:**

```ts
// PalabraStorage 新方法；原语言读取与进度方法保持兼容。
getWordbooks(): Promise<WordbookCatalog[]>
getWordbookVocabulary(id:WordbookId): Promise<VocabularyEntry[]>
// options 增加 wordbookBundle?:EnglishWordbookBundle；便于小 fixture 测试。
// UserSettings 增加 englishWordbook?:WordbookId、primaryNewWordRange?:PrimaryRange。
// ActiveSession/StudySession 增加 sourceWordbook?:WordbookId、reviewScope?:'book'|'all-english'。
```

- [ ] 创建 v6 数据库 fixture，写入一个 `en:apple` 熟练进度、英语含错误反馈的活动会话、历史、设置、西语 day、AI 缓存和 Wordle。关闭后使用新 Storage 打开，断言保留每一条值；仅允许缺失来源字段补默认高考。默认选书高考，不更改已选语言。
- [ ] 写复用 ID 测试：

```ts
const high=await db.getWordbookVocabulary('en-highschool')
const primary=await db.getWordbookVocabulary('en-oxford-primary')
expect(primary.find(w=>w.term.toLowerCase()==='apple')?.id)
  .toBe(high.find(w=>w.term.toLowerCase()==='apple')?.id)
expect((await db.getAllProgress('en')).filter(p=>p.wordId==='en:apple')).toHaveLength(1)
```

- [ ] 运行失败用例，再升级 DB_VERSION=7，新增 `wordbooks` store，游标给旧英文会话填 sourceWordbook。英语公共 seed + 两个目录 + metadata 在同一个 transaction 中校验引用后写入；revision 均一致时不重写。保留西语原子更新流程，不跨语言重置。
- [ ] 同时修改 `englishVocabulary.ts` 为导入新公共产物并叠加原关系资料，旧高考 JSON 仅作导入来源；更新 `vocabulary-en.test.ts` 分别检查公共词数3,707、高考目录3,464、小学目录1,047，ID 校验使用规范化显示词形，保留关系来源/HTML 排除测试。
- [ ] 小 fixture 的现有 `vocabularySeeds.en` 在未提供 wordbookBundle 时生成仅高考目录指向该 fixture，不把生产小学目录引入测试；生产默认使用完整 bundle。非法成员引用直接拒绝初始化，不返回半空词书。
- [ ] 注入事务中途失败断言旧公共词、目录、metadata 均不改变；用 spy 检查重复读取不再次 put，测试 close→重开和第二连接 versionchange。不能通过清库重试解决升级。
- [ ] 测试 `clearLearningData('en')` 清除所有英语共享记录和会话但保留目录、词条、AI、Wordle、西语；来源版本变化不能删除学过但仍被任一目录引用的词。
- [ ] 运行 `npm test -- src/data/wordbooksStorage.test.ts src/data/storage.test.ts src/data/aiStorage.test.ts src/data/wordleStorage.test.ts src/spanish/storage.test.ts` 与 typecheck；提交 `feat: persist shared English wordbooks with safe v7 migration`。

## Task 3：候选集、共享统计和会话恢复

**Files:** `src/wordbooks/catalog.ts`、`catalog.test.ts`、`planning.ts`、`planning.test.ts`、`src/app/AppState.tsx`、`src/wordbooks/WordbooksApp.test.tsx`。

**Interfaces:**

```ts
export function matchesPrimaryRange(member:WordbookMember,range:PrimaryRange):boolean
export function projectWordbook(words:readonly VocabularyEntry[],book:WordbookCatalog,
  range?:PrimaryRange):VocabularyEntry[]
export function buildWordbookGroup(args:{words:VocabularyEntry[];book:WordbookCatalog;
  range:PrimaryRange;progress:Record<string,WordProgress>;sessions:StudySession[];
  goal:number;mode:StudyMode;reviewScope:'book'|'all-english';now:Date;extra?:number}):DailyPlan
// AppState 新增 wordbooks、selectedWordbook、bookVocabulary、studyVocabulary、allEnglishDueCount。
// vocabulary 保持完整当前语言公共词典，避免旧会话/详情找不到书外词。
// setEnglishWordbook(id:WordbookId):Promise<void>
// startSession 新增可选第三参 reviewScope，默认 'book'；旧调用保持兼容。
```

- [ ] 写年级组合失败测试：

```ts
const member={wordId:'en:apple',order:0,memberships:[
  {sourceBookId:'g1s1',grade:1,semester:1},
  {sourceBookId:'g2s2',grade:2,semester:2}]} as WordbookMember
expect(matchesPrimaryRange(member,{grade:1,semester:2})).toBe(false)
expect(matchesPrimaryRange(member,{grade:2,semester:2})).toBe(true)
```

- [ ] 写同词新词排除、日目标共用、词书复习与全部复习、十词上限、显式额外五词及熟练排除用例。fixture 使用五个 VocabularyEntry，其中两词同时归属两本书；现有 `createProgress`/`markFluent` 构造共享 progress。全英语完成10词的 sessions 与 goal=10 必须使换书后的新组为空。
- [ ] 运行 `npm test -- src/wordbooks/catalog.test.ts src/wordbooks/planning.test.ts` 确认失败，实现组合匹配：在同一个 memberships.some 回调里同时判断 grade 与 semester。projectWordbook 根据引用得到同 ID 的呈现视图，优先选择已核验 senseIds/exampleKeys；不修改公共对象。

```ts
return member.memberships.some(m =>
  (range.grade === undefined || m.grade === range.grade) &&
  (range.semester === undefined || m.semester === range.semester))
```

- [ ] buildWordbookGroup 按 mode 选候选：learn=书内新词范围，review/book=全书不受年级筛选，review/all-english=全英语。然后调用原 buildEnglishGroup，传入全英语 progress 和 sessions，使日目标不因换书重置；保持新词与复习独立入口。
- [ ] 更新 AppState 的所有词条取值用途：页面浏览用 bookVocabulary；四关题目/干扰项用活动会话来源的 studyVocabulary；词条详情与进度读公共 vocabulary/progress。旧会话无 sourceWordbook 时默认为高考，all-english 复习用公共候选。保存来源在同一个创建会话事务里。
- [ ] 新 App 集成测试写交错 Promise：先选小学后选高考，使第一个请求最后返回，页面和持久设置均须最终为高考。选书/语言更新用串行设置写入加 UI 代次校验；仅 UI 防旧响应不够，DB 也不能留下过时选择。加载失败保持原值并显示可重试错误。
- [ ] 测试高考未完成组时切小学：小学词库可浏览；开始按钮恢复原 group id、原 wordIds、原 hints/feedback，来源仍高考。原组完成后才创建小学组；刷新和第二标签页创建组仍遵守现有 CAS。
- [ ] 运行本任务测试与 `src/domain/memoryRounds.test.ts`、`src/domain/choiceOptions.test.ts`、`src/App.test.tsx`；提交 `feat: share English memory while selecting study wordbooks`。

## Task 4：选书、筛选、详情与共享状态界面

**Files:** 新组件 `WordbookSwitch.tsx`、`PrimaryRangeFilter.tsx`；修改 EnglishToday、LibraryPage、ProgressPage、SettingsPage、ResultPage、EnglishStudyPage、WordRelations 和 App.module.css。

**Interfaces:**

```ts
export function WordbookSwitch():React.JSX.Element // 消费 AppState
export function PrimaryRangeFilter(props:{value:PrimaryRange;
  onChange:(value:PrimaryRange)=>void;label:string}):React.JSX.Element
```

- [ ] 在 WordbooksApp.test.tsx 写选择后共享状态测试，继续使用真实 fake-IDB 而不是 mock 进度：

```ts
await user.click(screen.getByRole('button',{name:'小学必背单词（牛津版）'}))
expect(screen.getByRole('button',{name:'小学必背单词（牛津版）'}))
  .toHaveAttribute('aria-pressed','true')
await user.click(screen.getByRole('link',{name:'词库'}))
await user.click(await screen.findByRole('button',{name:/apple/}))
expect(await screen.findByText('已标为熟练 · 无需复习')).toBeInTheDocument()
```

此例先在 fixture 将重合词 apple 标熟练，从今日进入词库再打开对应详情；不要让 UI 查询依赖碰巧唯一的生产词汇。另测筛选/搜索、当前书外词详情、旧高考 URL 和回到学习。
- [ ] 实现文字式词书选择（钴蓝下划线、不做新导航）。小学筛选用有 label 的年级/学期控件；词库本地浏览筛选与今日持久新词范围分开。清除搜索和已背视图的规则随切书重置，保留列表80条分批呈现。
- [ ] 今日清楚显示新词范围、当前书复习及“全部英语待复习 N”；恢复按钮显示来源书。进度页给出“英语共享记忆”与本书成员完成度，英语总数只按唯一 ID，不合计两个书的数量。每日目标仍全英语共用。
- [ ] 设置英语清空按钮改为“清空全部英语学习记录”，确认文案明确两本书共同重置。测试取消不写、确认清英语不动西语/AI/Wordle。语言是西语时保持原西语确认语义。
- [ ] 详情从公共词典 resolve wordId，按可选书参数挑展示资料；书外词标记，不静默切书。WordRelations 链接查公共词典，携带呈现上下文且回退仍返回原组。学习中的选择题候选必须来自 studyVocabulary，并排除全英语当天已学词。
- [ ] 测试中文义项全文、X-ray、短语提示不会吞空格标点；现有 buildSpellingHint 已支持标点保留，不为此重写算法。按选书变化停止正在播放的词音/句音，避免旧声音盖过新页面。
- [ ] 运行 `npm test -- src/wordbooks/WordbooksApp.test.tsx src/components/WordRelations.navigation.test.tsx src/pages/EnglishStudyPage.test.tsx src/domain/spellingHint.test.ts` 与 typecheck；提交 `feat: add primary wordbook selection and grade filters`。

## Task 5：Wordle/AI/音频边界、离线包与完整验收

**Files:** `src/wordle/controller.ts`、`controller.test.ts`、`src/components/AudioPackSettings.tsx`、`src/audio/audioPack.ts`、`audioPack.test.ts`、`vite.config.ts`（仅必要时）、`docs/primary-wordbook-validation.md`。

**Consumes:** `getWordbookVocabulary('en-highschool')`、公共词典、当前书及来源上下文；不新增核心数据接口。

- [ ] 写 Wordle 回归：fixture 在小学新增一个不在高考的五字母词，题池计数与可选答案仍只有高考成员；当前游戏 ID 和答案不随切书变化。将 `WordleController.initialize()` 的 `this.db.getVocabulary('en')` 改为 `this.db.getWordbookVocabulary('en-highschool')`，ECDICT 校验逻辑不变。
- [ ] AI 回归：同词同输入摘要切书复用成功缓存；小学展示资料造成摘要变化时按现有缓存键规则处理，不清空旧缓存，不在无提示回忆/拼写时泄漏分析。关闭 AI 后原有词音仍可用。
- [ ] 音频包文案明确“高考词库音频包”。`audioPack.ts` 在生成 englishAudioFiles 前用高考目录 wordId 集合过滤公共词典，测试小学独有音频不进列表、重合词只一次、缓存版本不无故递增删除已有文件。新增无音频词使用现有系统发音，失败给明确提示；不批量请求第三方录音。
- [ ] 运行 `npm run check:wordbooks`、`npm test`、`npm run typecheck`、`npm run build`。构建若单个词库资源超过预缓存 5MB 限制，拆分规范化数据资源并确保全部入缓存，不把原85MB文件加入或盲目放大缓存上限。检查产物无 source 文件绝对路径/HTML/密钥。
- [ ] 启动生产预览，在 `/palabra-pwa/` 下以新测试资料验证：高考标熟练→小学相同词已熟练→小学未学词完整四关→查看共享统计→退出未完成组切书→恢复原组。记录刷新与跨日行为；不得修改用户现有测试以外的学习数据。
- [ ] 等待 Service Worker 确认缓存完成，再断网重启，切换两书、浏览全部小学词、完成学习、重开查看结果；检查8条补充例句和4条释义都在离线产物。不依赖 dev server 证明生产离线。
- [ ] 检查390×844、430×932、768px和桌面深浅色，以及先执行的手机布局计划不回归。仅记录真实测试和截图；在线录音与真实手机语音未验证时单列，不能宣称完整离线发音。
- [ ] 报告记录语料审核范围、剩余缺口、自动测试与手动闭环证据；执行全分支代码审查，修复实质问题再复测。只本地提交 `test: verify shared wordbooks and offline primary course`，不自动 push/PR/deploy。

## 计划自检与执行顺序

推荐先执行手机布局计划 Tasks 1–3，再执行本计划 Tasks 1–5；接口互不依赖，先恢复易用性，再验证加入词书后不回归。语料、旧记录、共享记忆、筛选、恢复、外部功能边界与离线均有对应任务。每个任务先红后绿，限制提交范围；生产内容未补齐或旧记录迁移不通过就停止进入发布验收。

实施前请用户审阅两份计划并选择：本会话逐项执行，或子代理分工逐项审查。收到计划确认前不写产品代码。
