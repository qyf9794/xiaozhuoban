# Realtime 稳定性差距分析与改造计划

Date: 2026-06-18

Status: active remediation plan

Scope: 小桌板语音助手、Realtime-2 工具路由、文本 fallback、Harness 执行、诊断与短连接测试。

## 1. 背景

近期线上问题集中在同一类根因：

- Realtime 能听懂用户说话，但工具选择、目标解析和执行链路不稳定。
- 同一句自然语言在本地快捷、Realtime 选择阶段、Realtime 执行阶段和后端 text fallback 中可能走不同规则。
- 语音连接、工具调用、结果回传和会话生命周期混在同一条长会话里，出错后缺少可复现的端到端证据。

本计划目标不是继续补单句规则，而是把语音助手收敛成稳定、可验证、低成本的命令执行系统。

补充范围：

- 小桌板自身窗口和桌面能力必须纳入 Realtime-2 可发现能力目录，包括但不限于隐藏/显示侧边栏、全屏/退出全屏、打开设置、切换桌板、整理桌面和窗口层级控制。
- 每个非游戏、非 AI 制表小工具的可调节能力必须纳入能力目录，包括状态设置、播放控制、搜索、显示模式、清空/关闭、尺寸位置等已实现动作。
- 工具不应一次性全部作为可执行 schema 塞入 Realtime session；应采用“全能力目录可发现 + 分级加载可执行工具”的策略。
- 并发策略需要优化，目标是让无冲突命令真正并行，冲突命令按资源串行，而不是简单地全部顺序或粗暴并行。

## 2. 官方最佳实践对照

官方文档中的关键要求和建议：

- 浏览器语音应用推荐使用 WebRTC；WebSocket 更适合服务端媒体管线。参考：OpenAI Realtime WebRTC 文档。
- Realtime-2 适合更强的工具选择、精确实体捕获和长会话状态；生产语音助手通常从 `reasoning.effort: "low"` 开始，再按延迟和任务复杂度调整。参考：OpenAI Realtime 与 Realtime models prompting 文档。
- Realtime-2 提示词应明确职责、决策点、工具使用规则和确认边界；不要堆叠互相冲突的 `always/never/must` 规则。参考：Realtime models prompting。
- 工具使用应写清何时调用工具、需要哪些参数、缺信息时怎么问、失败后怎么重试或升级。参考：Realtime models prompting 的 Tools 部分。
- VAD 默认会自动分段和生成响应；如果需要控制响应时机，可以保留 VAD 但关闭自动响应，或手动发送 `response.create`。参考：Realtime conversations 与 VAD 文档。
- Server-side controls / sideband connection 可以让服务端监控会话、更新指令和响应工具调用，把业务逻辑留在服务端。参考：Realtime server controls。

项目当前做对的部分：

- 已使用 WebRTC 连接 Realtime。
- API key 保持在服务端，前端拿 client secret。
- 已使用 `gpt-realtime-2`，默认 low reasoning。
- 已有 Harness、ActionRegistry、PlanValidator、Audit、Diagnostics 和 compact context。
- 已开始使用两阶段选择：先选工具，再给局部上下文执行。

核心差距：

- 工具策略分散在三处：`assistant-core` 本地路由、前端 Realtime adapter、后端 `/api/realtime/tool-call`。同义词、优先级和 fallback 行为容易漂移。
- 当前 Realtime 常驻阶段只注册 `assistant.select_tool`，但“工具目录”和“执行约束”靠长提示词描述，缺少稳定的机器可验证 intent catalog。
- 语音与文本 fallback 不是同一执行模型：语音 data channel 走 `session.update`，复杂文本 fallback 走 Responses API，二者提示词和上下文裁剪不完全一致。
- 缺少端到端命令契约测试：目前多数测试验证 payload 包含字符串，而不是“输入 -> 工具计划 -> Harness 执行结果”的完整行为。
- 缺少会话预算/生命周期的硬边界：虽然有运行时预算，但连接保活、断线恢复、VAD 自动响应、工具结果后 response.create 的规则仍靠局部补丁。
- 高风险、需要确认、需要自动打开小工具再执行 followUp 的行为还没有统一 policy。

## 3. 当前实现不足

### 3.1 路由规则重复

重复位置：

- `packages/assistant-core/src/index.ts`
- `apps/web/src/assistant/realtimeTextToolCall.ts`
- `apps/web/api/realtime/tool-call.ts`
- 每个 `apps/web/src/widgets/modules/*/assistant.ts`

影响：

- “打开时钟”这种别名冲突会在不同路径里选择不同模块。
- “整理桌面”本地能识别，Realtime fallback 可能说没有工具。
- “播放陈奕迅的十年”在音乐小工具未打开时需要 `board.add_widget + followUp`，但每条链路都要单独补。

### 3.2 工具暴露策略不稳定

用户期望：Realtime 先知道所有工具范围，再决定使用哪个小工具。

稳定实现应该是：

- 常驻阶段暴露一个小而稳定的 selector tool，同时提供完整、结构化、可版本化的工具目录。
- 执行阶段只暴露候选工具和必要辅助工具，例如 `music.play` 需要目标但没有实例时，同时允许 `board.add_widget`。
- 所有最终输出都转换为 `CommandPlan`，由本地 Harness 校验和执行。

当前不足：

- 常驻阶段只发 selector schema；工具目录在 instructions 中，结构化程度不够。
- 执行阶段有时只给一个工具，导致模型在缺少 widgetId 时无法完成。
- 复杂命令和单工具命令走两套 payload。

### 3.3 上下文同步没有版本和快照

当前 `updateContext()` 只保留最新 compact context；`session.update` 没有 context version。

影响：

- 用户打开/关闭小工具后，Realtime 可能基于旧上下文回答。
- 日志难以判断某次错误是模型选择错、上下文过期，还是工具执行失败。

### 3.4 诊断还不够闭环

已有 diagnostics endpoint 和前端日志，但还缺：

- 每条语音命令的 `commandId` 从录音转写、selection、plan、execute、tool result、UI 状态变更贯穿到底。
- 自动化测试脚本无法短连接 Realtime 后执行命令矩阵并导出报告。
- Vercel 日志和前端诊断需要统一查询入口。

已落地：

- 前端保留最近 80 条脱敏诊断事件，并暴露 `window.__xiaozhuobanExportAssistantDiagnostics()` 供手动多轮测试后导出。
- `scripts/tail-assistant-diagnostics.mjs` / `pnpm diagnostics:assistant` 可过滤 Vercel `[assistant-diagnostic]` 日志。
- 每条文字命令生成 `commandTraceId`，贯穿 Dock submit/result、Harness diagnostics、operation events 与 Realtime adapter diagnostics；日志脚本支持 `--trace=<commandTraceId>` 过滤。
- 真实语音 Realtime response 会自动生成 `voice_*` trace，贯穿 `response.created`、function call、tool result 与 data-channel send。
- VAD 和转写事件会写入语义诊断：`speech_started`、`speech_stopped`、用户转写成功/失败、助手语音 transcript，便于判断“不回复”发生在麦克风、VAD、转写、模型响应还是工具执行层。
- compact context 会生成 `contextVersion`，能力目录会生成 `toolCatalogVersion`，选择/执行 payload 与 adapter diagnostics 都携带版本，用于判断错误是否来自过期上下文或工具目录。

### 3.5 成本策略还不够产品化

当前已经有本地 shortcut-first 和低 reasoning effort，但需要进一步：

- 高频确定命令全部本地执行。
- Realtime 只在用户主动连接或本地置信度不足时短连接。
- 能用 Responses 文本 fallback 的地方不要保持长语音连接。
- Realtime 连接必须有明确 idle timeout、手动断开和测试上限。

已落地：

- Runtime 同时维护 idle timeout 和 max-session timeout。空闲触发 `idle_timeout`，超过单次会话上限触发 `max_session_timeout`。
- 手动断开、空闲断开、最大时长断开都会写 `realtime.runtime.disconnect` 诊断，便于解释“连接一段时间后断开”的原因。
- 手动断开后 runtime 回到 `local_standby`；对话窗口达到最大时长后进入 `realtime_cooldown`。

## 4. 目标架构

### 4.1 单一命令入口

所有输入最终进入同一条管线：

```txt
audio/text input
  -> transcript / raw text
  -> local shortcut router
  -> realtime/text planner when local confidence < threshold
  -> CommandPlan
  -> PlanValidator
  -> Preview/Confirm when needed
  -> CommandExecutor
  -> ActionRegistry
  -> UI state + diagnostics + audit
```

Realtime 不直接“操作 UI”；它只能提交工具选择或 `CommandPlan`。

### 4.2 单一工具意图目录

建立 `RealtimeRoutingPolicy`：

- widget aliases
- tool intent examples
- conflict rules, e.g. `时钟 -> dialClock`, `世界时钟/时区 -> worldClock`
- auto-open rules, e.g. target widget missing but definition exists -> `board.add_widget + followUp`
- high-risk confirmation rules
- unsupported scopes

前端、后端和本地 router 都只能引用这份 policy，不再复制字符串规则。

能力目录分两层：

- `CapabilityCatalog`: 低成本、结构化、可长期放入 Realtime 指令或上下文的能力摘要，包含模块、动作、别名、风险、是否需要目标、是否支持并发、是否需要登录/权限。
- `ExecutableToolSet`: 当前阶段真正注册给 Realtime 的 function schema，只包含 selector、当前候选工具、必要辅助工具和当前 scoped context 需要的工具。

这意味着 Realtime-2 应该“知道能做什么”，但每一轮只拿到“现在允许怎么做”的小工具 schema。

### 4.3 结构化 selector

Selector 输出不只包含工具名，还包含：

- `intent`
- `selectedModule`
- `targetHint`
- `requiresTarget`
- `canAutoOpen`
- `confidence`
- `reason`

低置信度或冲突时不执行，转 clarification。

### 4.4 所有模型输出转 CommandPlan

单工具命令也转换为单命令 `CommandPlan`，好处：

- 校验、确认、执行、审计统一。
- 自动打开 widget 后 followUp 可以成为顺序 plan。
- 多工具与单工具不再分裂。

### 4.5 Realtime 短连接与成本控制

默认模式：

- 未连接时走本地 shortcut 或 text fallback。
- 用户点击语音连接后才建立 Realtime WebRTC。
- 空闲超过预算自动断开。
- 单次 Realtime 连接还有硬上限，不能因为一直有音频或工具调用而长期占用会话。
- 测试脚本只能短连接，执行命令矩阵后立即断开。

成本规则：

- 本地置信度 >= 0.9 直接执行。
- Realtime-2 默认 `reasoning.effort: "low"`。
- 常驻 session tools 保持小；详细上下文按需注入。
- 大规模诊断用文本 fallback，不长时间占用麦克风连接。

### 4.6 并发调度

`CommandExecutor` 需要从“按 executionGroups 执行”升级为“按资源冲突调度”：

- 每个工具声明 `concurrencyKey`，例如 `music`, `tv`, `board-layout`, `weather:<widgetId>`。
- 同一 `concurrencyKey` 内串行，避免播放/暂停/下一首互相打架。
- 不同 key 可并行，例如播放音乐和查天气。
- `board.auto_align`、批量移动、全屏、侧边栏布局等占用 `board-layout`，需要和 move/resize/focus 类命令协调。
- 带 `dependsOn` 的命令必须等待依赖完成，例如 `board.add_widget -> music.play`。
- 失败策略可配置：独立并行组中一个失败不应阻塞无依赖命令；顺序依赖链失败则跳过后续依赖命令。

## 5. 分阶段改造计划

### Milestone 1: 冻结稳定性约束与统一 policy

交付：

- 新增 `RealtimeRoutingPolicy`，前端和后端共享 aliases、冲突规则和打开/播放/整理等核心意图规则。
- 删除前端/后端重复的 widget alias 常量。
- 为以下输入建立契约测试：
  - `播放陈奕迅的十年`
  - `打开时钟`
  - `打开世界时钟`
  - `整理桌面`
  - `关闭留言板`
  - `我想听点轻松的音乐`

验收：

- `pnpm --filter @xiaozhuoban/assistant-core test`
- `pnpm --filter @xiaozhuoban/web test -- src/assistant/realtimeTextToolCall.test.ts src/api/realtime/tool-call.test.ts`
- 前后端 payload 中不再出现重复 alias 表。

### Milestone 1B: 全能力目录与分级加载

交付：

- 建立 `CapabilityCatalog`，覆盖小桌板窗口/桌面能力，以及所有非游戏、非 AI 制表小工具调节能力。
- 每个能力声明：
  - module/type
  - action/tool
  - aliases/examples
  - risk
  - requiresTarget
  - loadLevel: `catalog` | `candidate` | `scoped`
  - concurrencyKey
  - requiredAuth/permissions
- Realtime 初始阶段只加载目录摘要和 selector；执行阶段按候选加载 schema。
- 明确排除游戏和 AI 制表工具，只在目录中标记 unsupported/deferred，不提供 executable schema。

验收：

- Realtime selector 能看到小桌板窗口能力和小工具调节能力摘要。
- `session.update` 中真实 function schema 数量受限，不随工具总数线性暴涨。
- 工具目录快照测试覆盖窗口能力、音乐、天气、电视、录音、时钟、留言板等代表模块。

### Milestone 2: 单工具路径并入 CommandPlan

交付：

- `requestToolCall()` 废弃为兼容层；内部转 `requestCommandPlan()`。
- 单工具模型输出也创建 `CommandPlan`。
- `board.add_widget + followUp` 转为显式顺序 plan，而不是执行时再改写 call。

验收：

- 所有 model route 都经过 `PlanValidator`。
- diagnostics 中每条模型命令都有 plan id、command id、tool result。

### Milestone 3: 上下文版本化与诊断闭环

交付：

- compact context 增加 `contextVersion`、`toolCatalogVersion`。
- 每次语音命令生成 `commandTraceId`，贯穿 Realtime events、tool-call API、Harness、UI state mutation、diagnostics endpoint。
- 添加后台诊断查询脚本，按 trace id 聚合日志；当前已支持按 assistant diagnostic marker 过滤，并可用 `--trace=<commandTraceId>` 缩小到单次命令。
- 语音响应 trace 需覆盖 VAD、用户转写、助手 transcript、工具调用和工具结果回传。

验收：

- 模拟多轮测试后，可以从一条 trace 看出失败层：识别、选择、规划、校验、执行或 UI 状态。
- 对“在吗”这类无工具问答，也能看到用户转写和助手 transcript，而不是只看到连接状态。
- selection 与 execute 请求能看到 `contextVersion/toolCatalogVersion`，Vercel 诊断中也能按版本判断是否上下文过期。

### Milestone 4: Realtime 生命周期硬化

交付：

- 明确连接状态机：idle -> connecting -> configuring -> connected -> draining -> disconnected。
- 工具调用中不允许重复 `session.update` 覆盖未完成执行。
- 工具结果后响应创建策略集中管理。
- 空闲自动断开和测试最大连接时长。
- 运行时断开原因必须结构化记录：`manual`、`idle_timeout`、`max_session_timeout`。

验收：

- 短连接测试不会超过指定时长。
- 手动断开回到 `local_standby`；对话窗口超过最大时长进入 `realtime_cooldown`。
- 连续 20 条语音/文本模拟命令不出现“没有工具”“上下文缺失”“卡在找小工具”。

### Milestone 4B: 并发调度优化

交付：

- `CommandExecutor` 支持按 `concurrencyKey` 和 `dependsOn` 自动编排。
- Planner 输出不再必须提前完美分组；本地调度器可把安全的独立命令合并并行。
- 为音乐+天气、打开工具+followUp、整理桌面+移动/聚焦、多个不同小工具设置建立并发回归测试。

验收：

- 独立命令并行执行，总耗时接近最慢单命令，而不是所有命令耗时相加。
- 同一资源冲突命令稳定串行。
- 失败隔离符合 policy。

### Milestone 5: 官方 sideband/server controls 评估

交付：

- 评估从纯前端 data channel 工具执行，迁移到 server-side controls/sideband 的成本。
- 若采用：服务端监控 Realtime session、执行工具选择和业务逻辑，前端只负责音频和 UI。
- 若暂不采用：保留 WebRTC 客户端工具调用，但必须有完整 diagnostics 和短连接控制。

验收：

- 形成 ADR，说明稳定性收益、Vercel 成本、实现复杂度和迁移风险。

## 6. 测试策略

### 6.1 单元契约测试

覆盖：

- 本地 shortcut router
- Realtime selector payload
- Realtime execute payload
- tool-call API
- CommandPlan validation
- add-widget followUp
- confirmation flow

### 6.2 页面模拟测试

使用 Playwright：

- 打开正式域名或本地 dev server。
- 登录态可用时模拟文字命令。
- 仅在测试语音时短连接 Realtime，允许麦克风权限，执行后立即断开。
- 不做长时间监听。

### 6.3 线上日志验证

每次部署后：

- `vercel inspect <deployment>`
- `vercel logs <deployment> --since 30m --level error`
- 抽查线上 bundle 关键策略字符串或版本号。

## 7. 成本策略

- 本地高置信命令优先。
- Realtime 只在用户显式连接或本地低置信时使用。
- 默认 low reasoning。
- 工具目录结构化、上下文最小化。
- 长会话有 idle timeout；测试连接有硬上限。
- 所有 Realtime 连接都有 idle timeout 和 max-session timeout；断开原因写入 diagnostics。
- 对于非语音测试优先使用 text fallback，不占用 Realtime 音频。

## 8. 稳定性红线

- 不允许前端、后端、本地 router 各自维护不同 alias 表。
- 不允许模型直接绕过 Harness 执行 UI 改动。
- 不允许低置信命令直接执行。
- 不允许高风险操作跳过 preview/confirm。
- 不允许测试长时间保持 Realtime 连接。
- 不允许 Realtime 连接缺少自动断开保护或断开原因诊断。
- 不允许只用“包含字符串”的测试证明端到端稳定。

## 9. 参考资料

- OpenAI Realtime guide: https://developers.openai.com/api/docs/guides/realtime
- OpenAI Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- OpenAI Realtime conversations: https://developers.openai.com/api/docs/guides/realtime-conversations
- OpenAI Realtime VAD: https://developers.openai.com/api/docs/guides/realtime-vad
- OpenAI Realtime models prompting: https://developers.openai.com/api/docs/guides/realtime-models-prompting
- OpenAI Realtime server controls: https://developers.openai.com/api/docs/guides/realtime-server-controls
