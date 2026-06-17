# worldClock assistant module

- Goal: show multiple cities or time zones in the world clock widget.
- Window semantics: close/remove closes the world clock window.
- Supported actions: open/focus/close and set zones.
- Unsupported actions: unrelated location tracking.
- Concurrency: latest-wins for repeated zone replacement.
- Permissions: none.
- Context: selected zones summary only.
- Legacy migration: Chinese and English city aliases are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `NYC and Tokyo time`, `看东京巴黎悉尼时间`, `看东京时间`, `打开世界时钟`.
- Conflict record: none; time and zone requests still resolve to `worldClock.set_zones`.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.locationTrackingIncluded`, `stateSummary.selectedZonesOnly`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: location tracking, unrelated widget state, clipboard content, note text, recording content.
