import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { TV_MODULE_TYPE, createTvDefinition, tvAliases, tvShortcuts } from "./definition";
import { tvExecutionPolicy } from "./executionPolicy";
import { createTvContextProvider } from "./context";
import { createTvRealtimeProvider } from "./realtime";
import { createTvActionSpecs, createTvTools } from "./tools";

export const tvMigrationReport: ModuleMigrationReport = {
  module: TV_MODULE_TYPE,
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
  preservedShortcuts: ["看央视新闻", "暂停 CCTV1", "央视五套全屏播放", "播放 CCTV1", "打开电视"],
  pendingItems: ["底层执行仍复用 WidgetCapabilityBridge；未知频道列表安装仍需后续 preview/confirm 流程。"]
};

export const tvShortcutConflictReport: ShortcutConflictReport = {
  id: "tv-conflict-none-2026-06-17",
  modules: [TV_MODULE_TYPE],
  shortcut: "tv shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. CCTV/电视 playback phrases remain TV-owned and separate from headline/news refresh."
};

export function createTvAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === TV_MODULE_TYPE);
  const tools = createTvTools(actions);
  return {
    type: TV_MODULE_TYPE,
    definition: createTvDefinition(definition),
    aliases: tvAliases,
    shortcuts: tvShortcuts,
    tools,
    context: createTvContextProvider(tools),
    realtime: createTvRealtimeProvider(tools),
    executionPolicy: tvExecutionPolicy,
    actionSpecs: createTvActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["TV aliases/tools/context/realtime/policy are owned by modules/tv."],
    testMatrix: {
      localParsing: ["看央视新闻", "播放 CCTV1", "暂停 CCTV1", "央视五套全屏播放"],
      commandPlans: ["打开电视同时播放 CCTV1", "播放 CCTV1 然后暂停电视"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我看央视新闻", "把电视切到 CCTV13"],
      regression: tvShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
