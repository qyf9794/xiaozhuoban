import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createWeatherScopedContext } from "./context";
import { weatherAliases, weatherCapabilities, weatherShortcutExamples, WEATHER_MODULE_TYPE } from "./definition";

export function createWeatherRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: WEATHER_MODULE_TYPE,
      displayName: "天气",
      aliases: weatherAliases,
      capabilities: weatherCapabilities,
      shortcutExamples: weatherShortcutExamples.slice(0, 5),
      riskSummary: ["查询天气不需要完整位置历史", "只在 selected weather scoped context 中暴露天气实例摘要"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createWeatherScopedContext(tools, request)
  };
}
