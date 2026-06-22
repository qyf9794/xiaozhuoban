# Realtime Voice Command E2E Execution Plan

## Objective

Build and run an unattended real-page gate for the 700 voice-command catalog. The gate must simulate a user speech transcript entering the visible assistant UI, execute through the product harness, collect backend/runtime evidence, capture before/after screenshots, and report whether the final rendered state satisfies the command contract.

## Why This Gate Exists

The existing 700-command semantic checks prove that routing can pick plausible tools. They do not prove that a spoken command executes correctly. Bugs such as `倒计时30分钟` can pass semantic checks while the product repeatedly opens a countdown widget without setting the timer.

This gate treats the product result as the source of truth:

- Realtime request/response or local shortcut recovery is captured.
- Harness audit logs must show executable tool calls.
- Target-required tools must have a concrete `widgetId` by execution time.
- DOM state must reflect the command.
- Before/after screenshots must be saved for failed cases and sampled passing cases.

## Batches

1. **Batch A: Infrastructure smoke**
   - Run `--limit=10`.
   - Prove reset, command submission, diagnostics export, screenshots, and report writing.

2. **Batch B: Known failure families**
   - Run explicit ids for countdown, close-window, window movement, focus, resize, and multi-widget operations.
   - Must include extra regressions such as `倒计时30分钟`.

3. **Batch C: Module sweeps**
   - Run catalog groups by module family: app shell, board/window lifecycle, countdown/time, note/todo, media, info tools, destructive/confirmation flows.
   - Fix failures by shared policy, harness recovery, target resolution, or widget execution code.

4. **Batch D: Full 700**
   - Run `--limit=700`.
   - Produce `docs/realtime-voice-command-e2e-report.md` and `output/playwright/realtime-voice-e2e/<run-id>/`.

5. **Batch E: Repeatability**
   - Rerun all previous failures.
   - Rerun full 700 once more when feasible.
   - Completion requires no unexplained failures.

## Evidence Per Case

Each case writes:

- `before.png`
- `after.png`
- `trace.json`

The trace includes:

- case id and command text
- expected tools from the 700 catalog simulation report
- Realtime tool-call HTTP payloads when used
- local assistant diagnostics
- local audit logs
- before/after DOM widget snapshots
- assertion results and failure category

## Failure Categories

- `selection_failed`: Realtime selected no usable command.
- `tool_missing`: selected tool is not exposed or registered.
- `widget_id_missing`: target-required execution did not receive a concrete `widgetId`.
- `invalid_args`: tool arguments were missing or invalid.
- `execution_failed`: the Harness/action result was not successful.
- `state_mismatch`: store/audit says success but DOM state is wrong.
- `dom_mismatch`: widget exists but visible rendering does not match.
- `repeated_widget`: repeated or set-style command created duplicate widgets.
- `confirmation_unresolved`: confirmation was required but not completed.
- `runtime_error`: console, network, or assistant operation reported a hard error.

## Completion Criteria

- `scripts/playwright-voice-command-e2e-gate.js --limit=700` completes with zero unexplained failures.
- The generated report links to screenshot evidence.
- Target-required failures are zero: all executing widget tools carry concrete widget ids.
- Known regressions, including `倒计时30分钟`, pass with screenshots.
- Existing deterministic gates still pass.

## Commands

```bash
node scripts/playwright-voice-command-e2e-gate.js --limit=10
node scripts/playwright-voice-command-e2e-gate.js --ids=028,033,034,349,R-countdown-30
node scripts/playwright-voice-command-e2e-gate.js --limit=700
```
