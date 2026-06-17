# clipboard assistant module

- Goal: save text to the clipboard widget and clear clipboard state safely.
- Window semantics: close/remove closes the clipboard window.
- Supported actions: open/focus/close, add text, clear.
- Unsupported actions: exposing full clipboard history to Realtime or audit logs.
- Concurrency: clipboard clear blocks dependent clipboard writes until confirmed.
- Permissions: content is local widget data; sensitive text must not be learned.
- Context: only empty/count/pinned summary and safe action list.
- Legacy migration: old copy/save/clear shortcuts are preserved; clear remains high risk.
