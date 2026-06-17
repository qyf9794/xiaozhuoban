# translate assistant module

- Goal: prepare translation drafts in the translate widget.
- Window semantics: close/remove closes the translate window.
- Supported actions: open/focus/close and set draft text/language.
- Unsupported actions: sending long private text to Realtime by default.
- Concurrency: latest-wins for repeated drafts.
- Permissions: no additional browser permission is required.
- Context: selected draft metadata only; long source text is omitted from model context unless explicitly needed.
- Legacy migration: old translate shorthand remains available.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `翻译一下 hello`, `hello 是什么意思`, `打开翻译`.
- Conflict record: none; long private text is not included in scoped context by default.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.longSourceTextIncluded`, `stateSummary.draftMetadataOnly`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: long source text, private document bodies, unrelated widget state, clipboard content, note text.
