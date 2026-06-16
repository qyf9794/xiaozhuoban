# 小桌板语音助手实施 Milestones

This milestone plan is derived from `/Users/qianyifeng/Downloads/PLAN.md` and the first-stage scope in `agent.md`.

## Milestone 0: Documentation Baseline

Goal: Establish the shared target, implementation boundaries, and verification roadmap.

Deliverables:

- `agent.md` documents the product goal, architecture, OpenAI official-doc requirements, tool scope, and safety model.
- `MILESTONES.md` lists small, verifiable implementation milestones.

Acceptance:

- A developer can understand first-stage scope without reading chat history.
- The docs explicitly say that OpenAI Realtime configuration must follow official docs.
- Dynamic Codex/widget generation is marked out of scope for stage one.

Suggested verification:

- Read `agent.md`.
- Read `MILESTONES.md`.
- Confirm no code behavior changes are introduced by this milestone.

## Milestone 1: Assistant Core Package Skeleton

Goal: Add a pure TypeScript package for assistant contracts and local action execution.

Deliverables:

- New workspace package: `packages/assistant-core`.
- Types for `AssistantToolSpec`, `AssistantToolCall`, `AssistantToolResult`, `ConfirmationRequest`, `ResolvedWidgetTarget`, and action risk levels.
- `ActionRegistry` with register, list, get, and execute methods.
- Types for local shortcut routing, tool scopes, and compact context summaries.
- Unit tests for successful execution, unknown action, duplicate registration, schema failure, and executor failure.

Acceptance:

- No Web, Supabase, Realtime, or widget UI dependency exists in `assistant-core`.
- `pnpm --filter @xiaozhuoban/assistant-core test` passes.
- `pnpm --filter @xiaozhuoban/assistant-core typecheck` passes.

## Milestone 2: Board Store Adapter

Goal: Expose current board-level operations as local assistant actions without Realtime.

Deliverables:

- Web-side store adapter that wraps existing Zustand store operations.
- Actions for add existing widget, remove widget, move widget, resize widget, bring to front, auto-align, switch board, create board, and rename board.
- Confirmation metadata for remove, bulk, and destructive board actions.
- Size-policy checks so fixed-size widgets cannot be resized by assistant actions.

Acceptance:

- Actions can be executed from tests with mocked store state.
- No UI flow changes are required.
- All state-changing actions route through `ActionRegistry.execute()`.
- Resize returns a non-mutating failure result for fixed-size widgets.
- Resize follows existing size constraints for constrained but resizable widgets.

Suggested verification:

- Unit tests for add, remove, move, resize, auto-align, and board switch.
- Unit tests for fixed-size resize refusal and constrained resize clamping.
- Existing `apps/web/src/store.test.ts` remains green.

## Milestone 3: IntentShortcutRouter

Goal: Route deterministic high-frequency commands locally before using `gpt-realtime-2`.

Deliverables:

- `IntentShortcutRouter` with transcript normalization and confidence scoring.
- Shortcut rules for simple desktop commands: open/add widget, focus widget, confirm, cancel, auto-align, fullscreen focus, play/pause, set city, and set countdown duration.
- Output shape that feeds back into `AssistantHarness` as a normal tool call.
- Fallback result when no shortcut confidently matches.

Acceptance:

- "打开天气" routes locally to add or focus weather.
- "上海天气" routes locally when weather intent and city are obvious.
- "十分钟倒计时" routes locally to countdown setup when unambiguous.
- "确认" and "取消" route locally when a confirmation is pending.
- Ambiguous or destructive commands return `no_match` or require confirmation, not a guessed mutation.
- Shortcut-routed commands still write audit logs.

Suggested verification:

- Unit tests for matched, no-match, ambiguous, confirm, cancel, and destructive cases.
- Integration test proving a shortcut command can execute without invoking a Realtime model adapter.

## Milestone 4: WidgetTargetResolver

Goal: Resolve natural-language widget targets to concrete widget instances.

Deliverables:

- `WidgetTargetResolver` implementation.
- Support for type references, order references, recent references, and content/name references.
- Clarification result for ambiguous targets.
- Recent interaction tracking interface.

Acceptance:

- "那个电视" resolves to the most recently interacted TV widget when available.
- "最近的便签" resolves to the latest interacted or latest created note.
- "第一个倒计时" resolves by board order.
- Ambiguous "那个" with no recent context returns `needs_clarification`.

Suggested verification:

- Unit tests for type, order, recent, content, no-match, and ambiguous cases.

## Milestone 5: ToolScopeManager and ContextSummarizer

Goal: Keep Realtime context and tools small by exposing only the smallest useful tool set.

Deliverables:

- `ToolScopeManager` with desktop, widget-selection, widget-detail, and deferred scopes.
- Tool serializer that registers desktop-level tools first.
- Ability to load only one selected widget type's detail actions into Realtime.
- `ContextSummarizer` for compact board and widget state.
- Tests proving full desktop/widget state is not included in Realtime context.

Acceptance:

- Initial Realtime tool schema contains only desktop-level tools and target-selection tools.
- Widget detail actions are absent until a widget context is selected.
- Selecting TV loads TV detail actions without loading note, todo, weather, recorder, or other widget actions.
- Game, AI form, dynamic generation, complex planning, and long-text rewrite tools are never registered in stage one.
- Context summaries include only board id/name, widget counts, recent/visible widget summaries, focused widget summary, and pending confirmation summary.

Suggested verification:

- Unit tests for scope transitions.
- Snapshot-style tests for initial, widget-selected, and deferred scopes.
- Tests asserting no full note/todo/clipboard/message/history payload is serialized.

## Milestone 6: AssistantHarness Lifecycle

Goal: Implement the function-call lifecycle around a mock Realtime adapter.

Deliverables:

- `apps/web/src/assistant/AssistantHarness.ts`.
- Interfaces for Realtime adapter, audit adapter, confirmation presenter, store adapter, and server-tool adapter.
- Integration with `IntentShortcutRouter`, `ToolScopeManager`, and `ContextSummarizer`.
- Lifecycle states: received, validating, resolving target, confirming, executing, reporting, failed, cancelled, timed out.
- Tool result return path to the adapter.

Acceptance:

- Harness can process a mock function call and return a structured tool result.
- Harness can execute a local shortcut before invoking Realtime fallback.
- Harness can update Realtime tools when entering or leaving a widget context.
- Invalid tool names and invalid arguments are rejected safely.
- Confirmation-required actions pause until confirm or cancel.
- Timeout and cancellation paths return clear tool results.

Suggested verification:

- Unit tests with mock Realtime adapter and mock `ActionRegistry`.
- Tests cover shortcut success, model fallback, unknown tool, schema error, clarification, confirmation, cancel, timeout, and executor failure.

## Milestone 7: Non-Media Widget State Actions

Goal: Expose state-only widget controls that do not require browser media APIs.

Deliverables:

- Action modules for note, todo, calculator, countdown, weather, headline, market, world clock, converter, translate, and clipboard.
- Shared helpers for patching `WidgetInstance.state`.
- Widget action specs registered only when matching widget definitions exist.
- Widget detail specs are registered only after the corresponding widget context is selected.
- Game widgets and AI form widgets are not registered in stage one.

Acceptance:

- Each action validates target widget type before patching state.
- Each action returns a human-readable result summary.
- Destructive state changes require confirmation metadata.
- Large state fields are summarized before being sent to Realtime.

Suggested verification:

- Unit tests per widget action group.
- Integration tests for:
  - "打开上海天气"
  - "在最近的便签写：明早九点开会"
  - "把第一个倒计时设为 10 分钟并开始"
  - "新增一个明天下午三点交报告的待办"
  - "翻译这句话成英文：今天晚上吃什么"

## Milestone 8: Widget Capability Bridge

Goal: Add a bridge for widget behaviors that cannot be expressed as state patches alone.

Deliverables:

- Browser-side capability bridge for widget-local effects.
- Capability registration by widget instance id.
- Actions for music play/pause/resume/next, TV play/pause/fullscreen/channel selection, recorder start/stop/play/pause, and dial-clock night mode.
- Capability actions are exposed only inside the selected widget detail scope.
- Safe fallback result when a widget is not mounted or capability is unavailable.

Acceptance:

- Harness can trigger mounted widget capabilities without importing widget UI internals.
- Unmounted or missing-capability widgets fail gracefully.
- Media actions still update state where state is the source of truth.

Suggested verification:

- Mock capability bridge tests.
- Integration test for "播放 CCTV1，并把电视全屏".
- Integration test for recorder start and stop with mocked media APIs.

## Milestone 9: Scope Guardrails for Deferred Widgets and Complex Requests

Goal: Make sure game widgets, AI form widgets, dynamic generation, complex planning, and long-text work are not callable in stage one.

Deliverables:

- Explicit denylist or absence checks for Gomoku, Monopoly, Guandan, and AI form widget actions.
- Explicit out-of-scope handling for dynamic widget generation, complex planning, and long-text rewriting.
- Tool schema generation tests proving these actions are not registered.
- Harness behavior for user requests targeting deferred widgets.
- Short response templates for out-of-scope requests.
- Documentation note that these widgets require a later milestone before voice control.

Acceptance:

- Realtime tool schema contains no game or AI form action names.
- A request such as "大富翁掷骰" returns a clear out-of-scope result and performs no mutation.
- A request such as "提交这个 AI 表单" returns a clear out-of-scope result and performs no mutation.
- A request such as "帮我生成一个新工具" returns a short out-of-scope result and performs no server call.
- A request such as "帮我重写这篇长文" returns a short out-of-scope result and does not enter Realtime long-form processing.
- Deferred widgets can still be added, focused, moved, or removed through generic board/widget shell actions when allowed by confirmation and size policy.

Suggested verification:

- Unit tests for schema exclusion.
- Integration tests for "接受五子棋邀请", "大富翁掷骰", "掼蛋过牌", "提交这个 AI 表单", "生成一个新工具", and "重写这篇长文" returning out-of-scope results.
- Generic focus/remove tests for deferred widget instances.

## Milestone 10: Realtime Session Endpoint

Goal: Add server-side Realtime session creation according to current OpenAI official docs.

Deliverables:

- Vercel API endpoint for creating a `gpt-realtime-2` Realtime session.
- Server-only OpenAI API key usage.
- Session instructions describing xiaozhuoban-only control boundaries.
- Initial session tool schema sourced from `ToolScopeManager`, limited to desktop-level tools and target selection.
- Session instructions requiring short replies and no long-form planning or rewriting.

Acceptance:

- No OpenAI API key is exposed to the browser bundle.
- The endpoint follows the current official Realtime WebRTC/session flow.
- The model is configured as `gpt-realtime-2`.
- Reasoning effort defaults to low unless tests show it should be changed.
- The initial session does not include all widget detail actions.
- The initial session includes compact state summary only.
- Assistant responses are instructed to be brief.

Suggested verification:

- Endpoint unit test with mocked OpenAI fetch/client.
- Manual check against official OpenAI docs before implementation merge.
- `pnpm --filter @xiaozhuoban/web typecheck` passes.

## Milestone 11: VoiceAssistantDock UI

Goal: Add a minimal voice control surface that uses the Harness.

Deliverables:

- `VoiceAssistantDock` component.
- States for disconnected, connecting, listening, thinking, executing tool, waiting confirmation, error, and muted.
- Push-to-talk or click-to-talk flow.
- Confirmation UI for pending Harness requests.
- Short status text for shortcut-routed, model-routed, and out-of-scope requests.

Acceptance:

- UI can run against a mock Realtime adapter without live OpenAI access.
- User can confirm or cancel a pending action.
- Dock does not block core desktop controls on desktop or mobile.

Suggested verification:

- Component tests for state rendering.
- Playwright check for desktop and mobile layout.
- Manual browser check with mock adapter.

## Milestone 12: Text Command Harness Entry

Goal: Provide a non-audio path for testing and fallback.

Deliverables:

- Text command entry in command palette or a dedicated assistant panel.
- Text commands use the same Harness and registered tools.
- Text commands use the same shortcut-first routing as voice.
- Mock parser path for tests, with live Realtime/text interpretation deferred if needed.

Acceptance:

- Developers can validate tool execution without microphone access.
- Text command history is visible enough for debugging.
- The text path shares confirmation and audit behavior with voice.
- Deterministic shortcut commands can be tested without Realtime.

Suggested verification:

- Integration tests for text commands matching the main voice acceptance scenarios.

## Milestone 13: Audit Logging

Goal: Persist assistant execution traces without storing raw audio.

Deliverables:

- Supabase `assistant_command_logs` table and RLS policies.
- Audit adapter with Supabase implementation and local fallback.
- Logs for success, failure, confirmation, cancellation, and timeout.

Acceptance:

- Each tool call records user id, board id, source mode, routing path, transcript/text, tool name, sanitized args, target widget, result, error, confirmation state, and duration.
- Raw audio is never stored.
- Local development without Supabase still works.

Suggested verification:

- Supabase repository tests or mocked client tests.
- Manual insert/read check with authenticated user.

## Milestone 14: Live Realtime Integration

Goal: Connect the UI, Realtime transport, Harness, and local actions end to end.

Deliverables:

- WebRTC connection using the session endpoint.
- Data channel event parsing for function calls.
- Tool result events sent back to Realtime.
- Live voice interaction for shortcut-first desktop commands and scoped widget detail commands.
- Realtime tool updates when entering selected widget contexts.

Acceptance:

- User can say "打开上海天气" and see the weather widget created or updated.
- User can say "把第一个倒计时设为 10 分钟并开始" and see the countdown update.
- Simple shortcut commands can execute without a model fallback.
- Widget detail commands load only that widget's action scope.
- User can say "取消" during a pending destructive action and no mutation occurs.
- Disconnection and microphone denial show recoverable UI states.

Suggested verification:

- Manual live browser test with OpenAI credentials.
- Mocked E2E tests remain available for CI.

## Milestone 15: End-to-End Acceptance Suite

Goal: Lock the first-stage behavior before expanding scope.

Deliverables:

- Playwright scenarios for the accepted commands.
- Mock Realtime adapter fixtures.
- Regression checklist for desktop, mobile, authenticated Supabase, and local fallback modes.
- Tests for shortcut-first routing, scoped tool registration, compact context, and short out-of-scope responses.

Acceptance:

- All unit, integration, typecheck, and build commands pass.
- The core voice scenarios are covered by deterministic mocked tests.
- No test snapshot sends full desktop or full widget state to Realtime.
- Realtime initial tool schema does not include every widget action.
- The live Realtime manual test checklist is documented.

Suggested verification:

- `pnpm run test`
- `pnpm --filter @xiaozhuoban/web typecheck`
- `pnpm run build`
- Playwright E2E command for assistant scenarios.

## Milestone 16: Stage-One Rollout Review

Goal: Decide whether the first-stage voice control foundation is ready for broader widget work.

Deliverables:

- Short implementation recap.
- Known limitations.
- Failed command examples.
- Latency and reliability notes.
- Shortcut hit rate, Realtime fallback rate, and average response length notes.
- Updated next-stage recommendations.

Acceptance:

- Product owner can verify whether voice control of existing widgets is useful enough.
- Any decision to reintroduce Codex-powered widget generation is deferred to a separate stage-two plan.
- `agent.md` and this milestone file are updated with any new constraints.
