import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createMarketScopedContext } from "./context";
import { MARKET_MODULE_TYPE, marketAliases, marketCapabilities, marketShortcutExamples } from "./definition";

export function createMarketRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: MARKET_MODULE_TYPE,
      displayName: "行情",
      aliases: marketAliases,
      capabilities: marketCapabilities,
      shortcutExamples: marketShortcutExamples.slice(0, 5),
      riskSummary: ["只查询指数展示，不提供投资建议", "不提供交易或下单能力"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createMarketScopedContext(tools, request)
  };
}
