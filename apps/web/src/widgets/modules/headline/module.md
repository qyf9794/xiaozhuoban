# headline assistant module

- Goal: open and refresh headlines.
- Window semantics: close/remove closes the headline window.
- Supported actions: open/focus/close and refresh.
- Unsupported actions: confusing TV channel playback with headline refresh.
- Concurrency: safe to refresh beside weather and market.
- Permissions: network data may be unavailable.
- Context: refresh metadata only; no full article payload in model context.
- Legacy migration: headline/news shortcuts are preserved with CCTV phrases guarded for TV.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `今天有什么新闻`, `最新头条`, `暂停音乐，同时打开新闻`.
- Conflict record: none; CCTV/电视 playback phrases remain excluded from headline routing.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.fullArticlePayloadIncluded`, `stateSummary.tvChannelIntentExcluded`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: full article payload, reading history, unrelated widget state, clipboard content, note text, recording content.
