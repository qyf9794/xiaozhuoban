import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createWorldClockScopedContext } from "./context";
import { WORLD_CLOCK_MODULE_TYPE, worldClockAliases, worldClockCapabilities, worldClockShortcutExamples } from "./definition";

export function createWorldClockRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: WORLD_CLOCK_MODULE_TYPE,
      displayName: "世界时钟",
      aliases: worldClockAliases,
      capabilities: worldClockCapabilities,
      shortcutExamples: worldClockShortcutExamples.slice(0, 5),
      riskSummary: ["只发送 selected zones 摘要", "不发送位置追踪或无关城市历史"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createWorldClockScopedContext(tools, request)
  };
}
