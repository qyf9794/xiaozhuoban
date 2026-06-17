# recorder assistant module

- Goal: control recorder widget capabilities.
- Window semantics: close/remove closes the recorder window; closing while recording should be reviewed by policy.
- Supported actions: open/focus/close, start, stop, play, pause.
- Unsupported actions: sending recording content to models.
- Concurrency: recorder actions are sequential and may conflict with Realtime microphone use.
- Permissions: microphone permission is required.
- Context: recording state and permission summary only.
- Legacy migration: record/recording wording shortcuts are preserved.
