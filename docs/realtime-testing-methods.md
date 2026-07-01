# Realtime Testing Methods

This is the canonical test path for future Realtime and voice-control checks.

## Keep

- Source command catalog: `docs/realtime-voice-scenario-command-catalog-700.md`
- Latest full online semantic report: `docs/realtime-live-semantic-catalog-700-report.md`
- Latest targeted online rerun report: `docs/realtime-live-semantic-catalog-selected-report.md`
- Deterministic simulation report: `docs/realtime-voice-scenario-catalog-simulation-report.md`
- Deterministic execution groups: `docs/realtime-voice-scenario-execution-groups.md`
- Harness execution report: `docs/realtime-voice-scenario-catalog-harness-report.md`
- Stateful execution report: `docs/realtime-voice-scenario-catalog-stateful-harness-report.md`
- Text-only Realtime event report: `docs/realtime-voice-scenario-catalog-text-only-realtime-report.md`
- Live session tool contract report: `docs/realtime-live-session-tool-contract-report.md`
- Live voice smoke report: `docs/realtime-live-voice-smoke-report.md`
- Audio replay fallback report: `docs/realtime-audio-replay-fallback-report.md`

## Local Deterministic Gates

Run these before changing Realtime routing or command policy:

```bash
pnpm --filter @xiaozhuoban/assistant-core test
pnpm vitest run apps/web/src/assistant/AssistantHarness.test.ts apps/web/src/assistant/voiceScenarioHoldout.test.ts apps/web/src/assistant/voiceScenarioCatalogStatefulHarness.test.ts apps/web/src/assistant/voiceScenarioCatalogHarness.test.ts apps/web/src/assistant/openaiRealtimeAdapter.test.ts apps/web/src/assistant/realtimeTextToolCall.test.ts
pnpm typecheck
git diff --check
```

## 700 Catalog Simulation

This is deterministic and does not call Realtime:

```bash
node scripts/simulate-voice-scenario-catalog.mjs
```

It rewrites:

- `docs/realtime-voice-scenario-catalog-simulation-report.md`
- `docs/realtime-voice-scenario-execution-groups.md`

## Online Realtime-2 Semantic Gate

Full catalog run:

```bash
XIAOZHUOBAN_REALTIME_LIVE_SITE=https://xiaozhuoban.bqxb.org node scripts/realtime-live-semantic-gate.mjs --catalog --limit=700 --batch-size=12
```

Targeted rerun for failure clusters:

```bash
XIAOZHUOBAN_REALTIME_LIVE_SITE=https://xiaozhuoban.bqxb.org node scripts/realtime-live-semantic-gate.mjs --catalog --limit=700 --ids=125,259,399 --batch-size=12
```

Online full-run results can vary because the model can return different safe plans across runs. Treat the full run as an early-warning scan. Fix and record failure clusters through targeted reruns.

## Live Session Tool Contract

Run this after changing Realtime session tools, fallback policy, tool exposure, or scoped module context:

```bash
node scripts/realtime-live-session-tool-contract.mjs
```

Target catalog rows without calling Realtime:

```bash
node scripts/realtime-live-session-tool-contract.mjs --dry-run --ids=028,061,067
```

The live contract checks the production-shaped sequence:

```text
selector session.update
-> assistant.select_tool
-> selected tool must be in exposedTools
-> scoped session.update
-> function_call must be one of scoped exposedTools
```

It does not execute Harness or mutate UI. Use the stateful and real-page gates below for execution evidence.

## Stateful 700 Execution Gate

Run this after routing, target-resolution, or tool-execution changes:

```bash
pnpm --filter @xiaozhuoban/web test -- src/assistant/voiceScenarioCatalogStatefulHarness.test.ts
```

This is the main 700-command execution gate. It uses real assistant action schemas, real target resolution, confirmation flow, and an in-memory board/widget store. Unlike the semantic gate, it fails when a selected tool cannot execute because required args such as `widgetId`, city, countdown duration, or widget state are missing.

## Real-Page Execution Probe

The policy recovery probe validates frontend state with mocked Realtime plans:

```bash
pnpm --filter @xiaozhuoban/web dev -- --host 127.0.0.1 --port 5174
NODE_PATH=/tmp/xz-playwright-runner/node_modules node scripts/playwright-realtime-policy-recovery-probe.js
```

If Playwright is not available, install or point `NODE_PATH` to a runner that provides `playwright`. Do not count a syntax-only check as real-page coverage.

## Real-Page Scenario Groups

The broader real-page command coverage lives under:

- `scripts/playwright-real-page-*-group.js`
- `scripts/playwright-real-page-*-group.spec.js`

Run individual groups when repairing a specific command family, for example:

```bash
NODE_PATH=/tmp/xz-playwright-runner/node_modules node scripts/playwright-real-page-music-mood-correction-group.js
NODE_PATH=/tmp/xz-playwright-runner/node_modules node scripts/playwright-real-page-message-board-safety-group.js
```

These scripts validate rendered frontend state. Keep them as real-page regression assets unless a replacement runner covers the same user flow and report path.

## Live Voice Smoke

Run this after changing Realtime WebRTC setup, voice transcript handling, tool exposure, scoped session updates, or tool execution:

```bash
NODE_PATH=/tmp/xz-playwright-runner/node_modules node scripts/playwright-live-voice-smoke-gate.js
```

By default it opens `http://127.0.0.1:5176/app`, starts Vite if needed, and feeds `tests/audio/realtime-live-smoke/*-vad.wav` through Chrome fake microphone into the real WebRTC Realtime session.

The gate requires:

- microphone stream, VAD start/stop, and final transcript
- `realtime.tool_exposure.plan`
- `assistant.select_tool`
- selected tool inside `exposedTools`
- scoped `session.updated`, or an explicit local shortcut closure after selection
- Harness success and visible UI mutation
- zero `assistant.execute_command` fallback uses

It writes `docs/realtime-live-voice-smoke-report.md` plus screenshots and trace JSON under `output/playwright/realtime-live-voice-smoke/`.

## Audio Fallback

This is only a fallback inventory check. Do not count it as live voice coverage:

```bash
node scripts/realtime-audio-replay-or-text-fallback.mjs
```

It writes `docs/realtime-audio-replay-fallback-report.md`.

## Policy Source

Do not add long prompt patches for individual failures. Update the shared policy instead:

- `packages/assistant-core/src/commandPolicyManifest.json`
- `packages/assistant-core/src/shortcutDeferralPolicy.ts`
- `packages/assistant-core/src/commandPolicy.ts`
- `apps/web/src/assistant/AssistantHarness.ts` for deterministic execution repair only when the product can safely recover.

`AssistantHarness.getLastDiagnostics().shortcutDeferral` records the matched `ruleId`, `category`, and `reason` when a complex local shortcut is intentionally routed to Realtime. Use this field to distinguish correct Realtime delegation from accidental local shortcut failure.
