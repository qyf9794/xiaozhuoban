# tv assistant module

- Goal: control TV playback and channel selection.
- Window semantics: close/remove closes the TV window.
- Supported actions: open/focus/close, play, pause, fullscreen, select channel.
- Unsupported actions: installing unknown channel lists without review.
- Concurrency: media playback can conflict with music and should be visible in status.
- Permissions: mounted capability and network video availability are required.
- Context: current channel and compact playback state only.
- Legacy migration: CCTV and channel playback shortcuts are preserved.
