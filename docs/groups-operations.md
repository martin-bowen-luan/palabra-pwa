# 好友小组：接入与维护

当前仅完成本地实现与测试。生产默认关闭，未授权执行远端迁移或发布。

## 生产启用前的确认门

目标只限 `bjhmqulttnipvnkeqbcc`。先只读核对项目、现有 schema、表、函数、策略、迁移和 Auth 设置；导出 schema 与迁移版本。存在同名对象时停止，不删除重建。

须取得当次确认后才能：

1. 应用 `supabase/migrations/20261001000100_palabra_identity.sql`、`20261001000200_palabra_groups.sql`、`20261001000300_palabra_activity.sql`，保持 `palabra_private.feature_settings.enabled=false`。
2. 启用匿名身份、认证限速与 CAPTCHA。匿名身份也使用 authenticated 数据库角色，必须检查项目中其他应用的现有策略；本功能不放宽其他表权限。
3. 用户在 Supabase 控制台输入 Turnstile 服务端密钥，不发到聊天、前端或仓库。公开 site key 允许 `martin-bowen-luan.github.io`，测试来源另行限定。真实验证码由用户完成，不用测试 token 作为生产通过证据。
4. 创建一个每小时维护任务，执行 `select palabra_private.cleanup();`。先检查同名任务再建立，避免重复。该函数清理超期共享内容、邀请码、操作收据和限速计数；不删除完整学习数据，也不自动删除 Supabase Auth 用户。匿名账号数量需在控制台观察，另行确认账号清理策略。
5. 用经用户同意的两个测试昵称验证真实注册、入组、权限拒绝、离线补传、恢复及旧设备失效。通过后才打开数据库功能开关。
6. 单独取得发布授权后注入公开前端配置并推送/部署。不能把本地验证当作已经上线。

## 公开构建变量

见 `.env.example`：`VITE_GROUPS_ENABLED`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_TURNSTILE_SITE_KEY`。URL 使用 HTTPS 项目根地址。服务角色密钥、管理 token、数据库密码、验证码服务端密钥不得进入 Vite 构建。

默认关闭时入口隐藏，`/groups` 明确显示尚未开放。关闭数据库开关可立即拒绝小组 RPC；紧急回退先关数据库开关，再部署前端关闭开关。不要回滚删除表、清空 IndexedDB 或删除学习资料。

## 隐私及限制

- 所有业务表启用 RLS，撤销 anon/authenticated 直接表访问；只开放限定 RPC，并逐次检查当前设备绑定和组员资格。
- 每组最多 10 人，每人一组；邀请码 7 天有效，恢复码轮换后旧设备失效。代码仅保存哈希于服务器，显示的原码不要写日志或 URL。
- 仅上传按语言的每日总数、目标、时间及主动发布的留言。没有词 ID、答案、AI 配置或 Wordle 内容。
- 北京时间，最近 30 天且不早于入组日期。跨设备当天取最大值保守合并，可能少计但不会重复相加；身份恢复不迁移完整学习进度。
- 数据保留清理须有维护任务。删除云端小组资料不等于删除 Supabase Auth 用户。
- 私密小组的全局事务锁优先保证恢复/入组/上传的授权一致性；大规模使用前需评估吞吐量。
- 普通写入 30 次/分钟、创建小组 3 次/天、错误邀请码/恢复码 5 次/小时；服务还有限制新身份的全局门限。认证层需额外启用验证码及限速。

## 本地复验

仅使用独立 `palabra-groups-local` 项目与 `palabra-groups-local-test` Docker 网络，API/DB 仅绑定回环地址 55421/55422。不要将这些测试脚本指向远端项目。

```sh
npm test
npm run typecheck
npm run build
npm run test:groups:db
node supabase/tests/integration/http.mjs
node supabase/tests/integration/races.mjs
```

CLI 启动、迁移、重置和数据库测试都须带 `--network-id palabra-groups-local-test`。`db reset --local` 只允许用于该可丢弃测试数据库。HTTP 集成脚本的管理 SQL 仅用于临时夹具和清理；业务请求全部使用真实匿名用户 JWT。日志不打印 token 或恢复码。

## 官方参考

已核对 2026-10-01：[匿名身份与现有策略](https://supabase.com/docs/guides/auth/auth-anonymous)、[验证码保护](https://supabase.com/docs/guides/auth/auth-captcha)、[Cron](https://supabase.com/docs/guides/cron)、[Turnstile 客户端渲染](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)。
