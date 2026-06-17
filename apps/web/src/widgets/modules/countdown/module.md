# countdown assistant module

- Goal: set and control countdown timers.
- Window semantics: close/remove closes the countdown window.
- Supported actions: open/focus/close, set, pause, resume, reset.
- Unsupported actions: ambiguous multi-instance control without a selected target.
- Concurrency: latest-wins for repeated set commands; controls are sequential.
- Permissions: none.
- Context: compact countdown state only.
- Legacy migration: countdown and timer shorthand commands are preserved.
