# 好友小组自动打卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 私人好友小组共享实际练习数量、每日一句话和轻提醒，离线背词后可靠补传，保留现有学习体验。

**Architecture:** GitHub Pages 前端、现有 IndexedDB 学习库和 Supabase 匿名认证/Postgres。学习事务生成本地去重台账及汇总待传项，独立同步器只上传数字与主动发布的留言。所有云端对象使用 `palabra_` 前缀，私有凭据位于 `palabra_private` schema；只暴露窄 RPC，不赋予客户端直接表写权限。

**Tech Stack:** React 19、TypeScript、CSS Modules、IndexedDB v8、Supabase JS v2、Supabase CLI/local Postgres、pgTAP、Vitest。新增依赖在计划批准后安装并锁定版本。

**Spec:** `docs/superpowers/specs/2026-09-30-social-study-groups-design.md`（含 2026-10-01 数据库版本修订）。

## Global Constraints

- 当前已发布源码树为 `ebad4a0`，远端合并提交 `08809c3`；保留小学词书与手机输入布局。实现前检查最新状态，不覆盖其他改动。
- 每个身份同时加入一个私人小组，每组最多 10 人，包含组主。
- 每个身份同时绑定一个有效设备登录；身份恢复会替换旧绑定，不支持多设备同时打卡。
- 组名 2–30 字，昵称 1–20 字，留言最多 100 字，均按 Unicode 字符计数，只渲染文本。
- 小组统一按 `Asia/Shanghai` 划分日期；本机原有每日计划仍按本机日期。
- 邀请码 7 天有效；每位发送者对同一成员的每种提醒每天各一次。
- 显示最近 30 天汇总及留言；提醒保留 30 天。
- 恢复码 256 位、邀请码至少 128 位密码学随机值；只在 HTTPS 请求体传递，服务器只保存 SHA-256 摘要。不进 URL、日志、分析工具、Service Worker 缓存。
- 不上传词条 ID、答题内容、完整会话、AI 密钥/缓存或 Wordle 记录。不追溯上传加入前历史。
- 英语按公共词条 ID 去重，高考与小学共用；英语新词目标和西语总目标分别计算，不相加百分比。
- 小组页面前台每 60 秒更新；同步每轮最多三次，退避 1/3/9 秒加 0–500ms 抖动；每个请求 15 秒超时。关闭应用不承诺后台同步。
- 恢复/邀请码每 UID 每小时最多 5 次失败；创建组每资料每天最多 3 次；普通写接口每 UID 每分钟最多 30 次。失败计数必须提交，不能依赖抛异常回滚后的计数。
- 身份端点项目级默认熔断阈值：每分钟 100 次新建/恢复请求；管理员可以通过私有配置关闭。到达阈值返回忙碌，不自动增加套餐额度。
- 本地学习清空不删除组身份/台账；云端删除使用独立确认操作。退出身份清除组缓存与凭据，不删除本地词汇学习。
- 云端变更前读取现有表/函数/授权；不覆盖无关对象、不降低已有安全设置、不启用付费服务。涉及认证/验证码的配置时单独说明准确范围并确认，验证码由用户完成。
- 本轮交付为实施计划；产品代码、数据库迁移执行和公开部署要在计划审阅后开展，不能把文档提交当作功能上线。

## Review Focus

1. 恢复和上传交错、旧 JWT 尚有效：旧设备和旧资格必须立即失权；Task 2/4/6 包含并发测试。
2. 服务端成功但客户端响应丢失：恢复码不能二次消费；旧同步确认不能删掉更新队列；Task 2/4/6 重放测试。
3. 已背过的跨词书单词、半组结束、标熟练、北京时间跨日：不虚增、不按组完成才计入；Task 1/5 测试。
4. 小组故障、浏览器配额不足、被移除后离线缓存：不阻断正常背词、不将旧缓存显示成实时授权；Task 5/6/7 测试。
5. 猜测 ID、并发第十名、成员离组再加入：不能读到不应共享的历史，不能遗留无主组；Task 3/4/8 权限矩阵测试。

## 文件与边界

| 模块 | 文件 | 责任 |
| --- | --- | --- |
| 统计契约 | `src/groups/types.ts`, `projection.ts`, `projection.test.ts` | 日期、去重、目标快照、最终结果更新 |
| 云端认证 | `supabase/config.toml`, `supabase/migrations/20261001000100_palabra_identity.sql`, `supabase/tests/database/identity.test.sql` | profile、设备绑定、恢复码、幂等回执、全局开关 |
| 云端组 | `supabase/migrations/20261001000200_palabra_groups.sql`, `supabase/tests/database/groups.test.sql` | 邀请、容量、权限、组主和离组 |
| 云端内容 | `supabase/migrations/20261001000300_palabra_activity.sql`, `supabase/tests/database/activity.test.sql`, `supabase/tests/integration/races.mjs` | 快照、留言、轻提醒、清理、并发授权 |
| 本地存储 | `src/groups/local.ts`, `local.test.ts`, `src/data/storage.ts`, `src/groups/tracking.test.tsx` | v8、同事务台账、队列、auth 适配器 |
| 远端同步 | `src/groups/client.ts`, `identity.ts`, `sync.ts`, 各自 `.test.ts` | 匿名认证、恢复、有限重试、多标签锁 |
| UI | `src/groups/GroupsProvider.tsx`, `GroupsPage.tsx`, `IdentityPanel.tsx`, `GroupAdmin.tsx`, `GroupMembers.tsx`, `Groups.module.css`, `GroupsApp.test.tsx` | 独立入口、成员列表、发布、管理、错误状态 |
| 集成 | `src/App.tsx`, `src/pages/TodayPage.tsx`, `src/pages/EnglishToday.tsx`, `src/pages/SettingsPage.tsx`, `src/app/AppState.tsx`, `src/spanish/SpanishProvider.tsx` | 路由和实际持久化事件边界 |
| 验收 | `.env.example`, `scripts/test-groups-integration.mjs`, `docs/groups-operations.md`, `docs/groups-validation.md`, `package.json`, `vite.config.ts` | 环境、权限测试、升级/回退和验收记录 |

## Task 1：固定打卡口径及纯函数

**Produces:** 以下类型和函数；不产生网络请求。

```ts
type PracticeKind = 'new' | 'review'
type PracticeOutcome = 'passed' | 'assisted' | 'wrong' | 'skipped'
interface GroupBinding {
  profileId: string; groupId: string; membershipId: string
  membershipGeneration: number; deviceGeneration: number
  joinedAt: string; enabled: boolean
}
interface CheckinEvent {
  wordId: string; language: 'es' | 'en'; kind: PracticeKind
  outcome: PracticeOutcome; at: string; goal: number
}
interface CheckinDay {
  key: string; date: string; language: 'es' | 'en'; goal: number
  entries: Record<string, {kind: PracticeKind; outcome: PracticeOutcome; at: string}>
  version: number; lastPracticedAt: string
}
interface SummaryPayload {
  membershipId: string; membershipGeneration: number; deviceGeneration: number
  date: string; language: 'es' | 'en'; version: number; goal: number
  newCount: number; reviewCount: number; skippedCount: number; lastPracticedAt: string
}
groupDate(at: string): string
recordCheckin(day: CheckinDay | undefined, binding: GroupBinding, event: CheckinEvent): CheckinDay | undefined
toSummary(day: CheckinDay, binding: GroupBinding): SummaryPayload
completionRate(summary: SummaryPayload): number
```

- [ ] 写日期和去重失败测试，测试以明确输入构造，无需访问生产数据库：

```ts
expect(groupDate('2026-10-01T15:59:59Z')).toBe('2026-10-01')
expect(groupDate('2026-10-01T16:00:00Z')).toBe('2026-10-02')
const binding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,
  deviceGeneration:1,joinedAt:'2026-10-01T00:00:00Z',enabled:true}
const event={wordId:'en:apple',language:'en',kind:'new',outcome:'skipped',
  at:'2026-10-01T01:00:00Z',goal:10} as const
const first=recordCheckin(undefined,binding,event)!
const next=recordCheckin(first,binding,{...event,kind:'review',outcome:'passed',goal:20})!
expect(toSummary(next,binding)).toMatchObject({newCount:1,reviewCount:0,skippedCount:0,goal:10})
expect(toSummary(next,binding)).not.toHaveProperty('entries')
```

- [ ] `npx vitest run src/groups/projection.test.ts` 观察失败；补加入前事件、关闭、两个词书同 ID、30 天范围、错误/辅助不得清除 skipped 状态、同日通过后不退化、EN 与 ES 不同分母测试。
- [ ] 用 `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts()` 拼接日期，不依赖浏览器格式标点。台账键包含 profile/device/membership/date/language；首条事件冻结 goal/kind；不同日/身份不能复用 day。
- [ ] 实现结果优先：无辅助 passed 覆盖 skipped；否则 skipped 保留到当日独立通过；较旧事件不覆盖新结果。数量只由 entries 派生；网络载荷显式白名单构造，禁止对象展开整个台账。
- [ ] 运行测试并提交 `feat: define private group check-in accounting`。

## Task 2：本地 Supabase 身份与恢复协议

**Files:** identity migration/tests、config、package scripts；只运行本地测试实例。

**Produces:** `RpcResult<T> = {ok:true,data:T}|{ok:false,code:string}`，业务失败返回结果而非回滚计数；transport/数据库内部错误仍作为异常处理。

**RPC contracts**（参数均为 `p_` 前缀；公开函数固定 `search_path=''`，全限定对象名）：

```text
palabra_register(p_nickname text,p_recovery_hash text,p_operation_id uuid)
  -> {profileId,nickname,deviceGeneration}
palabra_recover(p_code text,p_next_hash text,p_operation_id uuid)
  -> {profileId,nickname,deviceGeneration,binding|null}
palabra_operation(p_operation_id uuid) -> 已提交结果或统一 NOT_FOUND
palabra_rotate_recovery(p_next_hash text,p_operation_id uuid) -> {deviceGeneration}
palabra_self() -> {profileId,nickname,deviceGeneration,binding|null,receiveNudges}
palabra_update_profile(p_nickname text,p_receive_nudges boolean,p_operation_id uuid)
```

- [ ] 检查 Docker 服务是否可用，计划批准后安装锁定的 Supabase CLI 开发依赖；`supabase init/start` 仅本地。增加 `test:groups:db = supabase test db`，不对远端运行 reset。
- [ ] 编写 pgTAP：在事务中模拟 auth.users 和 `request.jwt.claims`；无认证 register 失败，注册相同 operationId 不多建；新 UID 恢复成功后旧 UID 调用 self 返回 DEVICE_REPLACED；响应丢失后新 UID 用 operation 查到相同提交结果。

```sql
begin;
select plan(2);
set local role anon;
select throws_ok('select public.palabra_self()', '42501');
reset role;
select ok(not has_table_privilege('authenticated',
  'palabra_private.recovery_credentials','SELECT'),'recovery hashes are private');
select * from finish();
rollback;
```

- [ ] 首次运行观察函数/表不存在的失败；建立 public.palabra_profiles、private.device_bindings、recovery_credentials、operation_receipts、rate_limits、feature_settings。绑定 auth UID 唯一、profile 唯一；profile id 不随设备恢复变化。
- [ ] 所有表启用 RLS，客户端无直接表 grant；撤销 PUBLIC/anon 默认函数执行权，仅 authenticated 获具体 RPC 执行权。私有 `current_profile()` 每次检查当前绑定，不能只检查 JWT 内 profile 字段。
- [ ] 恢复锁定 recovery 记录及 profile；校验旧摘要，更新新摘要、替换绑定、递增设备代次、写回执同事务提交。新 UID 已有另一 profile 时拒绝合并。回执查询同时校验调用 UID 和 op id；不得返回秘密或其他身份回执。
- [ ] 业务失败先消耗失败次数并正常返回；第六次失败返回 RATE_LIMITED。无效与未知恢复码同文案。测试两个并发恢复只能一个成功、已消费旧码失败、同 operation 不同参数拒绝（回执保存参数摘要）。
- [ ] 增加纯前端 `makeSecret(bytes:16|32):string` 使用 getRandomValues 和 hex、`hashSecret(code):Promise<string>` 使用 SubtleCrypto；校验分组空格归一化和长度，不降低随机度。单测 mock 随机源仅用于验证长度与编码，不在产品使用测试随机值。
- [ ] 身份全局开关与阈值按数据库事务锁检查；默认生产关闭，本地测试显式开启。运行 pgTAP 后提交 `feat: add revocable group identity and recovery RPCs`。

## Task 3：私人小组、邀请、管理与访问边界

**Consumes:** Task 2 身份校验和幂等回执。
**Produces RPC:**

```text
palabra_create_group(p_name,p_invite_hash,p_operation_id) -> GroupBinding + group
palabra_preview_invite(p_code) -> {name,memberCount}（不含成员/组 ID）
palabra_join_group(p_code,p_operation_id) -> GroupBinding + group
palabra_group() -> {group,memberProfiles,binding}
palabra_manage_group(p_action,p_target_profile_id,p_name,p_invite_hash,p_operation_id)
  action = rename|rotate_invite|remove|transfer|leave|dissolve
```

- [ ] 先写 SQL 测试：非成员 group 拒绝；跨组 target 拒绝；自己提醒不在本任务；入满组不写 membership；旧邀请码轮换后失效；组主 leave 拒绝直到 transfer/dissolve。
- [ ] 创建 public.palabra_groups/memberships 和 private.group_invites。活动成员部分唯一索引 `(profile_id) where left_at is null`；邀请只存摘要与失效时间。返回 binding 包含服务器 joinedAt，不由客户端指定。
- [ ] create/join/manage 都先锁身份绑定、再锁 group，锁顺序一致。join 在持有 group 行锁时计数检查 <10；member资格每次新加入生成新 ID 和代次。删除、转交验证当前组主且目标是同组有效成员。
- [ ] 恢复与 manage 共用 profile/绑定锁顺序，避免刚被替换 UID 通过一次身份检查后继续写。所有 RPC 事务内权限判断与写入不可分离。
- [ ] 邀请失败消耗 Task 2 限额，过期/未知/已撤销使用统一 INVITE_INVALID；预览也计入失败上限。创建频率通过独立尝试记录，不因解散删除计数。
- [ ] `supabase/tests/integration/races.mjs` 使用两个独立数据库连接并发 join 第十名；断言仅一个成功且总人数 10。脚本只接受本地 loopback 数据库地址，拒绝生产 URL。
- [ ] 运行 SQL 和并发测试，提交 `feat: add private groups and membership controls`。

## Task 4：云端快照、留言、轻提醒与删除

**Produces RPC:**

```text
palabra_sync_summary(p_payload jsonb) -> {acceptedVersion,deviceGeneration,conservative}
palabra_publish_note(p_membership_id,p_membership_generation,p_device_generation,
  p_date,p_version,p_text) -> {acceptedVersion}
palabra_activity(p_from_date) -> {summaries,notes,nudges,serverTime}
palabra_send_nudge(p_target_profile_id,p_kind,p_operation_id) -> {id,createdAt}
palabra_read_nudge(p_nudge_id) -> {id,readAt}
palabra_delete_profile(p_operation_id) -> {deleted:true}
```

- [ ] 写失败测试：重发 summary v1 只一行；v2 后 v1 不覆盖；相同版本不同内容返回 VERSION_CONFLICT；用户 A 伪造他人 membership 拒绝；隐藏任意未允许字段（如 wordIds）返回 INVALID_PAYLOAD。
- [ ] 建每日设备快照与聚合快照表，包含 membership/date/language/device/version。授权从 UID 推导，传入 ID/代次仅用来拒绝过时任务；不能用于选择任意用户写入。
- [ ] 换设备当天先锁聚合行，new/review 分别 max(old,new)，skipped=max 但上限总量，goal 保留首份；次日正常替换。member card conservative 标记不能丢。校验整数非负、goal 英语5/10/15/20或西语10/20/30/50、数量每类≤100000、日期在北京时间30天内且不晚于今天。
- [ ] notes 每资格每日一条、版本递增；空文本删除内容但保存版本 tombstone。服务端 char_length 限制100。只有点发布才排队，draft 不上传。
- [ ] nudges 唯一 `(sender,receiver,group,date,kind)`，kind=remind|cheer；当前同组、不能自己、接收偏好即时检查；同版本/operation 重放不再次发，离线客户端不得排队。
- [ ] activity 逐项验证读者/作者当前有效资格及记录 membership，且 `date >= groupDate(reader.joinedAt)`；重新加入不看早于新加入日期的历史。read-nudge 仅当前接收者且仍有权限；发送者可见自己的发送回执但不能改已读。
- [ ] 删除本人资料事务级联清除汇总、留言、提醒、凭据和绑定；组主有活动组时拒绝，先转交或解散。首次成功后重放用 scoped tombstone receipt 确认，不能以返回 profile 资料的方式确认；业务删除不宣称删除整个 Supabase Auth 账号。
- [ ] 私有维护函数每小时清理过期邀请、30天前活动、失效限流桶；回执保留30天后过期明确不能再恢复。用本地 pg_cron 测试，生产 cron 开启另行确认；查询始终过滤期限，不依赖 cron 才实现隐私限制。
- [ ] 测试两设备恢复/上传交错、版本倒序、作者被移除、新成员猜历史日期、超过30天、SQL注入文本、Emoji字符计数、每日提醒限额与偏好关闭，运行数据库测试后提交 `feat: add idempotent group activity and nudges`。

## Task 5：IndexedDB v8 与真实学习事务接入

**Files:** local/types/storage、AppState、SpanishProvider、tracking tests。
**Consumes:** Task1 CheckinEvent / recordCheckin / SummaryPayload。

**Produces storage interfaces:**

```ts
getGroupBinding(): Promise<GroupBinding | undefined>
saveGroupBinding(binding: GroupBinding | undefined): Promise<void>
getGroupOutbox(): Promise<GroupOutboxItem[]>
ackGroupItem(key: string, version: number): Promise<void>
saveGroupDraft(date: string, text: string): Promise<void>
publishGroupDraft(date: string): Promise<void>
readAuthItem(key: string): Promise<string|null>
writeAuthItem(key: string,value: string): Promise<void>
removeAuthItem(key: string): Promise<void>
```

`GroupOutboxItem` 判别联合：`{kind:'summary',key,version,payload:SummaryPayload}` 或 `{kind:'note',key,version,payload:{membershipId,membershipGeneration,deviceGeneration,date,text}}`；不得含 wordId。另新增 groupState、groupLedger、groupOutbox、groupCache、groupAuth、groupDrafts 六个 store；state 同时保存租约及待完成身份操作。

- [ ] 创建真实 v7 fixture，填入小学词书目录、英语/西语进度、未完成会话、AI配置和Wordle；写升级后逐字段保留测试。无入组时验证不产生台账/请求。
- [ ] `commitStudyStep(..., daily?, checkin?:CheckinEvent)`、`completeStudyGroup(..., daily?, checkin?:CheckinEvent)`、`commitSpanishStep(..., completed?, checkin?:CheckinEvent)` 新增末尾可选参数，保留旧调用。检查 transaction stores 包含 groupState/groupLedger/groupOutbox；在 CAS 通过的同一 IDB 事务读取 binding，再同步读取/更新该日 ledger 和待传快照，不在事务中 await 网络或异步加密。
- [ ] 添加 `putGroupCheckin(tx,event)` 只用 IDB request 回调链；绑定无效/未加入/事件早于joinedAt则不写；事务失败全部回滚。模拟配额不足及过时 session，不能出现学习没存而打卡已存。
- [ ] 英语在 `continueAfterQuiz` 确认 spelling 关队列真正结束该词时发 passed；辅助正确但仍待复测不计完成；`skipSpellingWord` 发 skipped。四关前3关与 `markCurrentWordFluent` 不发事件。最后一个词同时传入 completeStudyGroup，不能遗漏。
- [ ] 西语 `SpanishProvider.persist` 接收明确的 CheckinEvent：只 submit/reveal实际提交/skip产生，hint/draft/next/fluent 不产生；按 active.newWordIds 的初始类别，不能用已有progress存在与否在复测时改类别。延续旧西语流程时在实际自评/答题持久化入口发事件，不从旧历史补算。
- [ ] goal 在事件发生时读取设置，但 recordCheckin 首次冻结当日goal。新台账按北京时间独立键，不使用已有 `SpanishDailyUpdate.date` 作为小组日期。
- [ ] 写 tracking 集成：高考与小学 apple 同日只一条；十词组完成一个后退出可上传一个；标熟练零；跳过后来passed更新skipped；23:59/00:00两条；未加入时整组学习仍正常。
- [ ] 清空学习保留group stores；退出身份只清认证/小组只读缓存和禁用队列；旧资格待传项隔离，不转投新组。Auth适配器统一存groupAuth，SDK不能再同时使用localStorage。
- [ ] 运行本任务与全部现有存储/课程测试，提交 `feat: track actual study in atomic group outbox`。

## Task 6：身份客户端、可靠同步和跨标签保护

**Files:** client/identity/sync/GroupsProvider + tests。
**Produces:**

```ts
interface GroupRemote {
  summary(payload:SummaryPayload,signal:AbortSignal):Promise<RpcResult<{acceptedVersion:number}>>
  note(payload:Extract<GroupOutboxItem,{kind:'note'}>['payload'],version:number,signal:AbortSignal):Promise<RpcResult<{acceptedVersion:number}>>
}
syncGroupOutbox(storage:PalabraStorage,remote:GroupRemote,signal:AbortSignal):Promise<void>
```

- [ ] 安装并锁定 `@supabase/supabase-js` v2。创建懒加载singleton，以 IDB Auth适配器保存会话；无配置或小组关闭时不创建Auth用户。只有用户点同意/创建/恢复才能调用 signInAnonymously({options:{captchaToken}})。
- [ ] `.env.example` 声明空的 VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY/VITE_TURNSTILE_SITE_KEY，VITE_GROUPS_ENABLED=false。secret/captcha服务端密钥不可使用VITE前缀；部署前检查dist无管理密钥。开发测试仅loopback允许HTTP，生产只HTTPS已配置项目。
- [ ] identity 在 register/recover/rotate 请求前把 nextSecret/opId/参数摘要作为待完成敏感记录存IDB，不进入缓存/日志。成功仍显示待保存恢复码，用户确认后删明文。网络响应丢失先查询operation，不另造operation或再次用旧码。
- [ ] 注册也使用幂等回执；用户未保存恢复码不能静默进入组。已绑定其他profile禁止直接recover；明确退出提示不会把本地学习进度云同步到另一身份。
- [ ] RED测试构造假remote：先服务器记录v1后抛网络错误，重传同payload；等待时本地v2入队，ack(v1)不能删除v2。并发两个sync只一个租约；租约30秒，10秒续租，持有者ID核对，过期才抢占。

```ts
await db.ackGroupItem(item.key,1)
expect((await db.getGroupOutbox()).find(x=>x.key===item.key)?.version).toBe(2)
```

- [ ] 网络/5xx/429 有限重试并尊重 Retry-After（超过一轮预算则等待下一次触发）；鉴权/DEVICE_REPLACED/MEMBERSHIP_REVOKED 不重试、隔离旧代次队列。无网不发；过期只标记不再补传，保留本地台账。
- [ ] GroupProvider监听online/visibilitychange、学习提交成功通知、手动按钮；合并触发，隐藏或禁用时中止请求和timer。每次上传之前从IDB读最新binding，避免闭包旧身份。设备被替换后立即隐藏缓存并通知其他标签。
- [ ] 测试无网、三次终止、abort、不吞授权错误、不同身份租约隔离、快速退出/恢复、令牌刷新失败；学习页加载不 await 远端且group异常不成为AppState.loadError。提交 `feat: sync group check-ins without blocking study`。

## Task 7：好友小组界面

**Files:** GroupsPage/IdentityPanel/GroupAdmin/GroupMembers/Groups.module.css/GroupsApp tests；现有Today/App/Settings。

- [ ] 用frontend-design技能实现原有练习纸/蓝色文字入口，不新增第五个底部Tab。`/groups`显示独立error/loading/offline/cachedAt，首页入口仅在配置可用时显示，未读数量为成功读取值而非猜测。
- [ ] RED组件测试先创建未加入fixture：页面只显示共享说明，不调用Auth；同意后填昵称、保存恢复码、创建/加入。复制恢复码失败时仍可手动选择，不假报复制成功。
- [ ] 组员按加入顺序显示而非排名；每人英语与西语两行，数量/目标率/跳过数/最后同步时间。无当日数据写“今日尚未同步”；保守统计有“今天更换设备”提示。
- [ ] 编辑框保存草稿与“发布”分离；点发布后离线为“待同步”，实际响应后才显示已同步；清空发布生成tombstone。发remind/cheer需在线，按钮pending禁用，成功后当日对应按钮不可重复。
- [ ] 组主次级管理入口支持改名/新邀请码/移除/转交/解散，普通成员离开；所有移除/离开/解散/删除资料需明确确认，提示旧待传记录不再共享。前端隐藏按钮不能替代RPC权限。
- [ ] Settings增加接收提醒开关、小组共享开关、恢复码轮换、退出身份、删除云端资料；关闭共享保留本地学习并停止新事件与上传，重新开启仅恢复有效资格队列。清空本机学习文案提示小组历史仍在保留期内。
- [ ] 屏幕阅读器状态用role=status/alert；输入标签、至少44px按钮、焦点返回；昵称/留言全部文本呈现。恢复码展示不截断，窄屏可换行。
- [ ] 测试XSS字符串只显示文本、不同成员权限、离线草稿不发布、接收关闭/限流准确提示、网络失败不影响开始背词、按语言独立率；运行组件测试并提交 `feat: add private study group check-ins UI`。

## Task 8：完整本地安全与离线验收

- [ ] `npm test`、`npm run typecheck`、`npm run build`、`npm run test:groups:db` 全绿；集成脚本显式创建本地匿名用户A/B/C/另一组D，通过普通JWT而非service-role调用RPC。
- [ ] 权限矩阵：anon全部成员读拒绝；A/B同组可以读允许日期；C未加入和D不同组均拒绝；恢复后的旧A令牌拒绝；移除后B拒绝；新B入组不看过去记录。
- [ ] 恢复响应丢失和join第十人同时并发、老版本快照覆盖、新旧device交换顺序，断言所有返回和数据库状态，而非仅HTTP成功。
- [ ] 用生产预览子路径、两个独立测试身份完整走“创建→加入→实际背词→离线保存→重开→补传→留言→提醒→恢复→旧设备失效”。若浏览器环境不支持独立profile，使用两个本地浏览器上下文或人工第二设备，缺口必须记录，不能以mock替代。
- [ ] 390×844、430×932、768px、桌面深浅色；学习页键盘布局不变。离线字典/AI缓存/Wordle回归；SW只缓存应用壳和现有词音，不缓存Supabase/验证码URL。
- [ ] 写 `docs/groups-validation.md`：每条实际结果、失败修复、未完成项。独立全分支审查，实质安全问题修复并重跑真实数据库测试，不能带未验证越权风险发布。
- [ ] 提交 `test: verify study group permissions and offline recovery`。

## Task 9：指定 Supabase 项目接入与发布门禁

项目限定 `bjhmqulttnipvnkeqbcc`，沿用用户提供的公开key；不要求用户在聊天里发管理secret。

- [ ] 只读检查远端已有schema、表、函数、policy、Auth设置与项目状态，核对正是用户项目。控制台不可读或管理权限不足时停止远端变更，继续保留本地已测试成果。
- [ ] 向用户说明准确变更清单并取得当次确认：新增palabra命名空间对象、受限RPC；开启匿名登录；启用验证码和认证限速；增加维护cron。不得擅自放宽其他表authenticated权限。用户在控制台填写Turnstile/hCaptcha服务端密钥；浏览器安全验证由用户完成。
- [ ] 先应用版本化SQL，生产feature_settings关闭。对已有对象冲突报错而非drop/recreate；执行前导出schema和迁移版本，失败停在明确迁移步骤。禁用功能回退，不删除学习或小组数据。
- [ ] 配置允许的正式站点域名和localhost测试来源；Captcha生产验证通过后才开启注册。公开URL/key/site-key由GitHub部署变量注入，management key绝不进构建。
- [ ] 由用户同意使用的测试昵称创建两身份，验证真实组内访问和陌生人拒绝、离线补传及恢复。不使用管理员SQL读取成功代替普通JWT权限验证。未完成真实验证码/旧设备撤权验证时，生产开关保持关闭。
- [ ] 用户确认发布后运行完整发布检查，推送PR并附任务，合并触发现有Pages工作流；成功后核对线上版本/资源与功能开关，观察首个组的错误状态。未经此门禁不声称“打卡功能已上线”。

## 自检与交接

覆盖关系：身份/恢复Task2+6；组管理Task3+7；统计Task1+5；同步Task4+6；留言/提醒Task4+7；授权/防滥用Task2–4+8；UI与兼容Task5+7+8；云端接入/回退Task9。数据库实际从v7升v8，不覆盖已上线词书store。

执行建议：本会话逐项实现（Native），每项先失败测试再实现，最后一次独立全分支审查；数据库权限与并发另外使用真实本地Postgres测试，不用前端模拟代替。

当前状态：等待用户审阅本计划和执行方式。尚未安装产品依赖、创建云端账号、执行迁移、启用匿名登录或改动线上权限。

官方依据（2026-10-01核对）：[匿名登录](https://supabase.com/docs/guides/auth/auth-anonymous)、[数据库函数与权限](https://supabase.com/docs/guides/database/functions)、[数据库测试](https://supabase.com/docs/guides/database/testing)。
