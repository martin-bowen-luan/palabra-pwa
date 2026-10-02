# 好友小组：接入与维护

2026-10-02 当前状态：用户明确要求“全部开启，给你授权，不要询问”。在真实 Turnstile + Supabase 匿名登录成功后，已打开数据库小组开关并设置 GitHub 公开构建变量，进入推送部署流程。验证码、限速、RLS 与设备/组员授权检查均保留。

本次按用户明确授权先开放服务，不再以托管双身份/恢复闭环尚未完成作为上线阻塞；这些生产验收仍未完成，不能以本地通过冒充生产通过。真实手机、GitHub Pages 正式域名验证码和生产多设备闭环仍是验收缺口。以下接入记录按执行顺序保留，历史“关闭/待配置”不代表当前状态。

## 2026-10-02 生产接入记录

- 发布续项：PR #9 已合并，首次 Pages 发布（36958253161）在旧分组测试失败。日志停在第 9/10 词，测试连续点击时没有等待 IndexedDB 保存、下一词显示，部分点击被正常的保存防重入保护忽略。仅修正三个同类测试的条件等待，不关闭保护、不增加固定延时；本地 488/488 测试、类型检查与构建再次通过，等待后续 Pages 发布结果。
- 项目 `bjhmqulttnipvnkeqbcc`（palabra-groups）状态正常；迁移前 public 无业务表、函数或策略，其他项目未操作。
- 已导出 public 结构 `/tmp/palabra-production-before-20261002.sql` 与原迁移列表 `/tmp/palabra-production-migrations-before-20261002.txt`；原远端迁移为空。
- 先预演，再应用 `20261001000100`、`20261001000200`、`20261001000300`；未推送本地 Auth 配置或 Vault secrets。
- 远端核验：13 张小组表全部启用 RLS；anon/authenticated/PUBLIC 无直接表授权；公开 RPC 均为受限 SECURITY DEFINER，anon 无执行权限；数据库功能开关为 false。这不替代真实用户 JWT 的生产验收。
- 已核验唯一维护任务 `palabra-groups-cleanup`，每小时第 17 分钟执行 `select palabra_private.cleanup();`，active=true；清理命令只作用于小组超期数据。
- Auth 只读核验：匿名登录 false、CAPTCHA false、站点 URL 仍是 `http://localhost:3000`；未修改现有邮件/MFA 设置。
- 本次重新运行本地数据库测试：6 文件、85 项全部通过。
- 后续配置：用户提供公开 Site key `0x4AAAAAAFLnCeNj0eu6-PWE` 并确认在控制台配置私钥；只读核对 CAPTCHA=true、provider=turnstile。用独立最小配置仅更新 anonymous sign-ins=true、正式 Site URL 和 `http://localhost:5198/palabra-pwa/**` 测试回跳；每 IP 每小时匿名登录限额仍为 30。未发送或改变 CAPTCHA 私钥，邮件/MFA 等未声明属性保持不变。
- 服务端负向验证：使用无效验证码的匿名注册被 HTTP 400 `invalid-input-response` 拒绝；这不证明有效验证码成功。验证前基线 anonymous_users=0、profiles=0、groups_enabled=false。
- 重新运行全套测试时发现一处测试夹具混用动态加入时间与固定留言日期；统一固定日期后 487/487 通过，类型检查和携带正式公开配置的生产构建通过。现有大资源包警告仍在。
- 本机生产预览 `http://localhost:5198/palabra-pwa/groups` 已启动（真实 Supabase、真实 Turnstile），等待用户完成验证码并点击建立身份；开关关闭时预期小组 RPC 提示“服务暂未开放”，用于先确认真实 Auth 成功，不能声称小组已开放。
- GitHub Pages 工作流已准备公开变量注入，默认功能仍 false，新增类型检查；尚未设置 GitHub 变量、推送或部署。
- 下一步：真实验证码和普通用户 JWT 验收（包括双身份、恢复和旧设备撤权），通过后才开放小组并按授权发布。
- 浏览器诊断：内置浏览器曾返回 Turnstile 300030（challenge failure）；随后同一页面建立身份按钮已启用，但旧错误文本残留。修复成功回调清除旧错误，回归测试覆盖失败→恢复成功→过期重新禁用；先失败后通过，完整套件 488/488、类型检查及生产构建通过。未模拟或绕过真实验证码；测试页面仍等待用户实际提交，真实服务器成功路径尚未确认。

## 生产启用前的确认门

2026-10-02 发布授权覆盖了第 5 项“完成全部生产验收再开启”的先后顺序：先开启并发布，保留缺口；没有授权关闭安全保护或伪造验收。

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
