# calculator assistant module

- Goal: show deterministic calculation results in the calculator widget.
- Window semantics: close/remove closes the calculator window.
- Supported actions: open/focus/close and set display.
- Unsupported actions: sending locally computable expressions to a model.
- Concurrency: latest-wins for repeated calculations.
- Permissions: none.
- Context: current display summary only.
- Legacy migration: symbolic and Chinese arithmetic shortcuts are preserved.
