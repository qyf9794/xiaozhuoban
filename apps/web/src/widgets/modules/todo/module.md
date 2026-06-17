# todo assistant module

- Goal: add and complete todo items with optional due time.
- Window semantics: close/remove closes the todo window.
- Supported actions: open/focus/close, add item, complete item.
- Unsupported actions: bulk delete without preview and confirmation.
- Concurrency: todo mutations are sequential within the module; independent tools can run in parallel.
- Permissions: no external service is required.
- Context: item count and short target summaries only; no full todo dump by default.
- Legacy migration: reminder, call-me, and completion shortcuts are preserved.
