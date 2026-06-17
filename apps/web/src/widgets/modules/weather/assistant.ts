import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createWeatherDefinition, weatherAliases, weatherShortcuts, WEATHER_MODULE_TYPE } from "./definition";
import { weatherExecutionPolicy } from "./executionPolicy";
import { createWeatherContextProvider } from "./context";
import { createWeatherRealtimeProvider } from "./realtime";
import { createWeatherActionSpecs, createWeatherTools } from "./tools";

export const weatherMigrationReport: ModuleMigrationReport = {
  module: WEATHER_MODULE_TYPE,
  legacyBridge: true,
  migratedFiles: [
    "definition.ts",
    "shortcuts.ts",
    "tools.ts",
    "context.ts",
    "realtime.ts",
    "executionPolicy.ts",
    "assistant.ts",
    "test-cases.json",
    "module.md"
  ],
  preservedShortcuts: ["北京天气", "帮我查一下北京天气", "上海天气", "帝都天气", "魔都天气"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；天气数据源失败文案继续由 capability action 返回。"]
};

export const weatherShortcutConflictReport: ShortcutConflictReport = {
  id: "weather-conflict-none-2026-06-17",
  modules: [WEATHER_MODULE_TYPE],
  shortcut: "weather shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Weather query aliases remain routed to weather.set_city."
};

export function createWeatherAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === WEATHER_MODULE_TYPE);
  const tools = createWeatherTools(actions);
  return {
    type: WEATHER_MODULE_TYPE,
    definition: createWeatherDefinition(definition),
    aliases: weatherAliases,
    shortcuts: weatherShortcuts,
    tools,
    context: createWeatherContextProvider(tools),
    realtime: createWeatherRealtimeProvider(tools),
    executionPolicy: weatherExecutionPolicy,
    actionSpecs: createWeatherActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Weather aliases/tools/context/realtime/policy are owned by modules/weather."],
    testMatrix: {
      localParsing: ["北京天气", "帮我查一下北京天气", "帝都天气"],
      commandPlans: ["打开天气查北京，再打开世界时钟看东京时间", "打开音乐，同时查北京天气"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我看看明天北京天气", "查一下上海现在天气"],
      regression: weatherShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
