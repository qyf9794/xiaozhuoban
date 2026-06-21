# Realtime 700 More-Realistic Test Plan

## Problem With Previous Gates

The old 700-command reports are useful but shallow:

- `realtime-live-semantic-catalog-700-report.md` checks whether Realtime-2 selects expected tool names. It does not execute tools.
- `realtime-voice-scenario-catalog-text-only-realtime-report.md` checks that text commands are sent as Realtime events. It does not wait for model planning, tool execution, or UI state.
- `realtime-voice-scenario-catalog-harness-report.md` used a loose simulated registry, so invalid or missing tool arguments could still pass.

These gates cannot catch failures where the model selects `widget.remove` correctly, but execution fails because the target `widgetId` is missing or the command needs multiple widget removals.

## New Test Pyramid

1. **Semantic gate**
   - Purpose: cheap model-routing early warning.
   - Command: `XIAOZHUOBAN_REALTIME_LIVE_SITE=https://xiaozhuoban.bqxb.org node scripts/realtime-live-semantic-gate.mjs --catalog --limit=700 --batch-size=12`
   - Pass means: expected tools were selected.
   - Pass does not mean: tools executed or UI changed.

2. **Stateful AssistantHarness 700 gate**
   - Purpose: realistic execution without browser flakiness.
   - Command: `pnpm --filter @xiaozhuoban/web test -- src/assistant/voiceScenarioCatalogStatefulHarness.test.ts`
   - It uses the 700-command catalog, actual assistant actions, actual argument schemas, target resolution, confirmation flow, and an in-memory desktop state store.
   - It verifies that each command reaches real execution, target-required tools receive usable target ids, and state-changing tools mutate the expected in-memory board/widget state.
   - Report: `docs/realtime-voice-scenario-catalog-stateful-harness-report.md`

3. **Real-page execution probes**
   - Purpose: rendered UI and DOM-state verification.
   - Commands: run focused `scripts/playwright-real-page-*-group.js` groups for the failure family.
   - This validates visible widgets, text, layout, confirmation UI, and runtime errors.
   - Use this for changed surfaces or failure clusters rather than all 700 on every run, because a full 700 DOM run is slow and stateful.

4. **Manual live voice smoke**
   - Purpose: microphone/audio/WebRTC behavior.
   - Small set only: connect voice, say close/focus/open commands, verify no disconnect, speech and orb response.
   - This covers audio capture and Realtime WebRTC details that text tests cannot cover.

## Default Regression Command

Use this before claiming Realtime command execution is fixed:

```bash
pnpm --filter @xiaozhuoban/web test -- src/assistant/voiceScenarioCatalogStatefulHarness.test.ts src/assistant/AssistantHarness.test.ts src/assistant/openaiRealtimeAdapter.test.ts src/assistant/realtimeTextToolCall.test.ts
pnpm --filter @xiaozhuoban/web typecheck
git diff --check
```

## Pass Criteria

- 700/700 stateful harness commands pass.
- No command passes only because a loose mock ignored arguments.
- Target-required tools either execute with a concrete `widgetId` or return an intentional clarification/confirmation path that is covered by the test.
- For real-page probes, the visible app state must change as expected and console errors must be explained.

## Learning Policy

Automatic learning-candidate creation is currently disabled. Confirmed learned shortcuts may still execute if already present, but the 700-command Realtime regression path does not depend on learned shortcuts and should be run with a clean learned-command store.
