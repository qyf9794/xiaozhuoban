# todo assistant module

- Goal: add and complete todo items with optional due time.
- Window semantics: close/remove closes the todo window.
- Supported actions: open/focus/close, add item, complete item.
- Unsupported actions: bulk delete without preview and confirmation.
- Concurrency: todo mutations are sequential within the module; independent tools can run in parallel.
- Permissions: no external service is required.
- Context: item count and short target summaries only; no full todo dump by default.
- Legacy migration: reminder, call-me, and completion shortcuts are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `下午三点叫我开会`, `把买牛奶勾掉`, `一会儿提醒我喝水`, `唤出清单`.
- Conflict record: none; add and complete shortcuts still resolve to `todo.add_item` and `todo.complete_item`.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.fullTodoListIncluded`, `stateSummary.shortTargetSummariesOnly`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: full todo list, unrelated widget state, clipboard text, note text, recording content.
