import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { HEADLINE_MODULE_TYPE, createHeadlineDefinition, headlineAliases, headlineShortcuts } from "./definition";
import { headlineExecutionPolicy } from "./executionPolicy";
import { createHeadlineContextProvider } from "./context";
import { createHeadlineRealtimeProvider } from "./realtime";
import { createHeadlineActionSpecs, createHeadlineTools } from "./tools";

export const headlineMigrationReport: ModuleMigrationReport = {
  module: HEADLINE_MODULE_TYPE,
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
  preservedShortcuts: ["今天有什么新闻", "最新头条", "暂停音乐，同时打开新闻"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；网络数据失败文案继续由 widget action 返回。"]
};

export const headlineShortcutConflictReport: ShortcutConflictReport = {
  id: "headline-conflict-none-2026-06-17",
  modules: [HEADLINE_MODULE_TYPE],
  shortcut: "headline shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. CCTV/电视 playback phrases remain excluded from headline routing."
};

export function createHeadlineAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === HEADLINE_MODULE_TYPE);
  const tools = createHeadlineTools(actions);
  return {
    type: HEADLINE_MODULE_TYPE,
    definition: createHeadlineDefinition(definition),
    aliases: headlineAliases,
    shortcuts: headlineShortcuts,
    tools,
    context: createHeadlineContextProvider(tools),
    realtime: createHeadlineRealtimeProvider(tools),
    executionPolicy: headlineExecutionPolicy,
    actionSpecs: createHeadlineActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Headline aliases/tools/context/realtime/policy are owned by modules/headline."],
    testMatrix: {
      localParsing: ["今天有什么新闻", "最新头条", "暂停音乐，同时打开新闻"],
      commandPlans: ["暂停音乐，同时打开新闻"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我看看现在有什么新鲜事", "刷新一下头条"],
      regression: headlineShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
