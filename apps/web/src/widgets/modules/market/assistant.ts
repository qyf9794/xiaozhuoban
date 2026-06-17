import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { MARKET_MODULE_TYPE, createMarketDefinition, marketAliases, marketShortcuts } from "./definition";
import { marketExecutionPolicy } from "./executionPolicy";
import { createMarketContextProvider } from "./context";
import { createMarketRealtimeProvider } from "./realtime";
import { createMarketActionSpecs, createMarketTools } from "./tools";

export const marketMigrationReport: ModuleMigrationReport = {
  module: MARKET_MODULE_TYPE,
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
  preservedShortcuts: ["美股怎么样", "A股行情", "看恒生指数", "打开行情"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；行情数据源失败文案继续由 widget action 返回。"]
};

export const marketShortcutConflictReport: ShortcutConflictReport = {
  id: "market-conflict-none-2026-06-17",
  modules: [MARKET_MODULE_TYPE],
  shortcut: "market shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Market module only displays index groups and does not provide advice or trading tools."
};

export function createMarketAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === MARKET_MODULE_TYPE);
  const tools = createMarketTools(actions);
  return {
    type: MARKET_MODULE_TYPE,
    definition: createMarketDefinition(definition),
    aliases: marketAliases,
    shortcuts: marketShortcuts,
    tools,
    context: createMarketContextProvider(tools),
    realtime: createMarketRealtimeProvider(tools),
    executionPolicy: marketExecutionPolicy,
    actionSpecs: createMarketActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Market aliases/tools/context/realtime/policy are owned by modules/market."],
    testMatrix: {
      localParsing: ["美股怎么样", "A股行情", "看恒生指数"],
      commandPlans: ["打开行情，同时查北京天气"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我看下美股指数", "港股今天怎么样"],
      regression: marketShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
