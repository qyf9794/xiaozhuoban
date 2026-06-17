import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { clipboardAliases, clipboardShortcuts, CLIPBOARD_MODULE_TYPE, createClipboardDefinition } from "./definition";
import { clipboardExecutionPolicy } from "./executionPolicy";
import { createClipboardContextProvider } from "./context";
import { createClipboardRealtimeProvider } from "./realtime";
import { createClipboardActionSpecs, createClipboardTools } from "./tools";

export const clipboardMigrationReport: ModuleMigrationReport = {
  module: CLIPBOARD_MODULE_TYPE,
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
  preservedShortcuts: ["复制账号 demo 到剪贴板", "固定保存到剪贴板账号是 demo", "清一下剪贴板", "清空剪贴板", "关掉复制板"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；学习候选的敏感内容过滤在后续学习闭环继续补强。"]
};

export const clipboardShortcutConflictReport: ShortcutConflictReport = {
  id: "clipboard-conflict-none-2026-06-17",
  modules: [CLIPBOARD_MODULE_TYPE],
  shortcut: "clipboard shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Clearing clipboard remains destructive and requires preview/confirm."
};

export function createClipboardAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === CLIPBOARD_MODULE_TYPE);
  const tools = createClipboardTools(actions);
  return {
    type: CLIPBOARD_MODULE_TYPE,
    definition: createClipboardDefinition(definition),
    aliases: clipboardAliases,
    shortcuts: clipboardShortcuts,
    tools,
    context: createClipboardContextProvider(tools),
    realtime: createClipboardRealtimeProvider(tools),
    executionPolicy: clipboardExecutionPolicy,
    actionSpecs: createClipboardActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Clipboard aliases/tools/context/realtime/policy are owned by modules/clipboard."],
    testMatrix: {
      localParsing: ["复制账号 demo 到剪贴板", "清一下剪贴板", "关掉复制板"],
      commandPlans: ["清空剪贴板，然后添加一条待办：明天买牛奶"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["把这段内容保存到复制板", "清理一下复制板"],
      regression: clipboardShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
