# clipboard assistant module

- Goal: save text to the clipboard widget and clear clipboard state safely.
- Window semantics: close/remove closes the clipboard window.
- Supported actions: open/focus/close, add text, clear.
- Unsupported actions: exposing full clipboard history to Realtime or audit logs.
- Concurrency: clipboard clear blocks dependent clipboard writes until confirmed.
- Permissions: content is local widget data; sensitive text must not be learned.
- Context: only empty/count/pinned summary and safe action list.
- Legacy migration: old copy/save/clear shortcuts are preserved; clear remains high risk.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `复制账号 demo 到剪贴板`, `固定保存到剪贴板账号是 demo`, `清一下剪贴板`, `清空剪贴板`, `关掉复制板`.
- Conflict record: none; `clipboard.clear` remains destructive and requires preview/confirm.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.contentIncluded`, `stateSummary.pinnedSummaryOnly`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: full clipboard text, clipboard history, unrelated widget state, note text, todo text, recording content.
