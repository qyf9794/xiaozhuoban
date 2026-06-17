# countdown assistant module

- Goal: set and control countdown timers.
- Window semantics: close/remove closes the countdown window.
- Supported actions: open/focus/close, set, pause, resume, reset.
- Unsupported actions: ambiguous multi-instance control without a selected target.
- Concurrency: latest-wins for repeated set commands; controls are sequential.
- Permissions: none.
- Context: compact countdown state only.
- Legacy migration: countdown and timer shorthand commands are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `定时十分钟`, `暂停计时`, `继续定时器`, `重置定时`, `取消倒计时`.
- Conflict record: none; pause/resume/reset remain countdown controls, while close/remove remains `widget.remove`.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.compactTimerStateOnly`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: unrelated widget state, private reminder notes, clipboard content, note text, recording content.
