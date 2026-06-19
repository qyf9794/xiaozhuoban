# Realtime-2 Systematic Optimization Plan

## Goal

Improve real voice control without adapting the system only to the current catalog tests.

## Principles

- Treat text semantic tests as one layer, not the source of truth.
- Prefer semantic contracts over exact tool lists.
- Keep prompts short; move detailed behavior into structured manifests and scoped module context.
- Route low-confidence and multi-step commands to Realtime-2, but load tool detail incrementally.
- Validate execution with frontend state, not only model tool names.

## Layers

1. Module selection
   - Send a compact module manifest first.
   - Include aliases, capabilities, risk notes, and examples.
   - Do not send every tool schema in the first turn.

2. Scoped tool planning
   - After module selection, send only selected module tools and directly related shared tools.
   - Multi-module commands are split into ordered steps.
   - Confirmation and current-state checks stay in the local harness.

3. Semantic contract testing
   - Each catalog command evaluates required capabilities, equivalent tool groups, and forbidden tools.
   - Examples:
     - `tv.play` and `tv.select_channel` can both satisfy channel-open semantics.
     - `关闭留言板` forbids `messageBoard.send`.
     - Music auth or preview-mode issues can be satisfied by `music.auth_status` or diagnostics depending on wording.
   - Manual corrections should change contracts, not chase a single model output.

4. Real voice and frontend execution
   - Add microphone/VAD/noise/segmentation tests separately from text-only tests.
   - Record: audio input, transcript, Realtime selection, scoped tool plan, local execution, frontend success/failure.
   - Mark commands requiring frontend state as execution tests rather than static semantic failures.

## Test Suites

- Golden set: small, high-value user commands. Must remain 100%.
- Catalog set: broad regression set. Uses semantic contracts and accepts equivalent tools.
- Holdout set: commands sampled from real usage logs. Not used to tune prompts directly.
- Audio set: real or synthetic microphone inputs for VAD, noise, pauses, and disfluency.
- Execution set: real page checks for widget open/close/play/search/move outcomes.

## Current Implementation Status

- Live Realtime-2 catalog runner exists at `scripts/realtime-live-semantic-gate.mjs`.
- The runner now evaluates semantic contracts: `must`, `anyOf`, and `forbid`.
- The runner supports `--ids=001,002` targeted online reruns while keeping the full catalog tool directory available.
- Shared command policy manifest exists at `packages/assistant-core/src/commandPolicyManifest.json`.
- Runtime recovery and live semantic contracts now read shared policy instead of maintaining separate non-action and contract rule lists.
- Compact Realtime prompt snippets are generated from the shared command policy manifest instead of copied long-form arrays.
- Harness execution now verifies Realtime plans before execution, recovers high-confidence local actions after non-action or forbidden model plans, and rejects forbidden plans that cannot be recovered safely.
- Online semantic gate now marks policy-declared non-action model outputs as `recoverable_non_action` when Harness recovery is expected, instead of forcing every safe diagnostics result to become an exact tool-name match.
- Reports show the evaluated contract instead of only one exact expected tool list.
- Latest full online text-semantic run: 693/700 passed against `https://xiaozhuoban.bqxb.org`; the remaining failure clusters from that run were then targeted-rerun and passed 7/7.
- Previous full online text-semantic run after policy updates reached 698/700; the remaining 2 cases were targeted-rerun and passed 2/2. Single full-run pass rate is still affected by Realtime model output variance, so failure clusters are rerun and fixed separately.
- Failure-cluster reruns after contract/tool-directory fixes passed for the tracked clusters: 16/16, 3/3, 2/2, and 7/7.
- Product execution now has a local recovery guard when Realtime returns only `assistant.reply` or `assistant.runtime_diagnostics` for a high-confidence local action such as closing the message board or organizing the desktop.
- Text semantic failures and final frontend execution failures are tracked separately. A command can remain a semantic-model miss while the product succeeds through guarded local recovery.
- A blind holdout file exists at `docs/realtime-voice-scenario-holdout.md`; tests verify it has no expected tool labels or correction notes.
- Frontend policy recovery probe exists at `scripts/playwright-realtime-policy-recovery-probe.js` for real-page mocked Realtime plan recovery/rejection checks.
- Unattended real-microphone replay is not available in the current repo. Existing voice automation uses text input or fake `getUserMedia`, so `scripts/realtime-audio-replay-or-text-fallback.mjs` records an explicit text fallback report until audio fixtures and an offline decoder path are added.

## Execution Plan

### Phase 1: Single Policy Source

- Done: deterministic command policy now lives in `commandPolicyManifest.json`.
- Done: semantic contracts, runtime non-action/forbidden recovery, and prompt snippets are generated from the same policy source.
- Ongoing rule: keep Realtime prompts short; do not add more long-form rules unless a failing behavior cannot be expressed in manifest policy.

### Phase 2: Plan Verification Before Execution

- Done: Harness verifies Realtime plans after model return and before execution.
- Done: forbidden tool combinations are rejected before execution, such as `关闭留言板` producing `messageBoard.send`.
- Done: guarded local recovery handles non-action model tools and forbidden model tools only when the local shortcut is high-confidence and policy-safe.
- Existing behavior retained: missing `board.add_widget` is only inferred when the selected detail tool has a known widget definition and no mounted target.

### Phase 3: Execution-Centric Regression

- Treat text semantic pass rate as an early warning metric, not final success.
- Done: Harness tests track model miss vs recovered execution vs rejected execution.
- Done: real-page probe script validates frontend state after mocked Realtime plan recovery/rejection.
- Done: Harness now deterministically prepends `app.fullscreen.set` exit before `widget.resize` when Realtime omits fullscreen exit from an explicit "退出全屏后调整大小" command.
- Ongoing: expand execution probes for playback state, layout changes, and mounted-widget dependencies as real regressions appear.

### Phase 4: Audio Replay

- Done: fallback runner records whether audio fixtures exist and writes a report when only text fallback is possible.
- Pending: add small audio fixtures for representative commands once unattended microphone replay is available.
- Pending: validate VAD segmentation, transcript stability, repeated response suppression, and interruption handling through the audio fixture path.
- Until then, use text-only Realtime event flow as the unattended fallback.

## Current Verification Commands

- `pnpm --filter @xiaozhuoban/assistant-core test`
- `pnpm vitest run apps/web/src/assistant/AssistantHarness.test.ts apps/web/src/assistant/voiceScenarioHoldout.test.ts`
- `node --check scripts/realtime-live-semantic-gate.mjs`
- `node --check scripts/playwright-realtime-policy-recovery-probe.js`
- `node scripts/realtime-audio-replay-or-text-fallback.mjs`
- `pnpm typecheck`

## Remaining Optimization Backlog

1. Add audio fixtures and transcript assertions for representative noisy, paused, and interrupted commands.
2. Promote the real-page policy recovery probe into the regular Playwright suite when the dev server workflow is stable in CI.
3. Add execution probes for music playback/auth state, window layout state, and multi-widget dependencies.
4. Keep catalog semantic contracts stable and use the holdout file to detect overfitting.
