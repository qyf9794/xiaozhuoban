# Assistant Tool Real Page Test Log

Date: 2026-06-17
Target: https://xiaozhuoban.bqxb.org/app
Mode: skip gpt-realtime-2 first; drive the assistant through the on-page text command input and verify real UI state.

## Milestones

### M1 Desktop Board Tools

Goal: prove the stage-one desktop tools work from the real page command path before voice.

Tools:
- `board.add_widget`
- `widget.focus`
- `widget.move`
- `widget.resize`
- `widget.bring_to_front`
- `board.auto_align`
- `assistant.confirm`
- `assistant.cancel`

Acceptance:
- Each command produces a visible success/error message in the assistant dock.
- Board/widget DOM state changes match the command.
- Confirmation flows show and clear the pending state.
- Results are recorded with command text, evidence, and status.

### M2 Board Management Tools

Goal: verify board lifecycle tools on the real page without relying on Realtime.

Tools:
- `board.create`
- `board.rename`
- `board.switch`

Acceptance:
- New board appears in the board list.
- Rename persists in visible UI.
- Switch changes the active board and assistant context.

### M3 Widget Detail State Tools

Goal: verify widget-detail tool calls after focusing or adding a widget.

Tools:
- `note.append`
- `note.set_text`
- `note.clear`
- Clock/countdown/weather/search/video/music/detail actions exposed by `widgetStateActions`.

Acceptance:
- Focusing a widget updates available tool scope.
- Each tested detail command changes the target widget state or returns an expected guarded response.
- Failed or unsupported detail commands are logged with the exact blocker.

### M4 Mounted Capability Tools

Goal: verify tools backed by mounted widget capabilities.

Tools:
- TV/media playback controls
- recorder actions
- music player actions
- dial clock/night mode and other `widgetCapabilityBridge` actions

Acceptance:
- Capability is registered only when the widget is mounted.
- Command reaches the mounted widget.
- UI state or widget-local evidence proves the action ran.

### M5 Concurrency And Status Bubble

Goal: add and verify concurrent tool execution visibility.

Required work:
- Add a state bubble showing current operation name/status.
- Preserve visible state for queued, running, succeeded, failed, and waiting-confirmation operations.
- Verify rapid multi-command behavior does not lose state or hide failures.

Acceptance:
- Real page shows operation state during tool execution.
- Test log records parallel or rapid command behavior.
- Any code changes are tested, committed, and pushed before moving on.

### M6 Voice Handoff

Goal: after command-path tools are reliable, return to `gpt-realtime-2` voice.

Required work:
- Tune turn detection if voice is cut off before the user finishes speaking.
- Verify voice calls the same tools already proven through text commands.

Acceptance:
- Microphone permission is allowed.
- A long spoken command is not prematurely cut off.
- At least one board tool and one widget-detail tool succeed by voice.

## Test Results

### M1 Desktop Board Tools

Status: in progress

| Time | Tool | Command | Evidence | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-06-17 01:03 CST | `board.add_widget` | `添加便签` | Chrome real page showed the command text inside the assistant input, but pressing Enter left `inputValue="添加便签"`, dock text unchanged, and widget count stayed at 6. Clicking the send button failed because the automation click target resolved outside the visible viewport. | fail | First blocker is testability/observability of the dock command path on mobile layout. Add stable test ids and an operation status bubble before continuing real-page tool tests. |
| 2026-06-17 01:06 CST | M1-0 testability | N/A | Added `data-testid` hooks for the dock/input/send/status bubble and a visible operation bubble. Verified with `pnpm --filter @xiaozhuoban/web test -- src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This does not prove tool execution yet; it makes the real-page command path observable and easier to drive in the next M1 run. |
| 2026-06-17 01:08 CST | M1-0 deployment check | N/A | Production asset polling showed CSS changed from `index-CfYqnNKp.css` to `index-CSXI5C-X.css`, matching the local build asset for the operation bubble change. | pass | Deployment reached production assets. Chrome page-level verification was attempted next. |
| 2026-06-17 01:09 CST | Chrome automation | N/A | `browser.user.openTabs()` and `browser.tabs.list()` both saw the Xiaozhuoban tab, but page interaction calls repeatedly failed with `Tab not found` or session/tab ownership mismatch after reload/new-tab attempts. | fail | This confirms the user-reported Chrome tool instability is affecting real-page tests. Continue M1 only after reconnecting a stable Chrome tab, or use another approved browser surface for verification. |
| 2026-06-17 01:10 CST | command submit fallback | `添加便签` | Added `resolveVoiceAssistantSubmitText` so form submit falls back to the real input DOM value when React state is empty, and added `onInput` synchronization for external automation/voice-like input. Verified with `pnpm --filter @xiaozhuoban/web test -- src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This directly addresses the observed failure where the command text was visible in the input but the command path did not run. Real-page retest is still required after deploy. |
| 2026-06-17 01:11 CST | command submit fallback deployment | N/A | Production `index-DUZWtNyq.js` dynamically references `App-BPa7pCub.js`; that App chunk contains `voice-assistant-command-input`, `voice-assistant-send`, and `voice-assistant-operation`. | pass | The command fallback build reached production assets. |
| 2026-06-17 01:11 CST | Chrome automation retry | N/A | After reconnecting Chrome, `browser.tabs.list()` showed only the Xiaozhuoban tab, but `browser.tabs.get('1115457935')` followed by page calls still failed with `Tab not found: 4. Existing tabs: none`. | fail | Chrome tool session remains unstable, so M1 real-page command retest is blocked on Chrome automation rather than app code evidence. |
| 2026-06-17 01:14 CST | command Enter fallback | `添加便签` | Added `shouldSubmitVoiceAssistantOnKeyDown` and an input-level plain-Enter handler that calls the same DOM fallback submit path while ignoring Shift/Ctrl/Meta/Alt/composition Enter. Verified with `pnpm --filter @xiaozhuoban/web test -- src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This addresses the observed real-page symptom where pressing Enter left the command in the input and did not run the tool path. Real-page retest still depends on stable browser automation. |
| 2026-06-17 01:15 CST | command Enter fallback deployment | N/A | Production `/app` entry references `assets/App-BPa7pCub.js`, and that chunk contains the Enter fallback markers `isComposing`/`onKeyDown`. | pass | Enter fallback reached production assets. |
| 2026-06-17 01:17 CST | command send button fallback | `添加便签` | Changed the send button to stay enabled unless the assistant is muted, so DOM-backed command fallback is not blocked when React `text` state lags behind the real input value. Verified with `pnpm --filter @xiaozhuoban/web test -- src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | Empty commands remain safe because `runCommand` trims and no-ops empty input. Real-page retest still depends on stable browser automation. |
| 2026-06-17 01:18 CST | command send button fallback deployment | N/A | Production `/app` entry changed to `index-0Jlg6l9J.js`, which references `assets/App-CX-fitcz.js`; the App chunk contains `voice-assistant-send` and the updated send-button code. | pass | Send-button fallback reached production assets. |
| 2026-06-17 01:21 CST | tool operation status events | Realtime/function-call tools | Added `AssistantOperationEvent` emission from `AssistantHarness` for running, waiting-confirmation, success, and failed tool phases; wired runtime/App/Dock so external tool calls can update the visible operation bubble even when they do not originate from the text form. Verified with `pnpm --filter @xiaozhuoban/web test -- src/assistant/AssistantHarness.test.ts src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This is the first state-bubble layer for Realtime tool calls. It does not yet prove parallel execution; it makes each tool phase observable in UI. |
| 2026-06-17 01:23 CST | tool operation status deployment | N/A | Production `/app` entry `assets/index-BLGw3LWO.js` references `assets/App-BiJBUfuz.js`; the App chunk contains the operation-state markers used by the new Realtime/function-call status bridge. | pass | Tool operation status UI reached production assets. |
| 2026-06-17 01:27 CST | concurrent operation status aggregation | Realtime/function-call tools | Added an operation snapshot reducer that tracks multiple active tool calls by id, removes completed calls, and summarizes concurrent running/waiting-confirmation operations for the visible Dock bubble. Verified with `pnpm --filter @xiaozhuoban/web test -- src/assistant/assistantOperationStatus.test.ts src/assistant/AssistantHarness.test.ts src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This prepares the UI/state layer for concurrent tool events. Realtime session config still has model-side `parallel_tool_calls: false`, so the next step is a controlled direct-command/concurrency test before enabling model-side parallel calls. |
| 2026-06-17 01:28 CST | concurrent operation status deployment | N/A | Production `/app` entry `assets/index-BlK7NEmB.js` references `assets/App-DtaoaRee.js`; the App chunk contains the concurrent operation summary markers. | pass | Concurrent operation status aggregation reached production assets. |
| 2026-06-17 01:30 CST | real-page direct command path | `添加便签`, `添加待办` | In the in-app browser on production `/app`, `添加便签` cleared the input and completed as `已聚焦小工具` because a note widget already existed. `添加待办` then cleared the input, changed todo widget headings from 0 to 1, and showed `完成：已添加小工具`. | pass | This proves the text command path and `board.add_widget` shortcut path work on the real production page without using Realtime. Chrome automation remains separately unstable. |
| 2026-06-17 01:32 CST | real-page confirmation flow | `整理桌面`, `取消` | In the in-app browser on production `/app`, `整理桌面` cleared the input, showed `待确认：整理桌面`, displayed `确认`/`取消` buttons, and set the last message to `确认执行 board.auto_align 吗？`. Clicking `取消` removed the buttons and showed `完成：已取消`. | pass | This verifies the confirm/cancel tool flow on the real page without mutating the desktop layout. |
| 2026-06-17 01:34 CST | real-page widget detail tool | `北京天气`, `上海天气` | Initial production test returned `未知工具：weather.set_city`, revealing widget detail actions were filtered out when the Harness initialized before widget definitions were loaded. Fixed detail-action registration, verified with `pnpm --filter @xiaozhuoban/web test -- src/assistant/widgetStateActions.test.ts src/assistant/assistantAcceptance.test.ts src/assistant/AssistantHarness.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. After production loaded `assets/index-B1wkgMbt.js`, `北京天气` switched the weather widget to 北京 and `上海天气` restored 上海, both showing `完成：已切换天气城市`. | pass | This verifies a widget-detail shortcut tool on the real page and records the cache-bust needed to load the fixed production entry. |
| 2026-06-17 01:36 CST | Realtime session endpoint precheck | N/A | `POST https://xiaozhuoban.bqxb.org/api/realtime/session` returned HTTP 200 with `model: gpt-realtime-2` and a present client secret field. The secret value was not logged. | pass | Backend API key/session configuration is currently present; no user-side API key action is needed before the next Realtime connection test. |
| 2026-06-17 01:40 CST | Realtime connection browser precheck | `连接语音` | In the in-app browser, clicking `连接语音` showed `失败：麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。`. The same test on the claimed Chrome `https://xiaozhuoban.bqxb.org/app` tab also returned the same microphone-denied UI state, with no console errors captured. | blocked | This is not an API key or session endpoint problem; the browser is denying microphone access before WebRTC reaches the Realtime SDP stage. Re-enable microphone permission for `xiaozhuoban.bqxb.org`, then rerun the Realtime connection test. |
| 2026-06-17 01:44 CST | Realtime microphone diagnostics | `连接语音` | Added a Realtime adapter microphone permission precheck, missing-device/unavailable classification, and separate UI copy for `MICROPHONE_UNAVAILABLE` versus `MICROPHONE_DENIED`. Verified with `pnpm --filter @xiaozhuoban/web test -- src/assistant/openaiRealtimeAdapter.test.ts src/components/VoiceAssistantDock.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This does not bypass the current browser permission block; it makes the next Realtime connection test more diagnostic once microphone access is allowed. |
| 2026-06-17 01:45 CST | Realtime microphone diagnostics deployment | N/A | Production `/app` entry `assets/index-hmf6KKlz.js` references `assets/App-aNapjc-U.js`; the App chunk contains the new microphone diagnostics markers. | pass | The permission/unavailable diagnostic layer reached production assets. |
| 2026-06-17 01:47 CST | Realtime turn detection tuning | N/A | Changed the Realtime session payload to use `semantic_vad` with `eagerness: low`, `create_response: true`, and `interrupt_response: true`, and added a helper so eagerness can be tuned later. Verified with `pnpm --filter @xiaozhuoban/web test -- src/assistant/realtimeSessionConfig.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This prepares the next voice-cutoff test by making turn detection wait longer before treating the user's speech as finished. It still requires browser microphone permission before real audio can be verified. |
| 2026-06-17 01:53 CST | Realtime turn detection API sync | N/A | Synced the same conservative `semantic_vad` payload into the production API entry `apps/web/api/realtime/session.ts` and extended `api/realtime/session.test.ts` to assert `eagerness: low`, `create_response: true`, and `interrupt_response: true` in the body sent to OpenAI. Verified with `pnpm --filter @xiaozhuoban/web test -- api/realtime/session.test.ts src/assistant/realtimeSessionConfig.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This corrects the earlier frontend-only VAD tuning so the actual serverless session endpoint will send the conservative turn-detection config after deployment. |
| 2026-06-17 01:56 CST | Realtime session config observability | N/A | Added non-sensitive response header `x-xiaozhuoban-realtime-turn-detection: semantic_vad;eagerness=low` to successful `/api/realtime/session` responses and covered it in `api/realtime/session.test.ts`. Verified with `pnpm --filter @xiaozhuoban/web test -- api/realtime/session.test.ts`, `pnpm --filter @xiaozhuoban/web typecheck`, `pnpm --filter @xiaozhuoban/web build`, and `pnpm test`. | pass | This gives the next production check a direct way to verify that the serverless API is running the conservative VAD config without logging secrets. |
