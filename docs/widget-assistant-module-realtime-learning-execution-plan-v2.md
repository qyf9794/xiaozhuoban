# 小工具模块化、Realtime 与学习系统执行计划 v2

Date: 2026-06-17

Status: execution plan

Scope: 日常小工具优先；游戏、AI 表单和第三方插件市场不进入首批完整迁移。

## 1. 目标重述

本计划用于替代原计划中的“大跨度一次性完成”执行方式。目标不变，但实施顺序改为可验证、可回滚、可局部完成的里程碑。

最终目标：

- 每个日常小工具都是独立模块单元，而不是集中在全局路由或单个兼容工厂。
- Realtime-2 坚持两阶段解析：第一阶段只看模块 catalog，第二阶段只看 selected module scoped context。
- 所有模型输出都转换为 `CommandPlan`，经过本地 harness validate、preview/confirm、安全策略和执行调度后才执行。
- 已完成且无冲突的快捷命令必须保留；发现冲突时先记录、加回归测试，再最小修正。
- 低成本 24 小时运行模式默认本地待机，Realtime 按需短连接。
- 云端写入失败进入 outbox，可见、可重试、可审计。
- Realtime/text fallback 成功兜底的表达，经用户确认后可沉淀为本地学习规则。
- AI 生成模块必须 preview、validate、sandbox test、用户确认，不能覆盖已有无冲突快捷命令。
- 真实页面总体验收必须跑完整命令集并记录结果。

## 2. 模块边界决策

首阶段采用独立文件夹/模块单元，不拆成独立 package。

目标目录：

```txt
apps/web/src/widgets/modules/<type>/
  assistant.ts
  definition.ts
  shortcuts.ts
  tools.ts
  context.ts
  realtime.ts
  executionPolicy.ts
  test-cases.json
  module.md
```

暂不拆 package 的原因：

- 当前小工具强依赖 Web app store、widget definitions、capability bridge、Harness 和 UI 状态。
- 独立 package 会过早引入 workspace 构建、版本、依赖导出和测试配置成本。
- 动态注册、禁用、卸载和热加载只要求稳定模块协议，不要求 npm package 隔离。
- 后续只有当模块需要跨应用复用、远程安装或插件市场发布时，再升级为 package。

## 3. 当前差距摘要

已有基础：

- `WidgetAssistantModule` / `WidgetAssistantRegistry` 初版。
- Realtime 两阶段 catalog/scoped context 初版。
- `PlanValidator` 初版。
- `CommandExecutor`、`PlanPreview`、Outbox、Learning、AI module review 的基础类。
- 首批 12 个工具已有目录雏形、module.md 和 test-cases.json。

主要缺口：

- 每个工具目录仍是薄壳，核心 aliases/tools/context/realtime/policy 仍集中在兼容工厂。
- Harness 主执行流仍没有统一使用 `CommandExecutor` 执行完整 `CommandPlan`。
- 学习系统只有数据层，没有“候选生成 -> 用户确认 -> 本地命中”的闭环。
- Outbox 覆盖范围有限，且 mutation 未完整关联 command operationId。
- Preview Gate 未形成完整用户可见 preview UI。
- 每工具测试矩阵远未达到计划要求的覆盖规模。
- 真实页面总体验收被本地登录态阻塞，尚未完成。

## 4. 执行原则

- 每个 milestone 完成后必须运行相关本地测试并更新 `docs/assistant-tool-real-page-test-log.md`。
- 不部署、不推送，除非用户在当轮明确要求。
- 不迁移所有工具之前，不删除旧 shortcut router 中已验证命令。
- 每次迁移一个工具时，先加等价回归测试，再搬迁实现。
- schema 默认拒绝额外字段；需要兼容旧调用时必须显式记录。
- Realtime 第一阶段不得发送 widgetId、完整 widget state、剪贴板内容、便签全文、录音内容或搜索历史。
- Realtime 第二阶段只发送 selected module scoped context，并经过 `redactContext()`。
- 高风险操作统一走 `plan -> preview -> confirm -> execute`。

## 5. Milestones

### Milestone A: 模块协议冻结与缺口修正

目标：把模块协议补到能承载后续真实迁移。

交付：

- 完整 `WidgetModuleActionSpec`。
- `WidgetAssistantModule` 必填字段收紧。
- `WidgetAssistantRegistry` 支持按模块列出 tools、shortcuts、catalog、test matrix。
- `ModuleMigrationReport`、`ShortcutConflictReport` 数据结构。
- `redactContext()` 和 `maxRealtimeContextTokens` 变为每模块强制项。

验收：

- 空模块、禁用模块、卸载模块、重新注册模块都有测试。
- 禁用模块后不出现在 catalog、tools、shortcuts、scoped context 中。
- 缺少 schema、examples、result schema、redactContext 的模块静态校验失败。

测试：

- `pnpm --filter @xiaozhuoban/assistant-core test`
- `pnpm --filter @xiaozhuoban/web test -- src/widgets/modules/dailyWidgetAssistantModules.test.ts`

### Milestone B: 拆除 dailyWidgetAssistantModules 中央工厂

目标：把首批工具从兼容工厂迁移到独立目录。

工具顺序：

1. music
2. weather
3. clipboard
4. todo
5. countdown
6. worldClock
7. headline
8. market
9. calculator
10. translate
11. recorder
12. tv

每个工具交付：

- `definition.ts`
- `shortcuts.ts`
- `tools.ts`
- `context.ts`
- `realtime.ts`
- `executionPolicy.ts`
- `assistant.ts`
- `module.md`
- `test-cases.json`
- 旧快捷命令迁移清单。
- scoped context 字段白名单。
- 冲突记录，没有冲突也要写明 none。

验收：

- 每个工具可独立导出 `create<Type>AssistantModule()`。
- `createLocalAssistantHarness()` 从各工具目录导入模块，而不是依赖集中 seeds。
- 工具之间可以独立 enable/disable/unregister。
- 旧快捷命令语义不变。

测试：

- 每迁移一个工具，跑该工具模块测试和相关 acceptance 测试。
- 每完成 3 个工具，跑 `pnpm --filter @xiaozhuoban/web test`。

### Milestone C: Music 完整 Pilot

目标：用 music 做第一个完整闭环模块。

交付：

- music 的 shortcuts/tools/context/realtime/policy 全部从兼容工厂移到目录。
- `关闭音乐` 明确为 `widget.remove`。
- `暂停音乐` 明确为 `music.pause`。
- `music.pause` args schema 为 `{ widgetId: string }`，拒绝 `query` 等额外字段。
- `music.search`、`music.play` 支持搜索后播放依赖。
- MusicKit 未登录、token 缺失、mounted capability 缺失有明确失败模型。
- music scoped context 不发送完整播放历史。

验收命令：

- `打开音乐`
- `关闭音乐`
- `暂停音乐`
- `打开音乐，播放周杰伦`
- `先打开音乐，再搜索七里香，然后播放第一首`
- `打开音乐，同时查北京天气`

测试：

- module static tests。
- shortcut regression tests。
- CommandPlan tests。
- execution mock tests。
- Realtime catalog/scoped context snapshot tests。

### Milestone D: CommandPlan 主执行链路

目标：所有本地、Realtime、text fallback、learned 输出统一进入 `CommandPlan`。

交付：

- `ShortcutPlanAdapter`: shortcut groups -> `CommandPlan`。
- `RealtimePlanAdapter`: Realtime tool call -> `CommandPlan`。
- `TextFallbackPlanAdapter`: text LLM result -> `CommandPlan`。
- Harness 使用 `CommandExecutor` 执行计划。
- 依赖失败只跳过相关链路。
- 确认只阻塞相关链路。
- 每个 command 都有 operationId。

验收：

- 单命令、本地多命令、跨工具并发命令都生成 `CommandPlan`。
- Harness 不直接执行模型返回的 `AssistantToolCall`。
- PlanValidator 在 executor 前执行。
- executor 事件驱动状态气泡。

测试：

- `先打开音乐，再播放周杰伦，同时查北京天气`
- `清空剪贴板，然后添加一条待办：明天买牛奶`
- 一个并发分支失败，不影响无依赖分支。

### Milestone E: Preview Gate 与统一确认 UI

目标：高风险命令在用户可见 preview 后确认执行。

交付：

- `PlanPreview` UI 展示：
  - 命令列表。
  - 影响的 widget 或数据范围。
  - 是否可撤销。
  - 失败恢复策略。
  - 确认/取消按钮。
- `ConfirmationGate` 绑定 plan id 和 operation id。
- 取消后跳过依赖链。

必须 preview：

- `clipboard.clear`
- `note.clear`
- 自动整理桌面。
- 重命名桌板。
- 批量删除/关闭多个 widget。
- AI 生成并安装新模块。
- 外部写入或发布类操作。

验收：

- 用户取消后不执行相关链路。
- preview 内容不泄露完整剪贴板/便签/录音。
- 确认后执行并写 audit。

### Milestone F: 信息查询类工具迁移

目标：完整迁移低风险查询类工具。

范围：

- weather
- worldClock
- market
- headline
- calculator
- translate

每个工具验收：

- 单工具命令通过。
- 噪音口语通过。
- 组合命令通过。
- Realtime 两阶段兜底通过。
- 失败场景有明确文案。
- scoped context 不带无关 widget 状态。
- 禁用模块后不命中该工具。

重点边界：

- calculator 本地可算表达式不得调用模型。
- translate 长文本不默认进入 Realtime。
- headline 不能误吞 CCTV/电视命令。
- market 不提供投资建议或交易能力。

### Milestone G: 内容与任务类工具迁移

目标：完整迁移会读写用户内容的工具。

范围：

- clipboard
- todo
- countdown
- note 如继续纳入日常内容工具，则在本 milestone 完成。

验收：

- clipboard scoped context 只给 empty/count/pinned summary，不给完整内容。
- todo scoped context 只给数量和必要短摘要，不给全部待办全文。
- 清空、覆盖、批量完成必须 preview/confirm。
- 确认后依赖链继续；取消后依赖链跳过。
- 学习候选不得保存敏感内容。

### Milestone H: 媒体与权限类工具迁移

目标：完整迁移依赖 mounted capability 或权限的工具。

范围：

- recorder
- tv
- music 在 Milestone C 已完成，此处做跨媒体冲突补强。

验收：

- recorder 只暴露录音状态和权限状态，不暴露录音内容。
- recorder 与 Realtime 麦克风冲突有可见错误。
- tv mounted capability 缺失有明确失败文案。
- tv scoped context 只给当前频道/播放摘要。
- TV 和 music 的媒体冲突策略清晰。

### Milestone I: Outbox 完整化

目标：所有云端写入失败可见、可重试、可审计。

交付：

- Outbox 覆盖 board、widget instance、widget definition、backup/import 关键写入。
- mutation 关联 `operationId`。
- retry 结果写 audit。
- 页面刷新后 outbox 可恢复。
- Dock 或专门同步状态区域显示 pending count 和最后失败原因。

验收：

- 网络失败后 UI 乐观更新保留，outbox pending +1。
- 手动重试成功后 pending 清零。
- 重试失败保留错误原因和 retryCount。
- audit 可从 command operationId 查到 mutation id。

### Milestone J: 低成本 24 小时运行模式闭环

目标：24 小时打开不等于 Realtime 24 小时收音。

交付：

- `local_standby` 默认模式。
- 本地 VAD/唤醒检测接入点。
- command window / dialogue window / cooldown 自动转换。
- idle timeout 自动断开 Realtime。
- 预算软/硬上限 UI 和策略。
- 本地命中不增加 Realtime 成本。

验收：

- 模拟 24 小时待机不创建 Realtime session。
- 达到软上限进入省钱模式。
- 达到硬上限阻止自动连接。
- 手动确认后可以临时继续。
- 状态气泡显示模式、估算成本和 active time。

### Milestone K: 学习系统闭环

目标：成功兜底的表达可在用户确认后本地命中。

交付：

- `LearningCandidateRecorder` 接入 Harness。
- `LearnedCommandStore` 持久化到数据层。
- 用户确认/拒绝学习 UI。
- `LearnedShortcutMatcher` 接入 shortcut routing。
- 学习冲突 review。
- 回归测试候选生成。

验收：

- 第一次“把音乐收了”走 Realtime 或 fallback，成功后生成候选。
- 用户确认后，第二次本地命中 `widget.remove music`。
- 用户取消学习后，不进入本地命中。
- “关闭音乐不是暂停”生成负例和回归测试。
- 高风险学习必须确认，敏感文本禁止学习。

### Milestone L: AI 生成模块与热加载

目标：AI 生成的新工具先预览和验证，用户确认后才能安装。

交付：

- AI module manifest schema。
- module validator。
- sandbox test runner。
- install preview UI。
- conflict review。
- dynamic module registry install/uninstall/disable。

验收：

- 用户确认前只能预览，不能执行。
- 模型只能生成受限 WidgetDefinition/manifest，不直接写任意 React 代码。
- 新模块快捷命令与已有模块冲突时阻止安装。
- 安装失败不影响已有模块。
- 禁用/卸载新模块后 catalog 和 shortcuts 立即移除。

### Milestone M: 每工具完整测试矩阵

目标：把 test-cases.json 从关键样例扩展为可执行完整矩阵。

每个日常工具至少覆盖：

- 单工具命令。
- 噪音口语。
- 失败/缺参。
- Realtime 兜底。
- 跨工具组合。
- 窗口控制。
- 权限/登录/mounted capability。
- 学习系统回归。
- scoped context 脱敏。
- audit 脱敏。

验收：

- runner 能报告未覆盖 action、risk、context 字段。
- music、recorder、tv 额外覆盖权限和 mounted capability。
- 失败命令可转成回归测试候选。

### Milestone N: 真实页面总体验收

目标：在真实页面跑完整命令集，而不是只通过单元测试。

前置：

- 本地或生产环境必须有可用登录 session。
- 不部署时，使用本地 dev server + 本地登录态。
- 若本地登录不可用，记录 blocker，不标记通过。

验收命令：

```txt
关闭，啊，这个，音乐
打开音乐，播放周杰伦
先打开音乐，再搜索七里香，然后播放第一首
打开音乐，同时查北京天气
关闭音乐和天气
清空剪贴板，然后添加一条待办：明天买牛奶
打开天气查北京，再打开世界时钟看东京时间
暂停音乐，同时打开新闻
帮我放点轻松的音乐，然后把倒计时设为 10 分钟
把音乐收了
开始工作
```

每条记录：

- 原始输入。
- normalized text。
- segments。
- candidate modules。
- 是否调用 Realtime。
- CommandPlan。
- 执行顺序/并发分组。
- 每个工具结果。
- 状态气泡证据。
- audit/outbox/learning candidate。
- 截图或 DOM 证据。

## 6. 推荐执行批次

### Batch 1: 修正架构地基

- Milestone A
- Milestone D
- Milestone E

目标：先让所有路径真正变成 `CommandPlan -> validate -> preview/confirm -> executor -> audit`。

### Batch 2: 拆真实模块

- Milestone B
- Milestone C
- Milestone F
- Milestone G
- Milestone H

目标：从集中工厂迁到每工具目录，并逐个保留旧快捷命令。

### Batch 3: 产品闭环

- Milestone I
- Milestone J
- Milestone K
- Milestone L

目标：Outbox、低成本运行、学习和热加载真正进入用户路径。

### Batch 4: 验收

- Milestone M
- Milestone N

目标：完整测试矩阵和真实页面总体验收。

## 7. Definition of Done

一个 milestone 只有同时满足以下条件才算完成：

- 相关代码已实现，不只是类型或空壳。
- 单元/集成测试覆盖目标行为。
- 旧快捷命令无冲突或冲突已记录并有回归测试。
- 实施/测试日志已更新。
- 如果涉及 UI，已通过本地页面或真实页面验证；如果被登录/权限阻塞，必须记录 blocker。
- 没有部署、推送或暂存，除非用户明确要求。

## 8. 当前优先级建议

下一轮应先做 Batch 1，不建议继续扩展更多工具别名。

优先顺序：

1. 让 Harness 主路径使用 `CommandPlan` 和 `CommandExecutor`。
2. 做真正的 Preview UI。
3. 把 music 从兼容工厂完整拆入 `modules/music/`。
4. 用 music 跑通模块迁移范式后，再批量迁移其他工具。
