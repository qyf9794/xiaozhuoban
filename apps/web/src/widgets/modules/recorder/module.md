# recorder assistant module

- Goal: control recorder widget capabilities.
- Window semantics: close/remove closes the recorder window; closing while recording should be reviewed by policy.
- Supported actions: open/focus/close, start, stop, play, pause.
- Unsupported actions: sending recording content to models.
- Concurrency: recorder actions are sequential and may conflict with Realtime microphone use.
- Permissions: microphone permission is required.
- Context: recording state and permission summary only.
- Legacy migration: record/recording wording shortcuts are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `开始录制`, `播放录制`, `暂停录制`, `停止录音`, `打开录音机`.
- Conflict record: none; recorder content is excluded from scoped context and microphone permission remains explicit.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.recordingContentIncluded`, `stateSummary.permissionSummaryOnly`, `stateSummary.realtimeMicrophoneConflict`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: audio blobs, transcripts, recording content, unrelated widget state, clipboard content, note text.
