# Realtime Testing Methods

This is the canonical test path for future Realtime and voice-control checks.

## Keep

- Source command catalog: `docs/realtime-voice-scenario-command-catalog-700.md`
- Latest full online semantic report: `docs/realtime-live-semantic-catalog-700-report.md`
- Latest targeted online rerun report: `docs/realtime-live-semantic-catalog-selected-report.md`
- Deterministic simulation report: `docs/realtime-voice-scenario-catalog-simulation-report.md`
- Deterministic execution groups: `docs/realtime-voice-scenario-execution-groups.md`
- Harness execution report: `docs/realtime-voice-scenario-catalog-harness-report.md`
- Text-only Realtime event report: `docs/realtime-voice-scenario-catalog-text-only-realtime-report.md`
- Audio replay fallback report: `docs/realtime-audio-replay-fallback-report.md`

## Local Deterministic Gates

Run these before changing Realtime routing or command policy:

```bash
pnpm --filter @xiaozhuoban/assistant-core test
pnpm vitest run apps/web/src/assistant/AssistantHarness.test.ts apps/web/src/assistant/voiceScenarioHoldout.test.ts apps/web/src/assistant/voiceScenarioCatalogTextOnlyRealtime.test.ts apps/web/src/assistant/voiceScenarioCatalogHarness.test.ts apps/web/src/assistant/openaiRealtimeAdapter.test.ts apps/web/src/assistant/realtimeTextToolCall.test.ts
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

## Audio Fallback

Current unattended audio replay is not available. Record the fallback state with:

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
