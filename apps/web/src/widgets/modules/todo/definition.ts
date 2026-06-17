import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const TODO_MODULE_TYPE = "todo";

export const todoAliases = ["待办", "任务", "清单"];

export const todoCapabilities = ["添加待办", "完成待办", "提醒", "关闭窗口"];

export const todoShortcutExamples = ["下午三点叫我开会", "把买牛奶勾掉", "一会儿提醒我喝水", "唤出清单"];

export const todoShortcuts: ShortcutRule[] = [
  {
    id: "todo.add",
    intent: "todo_add",
    actions: ["添加", "提醒"],
    examples: ["下午三点叫我开会", "一会儿提醒我喝水"],
    risk: "safe"
  },
  {
    id: "todo.complete",
    intent: "todo_complete",
    actions: ["完成", "勾掉"],
    examples: ["把买牛奶勾掉", "把任务做完"],
    risk: "safe"
  }
];

export function createTodoDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? TODO_MODULE_TYPE,
    type: TODO_MODULE_TYPE,
    name: definition?.name ?? "待办",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
