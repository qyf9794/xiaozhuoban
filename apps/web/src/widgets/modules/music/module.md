# music assistant module

- Goal: control the music widget through local shortcuts, Realtime scoped context, and mounted capabilities.
- Window semantics: close/remove means closing the widget window; pause means pausing playback.
- Supported actions: open/focus/close, search, play, pause, resume, next, previous.
- Unsupported actions: changing Apple Music account settings or reading private listening history.
- Concurrency: latest-wins inside music; can run beside weather, headline, worldClock, clipboard, and todo when independent.
- Permissions: Apple Music authorization may be required for full playback; preview fallback is allowed when available.
- Context: only playback/login/search summary and selected widget instance are allowed; full music history is not sent.
- Legacy migration: existing shortcut routes are preserved through the legacy bridge while module schemas and policy are enforced.
