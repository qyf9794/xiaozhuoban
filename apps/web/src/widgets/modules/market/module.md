# market assistant module

- Goal: show market index groups in the market widget.
- Window semantics: close/remove closes the market window.
- Supported actions: open/focus/close and set indices.
- Unsupported actions: personalized financial advice or trading execution.
- Concurrency: latest-wins for repeated market queries.
- Permissions: network data may be unavailable.
- Context: selected index group summary only.
- Legacy migration: broad market shortcuts such as US, A-share, and Hang Seng aliases are preserved.

## Migration checklist

- Files: `definition.ts`, `shortcuts.ts`, `tools.ts`, `context.ts`, `realtime.ts`, `executionPolicy.ts`, `assistant.ts`, `test-cases.json`.
- Preserved shortcuts: `美股怎么样`, `A股行情`, `看恒生指数`, `打开行情`.
- Conflict record: none; market only displays index groups and does not expose advice or trading tools.
- Scoped context whitelist: `moduleType`, `tools`, `toolSchemas`, `instances`, `stateSummary.instanceCount`, `stateSummary.focusedWidgetId`, `stateSummary.selectedToolHint`, `stateSummary.indexGroupSummaryOnly`, `stateSummary.investmentAdviceAllowed`, `stateSummary.tradingAllowed`, `shortcutExamples`, `executionPolicy`, `riskPolicy`.
- Explicitly excluded: personalized investment advice, order/trade actions, portfolio holdings, unrelated widget state, clipboard content, note text.
