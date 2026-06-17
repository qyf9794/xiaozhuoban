# market assistant module

- Goal: show market index groups in the market widget.
- Window semantics: close/remove closes the market window.
- Supported actions: open/focus/close and set indices.
- Unsupported actions: personalized financial advice or trading execution.
- Concurrency: latest-wins for repeated market queries.
- Permissions: network data may be unavailable.
- Context: selected index group summary only.
- Legacy migration: broad market shortcuts such as US, A-share, and Hang Seng aliases are preserved.
