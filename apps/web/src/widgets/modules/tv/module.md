# tv assistant module

- Goal: control TV playback and channel selection.
- Window semantics: close/remove closes the TV window.
- Supported actions: open/focus/close, play, pause, fullscreen, select channel.
- Unsupported actions: installing unknown channel lists without review.
- Concurrency: media playback can conflict with music and should be visible in status.
- Permissions: mounted capability and network video availability are required.
- Context: current channel and compact playback state only.
- Legacy migration: CCTV and channel playback shortcuts are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `看央视新闻`, `暂停 CCTV1`, `央视五套全屏播放`, `播放 CCTV1`, `打开电视`.
- Conflict record: none; CCTV/电视 playback phrases remain TV-owned and separate from headline/news refresh.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.playlistIncluded`, `stateSummary.currentChannelSummaryOnly`, `stateSummary.conflictsWithMusicPlayback`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: full playlist data, unknown channel lists, unrelated widget state, clipboard content, note text.
