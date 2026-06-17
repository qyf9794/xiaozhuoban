# weather assistant module

- Goal: query and switch city weather in the weather widget.
- Window semantics: close/remove closes the weather window.
- Supported actions: open/focus/close and set city.
- Unsupported actions: sending unrelated desktop state or full location history to models.
- Concurrency: latest-wins for repeated city queries; safe with music, worldClock, market, headline, and todo.
- Permissions: network data may be unavailable; the module should return visible failure.
- Context: current city and compact instance summary only.
- Legacy migration: existing city aliases and shortcuts are preserved.
