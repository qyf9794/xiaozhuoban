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
