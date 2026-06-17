# translate assistant module

- Goal: prepare translation drafts in the translate widget.
- Window semantics: close/remove closes the translate window.
- Supported actions: open/focus/close and set draft text/language.
- Unsupported actions: sending long private text to Realtime by default.
- Concurrency: latest-wins for repeated drafts.
- Permissions: no additional browser permission is required.
- Context: selected draft metadata only; long source text is omitted from model context unless explicitly needed.
- Legacy migration: old translate shorthand remains available.
