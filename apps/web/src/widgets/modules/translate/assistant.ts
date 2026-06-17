import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { TRANSLATE_MODULE_TYPE, createTranslateDefinition, translateAliases, translateShortcuts } from "./definition";
import { translateExecutionPolicy } from "./executionPolicy";
import { createTranslateContextProvider } from "./context";
import { createTranslateRealtimeProvider } from "./realtime";
import { createTranslateActionSpecs, createTranslateTools } from "./tools";

export const translateMigrationReport: ModuleMigrationReport = {
  module: TRANSLATE_MODULE_TYPE,
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
  preservedShortcuts: ["翻译一下 hello", "hello 是什么意思", "打开翻译"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；长文本翻译的 explicit opt-in UI 后续补强。"]
};

export const translateShortcutConflictReport: ShortcutConflictReport = {
  id: "translate-conflict-none-2026-06-17",
  modules: [TRANSLATE_MODULE_TYPE],
  shortcut: "translate shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Long private text is not included in scoped context by default."
};

export function createTranslateAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === TRANSLATE_MODULE_TYPE);
  const tools = createTranslateTools(actions);
  return {
    type: TRANSLATE_MODULE_TYPE,
    definition: createTranslateDefinition(definition),
    aliases: translateAliases,
    shortcuts: translateShortcuts,
    tools,
    context: createTranslateContextProvider(tools),
    realtime: createTranslateRealtimeProvider(tools),
    executionPolicy: translateExecutionPolicy,
    actionSpecs: createTranslateActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Translate aliases/tools/context/realtime/policy are owned by modules/translate."],
    testMatrix: {
      localParsing: ["翻译一下 hello", "hello 是什么意思"],
      commandPlans: ["翻译一下 hello，同时打开新闻"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["把 hello 翻译成中文", "这个英文是什么意思"],
      regression: translateShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
