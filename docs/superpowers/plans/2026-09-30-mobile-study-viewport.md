# 手机学习页与键盘布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在手机键盘出现后保持学习页顶部操作、输入及主按钮可达，长题目仅在正文区域滚动。

**Architecture:** 增加英/西语共用的 StudyFrame 和可见视口适配器，分别负责布局与浏览器状态。迁移展示容器和聚焦策略，不改学习题目、调度和数据库；视口异常、放大或极矮屏回退可访问的普通滚动布局。

**Tech Stack:** React 19、TypeScript、CSS Modules、VisualViewport、Vitest、Testing Library，沿用现有项目依赖。

**Spec:** `docs/superpowers/specs/2026-09-30-primary-oxford-wordbook-design.md`，重点第 9 节。执行前完整读取。

## Global Constraints

- 保留 Source Serif 4 / Noto Sans SC、现有颜色变量、深色模式和最大 480px 内容宽度。
- 普通手机题目尽量一屏，长句/反馈允许正文滚动，不裁剪内容、不禁用缩放。
- 可操作元素至少 44px，输入文字不低于 16px，不提前显示测试答案。
- 不改复习算法、记忆状态或存储，不新增依赖，不推送或公开部署。
- 当前基线 `84ebb9b`；使用已存在的隔离工作树 `/home/martin/.codex/worktrees/fluent-word-fix/kai`，执行时再次检查 HEAD 和脏文件。
- 桌面缩窗不是手机软键盘验收；没有真机必须报告未验证项。

## Review Focus

1. 缩放和横屏被误当作软键盘，导致用户放大后内容被锁死：Task 1 的 scale/极矮屏测试。
2. 重复 resize/scroll 事件造成抖动、卸载后仍锁滚动：Task 1 的去重与恢复测试。
3. 点击西语重音按钮导致输入失焦、光标错误或整页跳动：Task 2 的中间插入与 focus 参数测试。
4. 很长的错误比较/AI 内容把继续按钮挤走：Task 2 的长内容组件用例，Task 3 的实际布局检查。
5. iOS 地址栏偏移、独立 PWA 安全区、中文输入法候选条与桌面不同：Task 3 的真机矩阵；不得用模拟通过代替。

## 文件边界

- 新建 `src/study/viewport.ts`、`viewport.test.ts`：纯函数计算可见框及回退模式。
- 新建 `src/study/useStudyViewport.ts`、`useStudyViewport.test.tsx`：订阅/清理浏览器事件，合并动画帧更新。
- 新建 `src/study/StudyFrame.tsx`、`StudyFrame.module.css`、`StudyFrame.test.tsx`：头部、滚动正文、底部答题区。
- 修改 `src/App.tsx`、`src/styles/global.css`、`src/styles/App.module.css`：只在学习路由消除外层最小高度造成的多层滚动。
- 修改 `src/pages/EnglishStudyPage.tsx`、`src/spanish/SpanishStudyPage.tsx`、`src/spanish/Spanish.module.css`、`src/components/SpellingAnswer.tsx`：将现有内容放入布局槽位与修正聚焦。
- 扩展现有 `src/pages/EnglishStudyPage.test.tsx`、`src/spanish/SpanishApp.test.tsx`；新建 `docs/mobile-study-validation.md` 记录真实证据。

## Task 1：可见高度与学习外框

**Interfaces:**

```ts
export interface ViewportSample {
  layoutHeight: number; visualHeight?: number; offsetTop?: number; scale?: number
}
export interface StudyViewport {
  height: number; top: number; compact: boolean; mode: 'bounded' | 'flow'
}
export function measureStudyViewport(sample: ViewportSample): StudyViewport
export function useStudyViewport(): StudyViewport
export interface StudyFrameProps {
  header: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode
  label: string
}
```

- [ ] 写纯函数回归测试，先用当前不存在的接口得到失败：

```ts
it('uses the visible height and its offset, not layout height', () => {
  expect(measureStudyViewport({layoutHeight:844,visualHeight:440,offsetTop:72,scale:1}))
    .toEqual({height:440,top:72,compact:true,mode:'bounded'})
})
it('keeps zoom and extremely short screens scrollable', () => {
  expect(measureStudyViewport({layoutHeight:844,visualHeight:380,scale:2}).mode).toBe('flow')
  expect(measureStudyViewport({layoutHeight:320,visualHeight:240,scale:1}).mode).toBe('flow')
  expect(measureStudyViewport({layoutHeight:844,visualHeight:0}).height).toBe(844)
})
```

- [ ] 运行 `npm test -- src/study/viewport.test.ts`，确认失败来自未实现的接口，而非测试环境错误。
- [ ] 实现计算规则：正且有限的 visualHeight 优先，否则用 layoutHeight；偏移至少 0；高度不足 320 或 scale 超出 0.95–1.05 时 flow；高度小于 600 时 compact。不能用固定“键盘高度”作减法。

```ts
const validHeight = Number.isFinite(sample.visualHeight) && sample.visualHeight! > 0
const height = Math.max(1, validHeight ? sample.visualHeight! : sample.layoutHeight)
const scale = sample.scale ?? 1
return {height, top:Math.max(0,sample.offsetTop ?? 0), compact:height < 600,
  mode:height < 320 || scale < .95 || scale > 1.05 ? 'flow' : 'bounded'}
```

- [ ] 写 hook 测试：给 window.visualViewport 安装 EventTarget 测试替身，修改 height/offsetTop 后触发 resize 与 scroll，验证返回值；卸载后再次派发不更新。用 fake requestAnimationFrame 验证同帧多个事件只发布一次。测试替身必须在 afterEach 恢复原 property descriptor。
- [ ] 实现 hook：首次同步读取；订阅 visualViewport.resize/scroll、window.resize/orientationchange，以 requestAnimationFrame 合并；移除全部监听器并取消待执行帧。不执行 window.scrollTo，不在 hook 内聚焦输入。
- [ ] 写外框测试：header、正文和 actions 三个独立区域；应用样式清理后离开 study 能正常滚动；两个并发挂载不提前清理另一个实例的 route 标记。

```tsx
const view = render(<StudyFrame label="学习" header={<button>结束</button>}
  actions={<button>检查答案</button>}><p>题目</p></StudyFrame>)
expect(screen.getByRole('region',{name:'学习内容'})).toContainElement(screen.getByText('题目'))
expect(screen.getByRole('region',{name:'答题操作'})).toContainElement(screen.getByText('检查答案'))
view.unmount()
expect(document.documentElement).not.toHaveAttribute('data-study-viewport')
```

- [ ] 实现 StudyFrame：bounded 模式三行 grid `auto minmax(0,1fr) auto`，正文 `min-height:0;overflow-y:auto`，上下区域不收缩；框架高度/顶部来自 hook CSS 变量。只有 bounded 学习页移除 html/body/root 的多余高度并禁整页滚动，卸载恢复。flow 回退正常流和可滚动内容，保留顶部 sticky；安全区仅在框架计算一次，不与 appShell 重复。

```css
.frame { width:min(100%,480px); margin-inline:auto; background:var(--paper); }
.bounded { position:fixed; left:50%; transform:translateX(-50%);
  top:var(--study-top); height:var(--study-height); display:grid;
  grid-template-rows:auto minmax(0,1fr) auto; }
.content { min-height:0; overflow-y:auto; overscroll-behavior-y:contain; }
.header, .actions { min-width:0; background:var(--paper); }
```

- [ ] 运行三个新测试文件和 `npm run typecheck`；确认通过后只提交本任务文件，提交名 `feat: add visible-viewport study frame`。

## Task 2：迁移英西语内容与聚焦策略

**Consumes:** Task 1 的 `StudyFrame`；现有 `useAppState`、`useSpanish` 保持接口。

**Produces:** 英语和西语学习页使用相同外框；没有新业务 API。

- [ ] 在 `SpanishApp.test.tsx` 增加首题不主动抢焦点用例，以及输入中间插入重音的用例。沿用该文件现有挂载与数据库清理方式，避免写用户数据库。

```ts
expect(await screen.findByLabelText('填写缺少的西语词')).not.toHaveFocus()
const input = screen.getByLabelText('填写缺少的西语词') as HTMLInputElement
await user.click(input)
await user.type(input,'camion')
input.setSelectionRange(4,5)
await user.click(screen.getByRole('button',{name:'ó',exact:true}))
expect(input).toHaveValue('camión')
expect(input.selectionStart).toBe(5)
```

- [ ] 在现有英语拼写测试加入布局语义断言：检查答案、不认识和跳过在答题区域；错误后继续/重做仍在同一区域；首次渲染不抢焦点。为 `SpellingAnswer` 测试 `.focus({preventScroll:true})`，保留可访问的答案播报。
- [ ] 运行上述测试确认失败，再拆分 EnglishPrompt 内部 JSX 为“正文 + 操作槽”。将回调/状态留在原控制层，StudyFrame 不接管提交；给错误反馈与答案差异中长文本保留正文滚动。选择题四按钮属于正文，不移到占满高度的底栏；看答案与下一步放操作区。
- [ ] 将西语题干放正文，输入/重音字母/提示/不认识/跳过/提交放操作区；反馈长对比仍在正文，继续/重做留操作区。提示文字不要创建空白占位高度；辅助操作合并一行，窄屏换行但每项仍至少 44px。
- [ ] 去除西语首题自动 focus；用户已在输入时保持输入组件身份，切题需要恢复焦点用 preventScroll；点击重音字母保存 selectionStart/End，更新值后恢复焦点与光标。鼠标按下重音按钮可阻止不必要的失焦，但不能阻止键盘 Tab 和屏幕阅读器操作。

```ts
inputRef.current?.focus({preventScroll:true})
requestAnimationFrame(() => inputRef.current?.setSelectionRange(nextCursor,nextCursor))
```

- [ ] 样式分常态/compact：头部至少 44px、四关标记一行、中文 24–28/20–24px、西文词形 44–60/32–40px、句子 20–26px；去掉英语 48px 表单顶部间距等固定大空白。常规正文不小于现有可读字号。详情/AI 保持折叠可展开；译文可折叠但不删除，展开不移走按钮。
- [ ] 测试 AI 长内容和错误对比不改变学习状态：展开详情后保留反馈，再继续原题；错误选择仍停留到选对，不认识仍需重新拼写。加入 `isComposing` 防护测试，中文候选确认 Enter 不误提交；普通 Enter 等价点击检查答案。
- [ ] 运行 `npm test -- src/pages/EnglishStudyPage.test.tsx src/spanish/SpanishApp.test.tsx src/components/WordRelations.navigation.test.tsx src/components/SpellingAnswer.test.tsx` 与 typecheck，修正现有测试对自动聚焦的过时假设；提交 `fix: keep study controls reachable above mobile keyboards`。

## Task 3：浏览器、真机与回归验收

**Files:** 新建 `docs/mobile-study-validation.md`，仅按实测结果填写；产品文件仅在复现到缺陷时定点修改并增加回归测试。

**Interfaces:** 不增加。

- [ ] 运行 `npm test`、`npm run typecheck`、`npm run build`，保存真实测试数量、失败、构建资源信息；任何失败先诊断，不能继续声称完成。
- [ ] 用产品支持的浏览器工具打开本地生产预览 `/palabra-pwa/today`。在独立测试 origin/资料中建立测试会话，不清空用户浏览器原记录。390×844、430×932、768px、桌面分别检查英语四关和西语长句；截图核对深浅色、中文层级和按键尺寸。
- [ ] 验证小可见高度 390×440、偏移与小屏横向：保存顶部、输入和提交按钮的 DOM 边界，并确认底部 <= 可见视口底边。长正文滚动不改变顶部与底部操作的边界；不要仅检查按钮 DOM 存在。
- [ ] 测试 200% 缩放、屏幕转向、收起键盘、切换浏览器页再回来和恢复会话；保证回退布局中内容能完整触达，离开 study 后词库/设置仍可滚动。
- [ ] 真机依次执行 iPhone Safari、主屏幕 PWA、Android Chrome：点击输入、选候选字、关闭/重新打开键盘、插入重音、看答案、重做、切题、点顶部结束。记录系统和浏览器版本。无设备时在报告列出“未执行：真实软键盘”，由用户验收前不得标记已解决全部手机场景。
- [ ] 报告列出原问题的前后边界、截图、测试命令结果和真机缺口；提交 `test: document mobile study viewport verification`。不自动推送部署。

## 计划自检与交付门槛

第 9 节的布局、文字层级、焦点、内容可达、动态视口、低能力回退和真实设备限制均由 Tasks 1–3 覆盖。此计划不执行词书迁移，完成后现有课程应可独立运行。方案审批不等于本计划已经审批；先交用户审阅并选择执行方式。
