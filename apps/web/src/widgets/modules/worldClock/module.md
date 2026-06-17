# worldClock assistant module

- Goal: show multiple cities or time zones in the world clock widget.
- Window semantics: close/remove closes the world clock window.
- Supported actions: open/focus/close and set zones.
- Unsupported actions: unrelated location tracking.
- Concurrency: latest-wins for repeated zone replacement.
- Permissions: none.
- Context: selected zones summary only.
- Legacy migration: Chinese and English city aliases are preserved.
