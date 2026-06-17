# weather assistant module

- Goal: query and switch city weather in the weather widget.
- Window semantics: close/remove closes the weather window.
- Supported actions: open/focus/close and set city.
- Unsupported actions: sending unrelated desktop state or full location history to models.
- Concurrency: latest-wins for repeated city queries; safe with music, worldClock, market, headline, and todo.
- Permissions: network data may be unavailable; the module should return visible failure.
- Context: current city and compact instance summary only.
- Legacy migration: existing city aliases and shortcuts are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `北京天气`, `帮我查一下北京天气`, `上海天气`, `帝都天气`, `魔都天气`.
- Conflict record: none; weather query aliases still resolve to `weather.set_city`.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.locationHistoryIncluded`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: full location history, unrelated widget state, clipboard content, todo text, note text.
