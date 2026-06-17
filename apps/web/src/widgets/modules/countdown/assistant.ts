import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { COUNTDOWN_MODULE_TYPE, countdownAliases, countdownShortcuts, createCountdownDefinition } from "./definition";
import { countdownExecutionPolicy } from "./executionPolicy";
import { createCountdownContextProvider } from "./context";
import { createCountdownRealtimeProvider } from "./realtime";
import { createCountdownActionSpecs, createCountdownTools } from "./tools";

export const countdownMigrationReport: ModuleMigrationReport = {
  module: COUNTDOWN_MODULE_TYPE,
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
  preservedShortcuts: ["定时十分钟", "暂停计时", "继续定时器", "重置定时", "取消倒计时"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；多实例 ambiguous control 后续需要独立 target disambiguation UI。"]
};

export const countdownShortcutConflictReport: ShortcutConflictReport = {
  id: "countdown-conflict-none-2026-06-17",
  modules: [COUNTDOWN_MODULE_TYPE],
  shortcut: "countdown shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Pause/resume/reset remain countdown controls; close/remove remains widget.remove."
};

export function createCountdownAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === COUNTDOWN_MODULE_TYPE);
  const tools = createCountdownTools(actions);
  return {
    type: COUNTDOWN_MODULE_TYPE,
    definition: createCountdownDefinition(definition),
    aliases: countdownAliases,
    shortcuts: countdownShortcuts,
    tools,
    context: createCountdownContextProvider(tools),
    realtime: createCountdownRealtimeProvider(tools),
    executionPolicy: countdownExecutionPolicy,
    actionSpecs: createCountdownActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Countdown aliases/tools/context/realtime/policy are owned by modules/countdown."],
    testMatrix: {
      localParsing: ["定时十分钟", "暂停计时", "继续定时器", "重置定时"],
      commandPlans: ["帮我放点轻松的音乐，然后把倒计时设为 10 分钟"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我计时十分钟", "一会儿暂停倒计时"],
      regression: countdownShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
