import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { WORLD_CLOCK_MODULE_TYPE, createWorldClockDefinition, worldClockAliases, worldClockShortcuts } from "./definition";
import { worldClockExecutionPolicy } from "./executionPolicy";
import { createWorldClockContextProvider } from "./context";
import { createWorldClockRealtimeProvider } from "./realtime";
import { createWorldClockActionSpecs, createWorldClockTools } from "./tools";

export const worldClockMigrationReport: ModuleMigrationReport = {
  module: WORLD_CLOCK_MODULE_TYPE,
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
  preservedShortcuts: ["NYC and Tokyo time", "看东京巴黎悉尼时间", "看东京时间", "打开世界时钟"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；时区别名扩展仍由 shortcut router/capability action 维护。"]
};

export const worldClockShortcutConflictReport: ShortcutConflictReport = {
  id: "world-clock-conflict-none-2026-06-17",
  modules: [WORLD_CLOCK_MODULE_TYPE],
  shortcut: "world clock shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Time/zone requests remain worldClock.set_zones."
};

export function createWorldClockAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === WORLD_CLOCK_MODULE_TYPE);
  const tools = createWorldClockTools(actions);
  return {
    type: WORLD_CLOCK_MODULE_TYPE,
    definition: createWorldClockDefinition(definition),
    aliases: worldClockAliases,
    shortcuts: worldClockShortcuts,
    tools,
    context: createWorldClockContextProvider(tools),
    realtime: createWorldClockRealtimeProvider(tools),
    executionPolicy: worldClockExecutionPolicy,
    actionSpecs: createWorldClockActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["WorldClock aliases/tools/context/realtime/policy are owned by modules/worldClock."],
    testMatrix: {
      localParsing: ["NYC and Tokyo time", "看东京巴黎悉尼时间", "看东京时间"],
      commandPlans: ["打开天气查北京，再打开世界时钟看东京时间"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我看一下纽约和东京现在几点", "查巴黎悉尼时间"],
      regression: worldClockShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
