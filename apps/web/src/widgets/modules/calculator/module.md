# calculator assistant module

- Goal: show deterministic calculation results in the calculator widget.
- Window semantics: close/remove closes the calculator window.
- Supported actions: open/focus/close and set display.
- Unsupported actions: sending locally computable expressions to a model.
- Concurrency: latest-wins for repeated calculations.
- Permissions: none.
- Context: current display summary only.
- Legacy migration: symbolic and Chinese arithmetic shortcuts are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `12加30是多少`, `12乘以8`, `2斤是多少克`, `打开计算器`.
- Conflict record: none; locally computable arithmetic remains local-first and should not require model routing.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.localCalculationPreferred`, `stateSummary.modelForArithmeticAllowed`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: expression history, unrelated widget state, clipboard content, note text, private calculations beyond current display.
