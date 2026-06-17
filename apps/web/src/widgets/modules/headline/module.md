# headline assistant module

- Goal: open and refresh headlines.
- Window semantics: close/remove closes the headline window.
- Supported actions: open/focus/close and refresh.
- Unsupported actions: confusing TV channel playback with headline refresh.
- Concurrency: safe to refresh beside weather and market.
- Permissions: network data may be unavailable.
- Context: refresh metadata only; no full article payload in model context.
- Legacy migration: headline/news shortcuts are preserved with CCTV phrases guarded for TV.
