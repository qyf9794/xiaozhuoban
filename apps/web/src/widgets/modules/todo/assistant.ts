import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createTodoDefinition, todoAliases, todoShortcuts, TODO_MODULE_TYPE } from "./definition";
import { todoExecutionPolicy } from "./executionPolicy";
import { createTodoContextProvider } from "./context";
import { createTodoRealtimeProvider } from "./realtime";
import { createTodoActionSpecs, createTodoTools } from "./tools";

export const todoMigrationReport: ModuleMigrationReport = {
  module: TODO_MODULE_TYPE,
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
  preservedShortcuts: ["下午三点叫我开会", "把买牛奶勾掉", "一会儿提醒我喝水", "唤出清单"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；批量完成/删除待办后续需要独立 preview gate 测试矩阵。"]
};

export const todoShortcutConflictReport: ShortcutConflictReport = {
  id: "todo-conflict-none-2026-06-17",
  modules: [TODO_MODULE_TYPE],
  shortcut: "todo shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Add and complete shortcuts preserve existing todo.add_item and todo.complete_item behavior."
};

export function createTodoAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === TODO_MODULE_TYPE);
  const tools = createTodoTools(actions);
  return {
    type: TODO_MODULE_TYPE,
    definition: createTodoDefinition(definition),
    aliases: todoAliases,
    shortcuts: todoShortcuts,
    tools,
    context: createTodoContextProvider(tools),
    realtime: createTodoRealtimeProvider(tools),
    executionPolicy: todoExecutionPolicy,
    actionSpecs: createTodoActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Todo aliases/tools/context/realtime/policy are owned by modules/todo."],
    testMatrix: {
      localParsing: ["下午三点叫我开会", "把买牛奶勾掉", "一会儿提醒我喝水"],
      commandPlans: ["清空剪贴板，然后添加一条待办：明天买牛奶"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["提醒我稍后喝水", "把今天的买牛奶任务做完"],
      regression: todoShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
