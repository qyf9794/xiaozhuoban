# 小桌板语音助手改造说明

## 项目目标

小桌板的下一阶段目标是从“一站式桌面小工具”升级为 Web/PWA 优先的语音助手桌面。用户通过语音和助手对话，由 `gpt-realtime-2` 完成语音沟通、意图解析、参数抽取和工具选择，然后通过小桌板内部工具协议控制当前桌板和已有小工具。

第一阶段只聚焦已有能力：

- 控制范围仅限小桌板内部桌面、桌板画布和第一阶段允许的已有小工具。
- 不控制 macOS、Windows 或浏览器外部的本地系统桌面。
- 不调用 Codex 生成新小工具。
- 不热加载动态 React 组件或任意远端代码。
- 不调用游戏类小工具能力。
- 不调用 AI 表单类小工具能力。
- 不在 Realtime 会话中处理动态小工具生成、复杂规划或长文本改写。
- 不把工具执行逻辑散落到 Realtime 组件或各个 widget UI 中。

## OpenAI 官方文档要求

所有 OpenAI 相关配置和实现必须以官方文档为准，实施前需要核对当前文档，而不是依赖旧计划或记忆中的 API 形态。

重点参考：

- Realtime overview: https://developers.openai.com/api/docs/guides/realtime
- Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Realtime conversations and function calling: https://developers.openai.com/api/docs/guides/realtime-conversations
- Realtime model prompting: https://developers.openai.com/api/docs/guides/realtime-models-prompting
- `gpt-realtime-2` model page: https://developers.openai.com/api/docs/models/gpt-realtime-2
- Realtime server controls: https://developers.openai.com/api/docs/guides/realtime-server-controls

Configuration rules:

- Use `gpt-realtime-2` as the first-stage realtime model.
- Prefer WebRTC for browser/PWA voice sessions.
- Keep the OpenAI API key on the server side only.
- Client-side Realtime access must use the official current session or ephemeral-token flow.
- Start with low reasoning effort unless a milestone proves higher effort is needed.
- Register only tools that are actually implemented and locally executable.
- Do not register all widget detail actions at session start.
- Register a small desktop-level tool set first, then load one widget's detail action set only after the assistant or local router has selected that widget context.
- Send summarized board and widget state only; never send full desktop state or full widget payloads to Realtime.
- Keep assistant voice replies short and action-oriented.
- Define explicit confirmation boundaries before write, destructive, overwrite, or bulk actions.
- Treat Realtime transcription as user-facing guidance, not as the only source of truth for what the model understood.

## Realtime 稳定性约束

当前语音助手的首要目标是稳定、可验证、低成本，而不是继续堆叠单句提示词补丁。后续所有 Realtime、工具路由、语音测试和小工具控制改动必须遵守 `docs/realtime-stability-remediation-plan.md`。

Implementation rules:

- 前端、后端和 `assistant-core` 不得各自维护不同的 widget alias、工具优先级、冲突消解和 auto-open/followUp 规则；这些规则必须收敛到共享 policy。
- Realtime-2 必须能发现小桌板自身窗口/桌面能力，以及所有非游戏、非 AI 制表小工具的已实现调节能力；发现能力用结构化 catalog，执行能力用分级加载 schema。
- 不得为了节省上下文而让 Realtime-2 误以为“没有工具”；应提供全能力目录摘要，同时只在候选/执行阶段加载必要 function schema。
- 所有模型输出最终必须经过 Harness、PlanValidator、确认策略和 ActionRegistry；Realtime 不得直接绕过 Harness 修改 UI 状态。
- 本地高置信命令优先执行；本地置信度低于阈值才交给 Realtime 或 text fallback。
- 语音和文字 fallback 必须共享同一套工具语义、上下文裁剪和执行约束。
- 需要目标 widget 的工具在目标不存在但 definition 存在时，应形成 `board.add_widget -> followUp` 的受控顺序计划，而不是回复“没有工具”。
- 普通“时钟”默认指向 `dialClock`；只有明确说“世界时钟、世界时间、时区、城市时间”时才指向 `worldClock`。
- 高风险、删除、覆盖、批量整理等操作必须走 preview/confirm，不能因为来自本地 shortcut 或 Realtime 而跳过。
- 并发策略必须基于 `concurrencyKey`、资源冲突和 `dependsOn`；独立小工具命令应并行，同一资源或布局冲突命令必须串行。
- Realtime 测试只能短连接：测试前连接，执行指定命令矩阵，采集诊断后立即断开；不得长时间保持麦克风或 Realtime 会话。
- Realtime runtime 必须同时具备 idle timeout 和 max-session timeout。任何断开都要记录结构化原因：`manual`、`idle_timeout` 或 `max_session_timeout`。
- 真实语音事件必须有端到端 trace：VAD speech start/stop、用户转写、助手语音 transcript、function call、tool result 和 UI operation 需要能归到同一个 `commandTraceId`。
- 每次部署前至少运行相关单元/契约测试；每次部署后检查 Vercel inspect、错误日志和线上包关键策略版本。
- 稳定性问题修复必须添加回归测试，优先验证“输入 -> 计划/工具 -> Harness 执行结果”，不能只验证提示词中包含某个字符串。

## Core Architecture

### IntentShortcutRouter

`IntentShortcutRouter` handles deterministic, low-cost commands before `gpt-realtime-2` is asked to reason.

It is responsible for:

- Matching simple high-frequency commands with local rules.
- Extracting obvious arguments for commands such as opening a widget, focusing a widget, setting a city, starting a countdown, play/pause, fullscreen, and cancel/confirm.
- Returning a routed `AssistantToolCall` when confidence is high.
- Returning `no_match` when the command needs model interpretation.
- Never guessing on ambiguous destructive or content-heavy commands.

Routing order:

1. Normalize transcript or typed command.
2. Try deterministic local shortcuts.
3. If shortcut confidence is high, execute through `AssistantHarness` and `ActionRegistry`.
4. If no shortcut matches, pass only a compact context summary and the relevant top-level tool schema to `gpt-realtime-2`.

Shortcut commands must still obey confirmation and audit rules. The shortcut router is a cost optimization, not a permission bypass.

### AssistantHarness

`AssistantHarness` is the single runtime boundary between `gpt-realtime-2` and xiaozhuoban actions.

It is responsible for:

- Registering the currently active tools schema with the Realtime session.
- Listening to Realtime data channel function calls.
- Validating tool names and arguments.
- Resolving target widgets such as "那个电视", "最近的便签", and "第一个倒计时".
- Managing confirmation flows for delete, overwrite, and bulk actions.
- Calling local `ActionRegistry.execute()`.
- Calling server tools only when they are explicitly in scope for a later milestone.
- Returning tool results to Realtime.
- Writing audit logs.
- Handling failure, clarification, cancellation, and timeout states.

`AssistantHarness` must not contain widget business logic. It coordinates lifecycle and safety only.

### ToolScopeManager

`ToolScopeManager` controls which tools are visible to `gpt-realtime-2`.

The first-stage session should use layered tool exposure:

- Desktop scope: small, high-frequency xiaozhuoban page/system operations, such as add widget, focus widget, switch board, arrange widgets, fullscreen focus, confirm, cancel, and describe current desktop summary.
- Widget selection scope: choose or resolve a target widget by type, name, recent reference, or board order.
- Widget detail scope: after a target widget is selected, register only that widget type's detail actions.
- Deferred scope: game widgets, AI form widgets, dynamic widget generation, complex planning, and long-text rewriting remain unavailable.

The model must not receive every widget action at once. When context changes, `ToolScopeManager` updates the Realtime session tools to the smallest useful set.

### ContextSummarizer

`ContextSummarizer` produces compact state for Realtime.

It should send:

- Current board name and id.
- Available widget counts by type.
- A short list of visible or recent widgets with id, type, name, order, and tiny state summary.
- Current active or focused widget summary.
- Pending confirmation summary when present.

It must not send:

- Full desktop state.
- Full widget state payloads.
- Full note, todo, clipboard, message, translation, recording, or media histories.
- Raw audio.

Widget detail state should be loaded only after entering that widget's context, and even then as a compact summary.

### ActionRegistry

`ActionRegistry` owns local executable actions.

Each action must declare:

- Stable action name.
- Human-readable description for Realtime tool registration.
- Zod-compatible parameter schema.
- Risk level and confirmation policy.
- Executor function.
- Structured success or failure result.

All state-changing operations must go through `ActionRegistry.execute()`.

### WidgetTargetResolver

`WidgetTargetResolver` maps natural-language target references to concrete widget instances.

It should use:

- Active board id.
- Widget definitions and widget instances.
- Widget type and display name.
- Order on the board.
- Recent user or assistant interactions.
- Spatial hints where available.
- Widget state text for content-based references.

When confidence is low or multiple candidates match, it must return a clarification result instead of guessing.

### Realtime Adapter

The Realtime adapter owns transport details only:

- WebRTC connection lifecycle.
- Audio input and output.
- Data channel event parsing.
- Session update calls.
- Tool result event sending.

It should not know how to mutate widgets.

## Cost and Context Strategy

- Prefer local deterministic shortcut routing for simple commands.
- Use `gpt-realtime-2` only when the shortcut router cannot confidently match intent or arguments.
- Start Realtime sessions with desktop-level tools only.
- Load widget-specific tools only after a target widget or widget type is selected.
- Send summaries, not complete board or widget states.
- Do not keep Realtime sessions open as a background listener. Manual sessions, wake sessions, and tests must all be bounded by idle and maximum-duration timers.
- Keep assistant replies brief, usually one short sentence.
- For successful commands, prefer confirmations like "好了", "已打开天气", or "倒计时开始了".
- For unsupported commands, respond briefly and say the capability is not in this stage.
- Dynamic widget generation, complex planning, and long-text rewriting must return out-of-scope responses in this stage.

## Out-of-Scope Complex Requests

The assistant should not attempt these inside the Realtime session during stage one:

- Generate a new custom widget.
- Ask Codex or another agent to create code.
- Perform multi-step planning across many widgets.
- Rewrite, summarize, or author long documents.
- Bulk transform large notes, histories, messages, or clipboard contents.

When users request these, the assistant should give a short refusal or deferral and keep the conversation concise.

## Stage-One Implementation Status

The current stage-one branch implements the assistant foundation but should still be treated as a credentialed-live-test candidate, not a fully rolled-out voice product.

Implemented:

- Shortcut-first local routing.
- Harness lifecycle, confirmation, cancellation, timeout, target resolution, and audit hooks.
- Desktop and existing widget state actions for the allowed non-game widgets.
- Capability bridge for mounted media/widget effects.
- Stage-one guardrails for games, AI forms, dynamic widget generation, complex planning, and long-text rewriting.
- Realtime session endpoint and WebRTC adapter following the current OpenAI Realtime documentation.
- Voice/text dock running through the same Harness with bounded command history.
- Local and Supabase audit logging without raw audio.
- Realtime diagnostics with local export, trace filtering, voice response trace ids, VAD/transcript events, and runtime disconnect reasons.
- Runtime budget controls for idle disconnect, maximum single-session duration, manual disconnect, and cooldown after long dialogue windows.

Still limited:

- Real live Realtime validation requires `OPENAI_API_KEY`, Supabase credentials, and microphone permission.
- TV/music/recorder/dial-clock UI components still need to register their mounted capabilities before all media commands work live.
- Dynamic Codex-backed widget generation remains a separate stage-two project.

## First-Stage Tool Scope

### Board and Widget Shell

- Add existing widget.
- Focus widget.
- Remove widget.
- Move widget.
- Resize widget only when the target widget is not fixed-size.
- Bring widget to front.
- Auto-align widgets.
- Switch, create, and rename boards.
- Enter and exit focused/fullscreen widget display.

Removal, bulk operations, overwrites, and destructive actions require confirmation.

Resize constraints:

- Every resizable action must query a widget size policy before execution.
- If a widget has an originally fixed panel size, voice control must not change its width or height.
- Fixed-size resize attempts should return a clear tool result, such as "这个小工具的面板大小是固定的，不能调整", without mutating widget state.
- Examples of currently fixed or constrained widgets must follow the existing implementation rules in `store.ts`, `BoardCanvas.tsx`, and widget shared helpers such as `tvShared.ts`, `dialClockShared.ts`, and `worldClockShared.ts`.

### Existing Widgets

Expose small, testable action groups for existing widgets:

- Note: write, append, replace, clear, summarize.
- Todo: add, edit, complete, uncomplete, delete, set date/time.
- Calculator: enter number, apply operation, clear.
- Countdown: set duration, start, pause, reset.
- Weather: set city, refresh.
- Headline: refresh, summarize current headlines.
- Market: add index, remove index, refresh.
- Music: search, play result, pause, resume, next.
- TV: set playlist, choose channel, play, pause, fullscreen.
- Dial clock: toggle night mode, read current time state.
- World clock: set slot zones, read displayed times.
- Clipboard: read clipboard, clear history, delete item.
- Converter: set category, value, from unit, to unit, read result.
- Translate: set source text, set languages, translate, read history.
- Message board: send message, read recent messages.
- Recorder: start, stop, play, pause, rename, delete.

Out of scope for the first stage:

- Gomoku, Monopoly, Guandan, and any other game widget actions.
- AI form widget actions.
- Dynamic widget generation or Codex-backed widget creation.
- Complex planning and long-text rewriting.

## Safety and Confirmation

No confirmation required:

- Open, focus, refresh, play, pause, set city, set timezone, set countdown duration.

Confirmation required:

- Delete widget.
- Clear note, todo, clipboard, recording, or form contents.
- Replace existing long text.
- Bulk move, bulk delete, or bulk clear.
- Any action that cannot be safely reversed.

The confirmation flow is:

1. Harness returns `needs_confirmation`.
2. Assistant repeats the concrete action and target.
3. User says confirm or cancel.
4. Harness continues or aborts.
5. The final result is logged.

## Observability

Audit logs should record:

- User id.
- Board id.
- Source mode: voice, text, or test.
- User transcript or text command.
- Tool name.
- Sanitized arguments.
- Resolved target widget.
- Confirmation state.
- Success, failure, cancellation, or timeout.
- Duration.
- Realtime disconnect reason when a voice session ends.
- For live voice tests, VAD start/stop, sanitized user transcript, sanitized assistant transcript, function call, and tool result trace linkage.

Do not store raw audio in the first-stage implementation.

## Implementation Discipline

- Keep implementation milestones small and independently verifiable.
- Add tests with each milestone.
- Avoid broad widget rewrites while exposing actions.
- Prefer pure action modules and state patches before browser-capability bridges.
- Use mock Realtime adapters for tests before connecting live audio.
- Update this file and `MILESTONES.md` when scope changes.
