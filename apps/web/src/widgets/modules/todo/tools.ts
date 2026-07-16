import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const todoResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const todoToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "todo.add_item": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    text: { type: "string", required: true },
    dueAt: { type: "string" }
  }),
  "todo.complete_item": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    text: { type: "string", required: true }
  }),
  "todo.clear_completed": widgetIdArgsSchema
} as const;

const todoWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开待办", "唤出清单", "打开任务清单"],
  "widget.focus": ["聚焦待办", "切到清单", "打开待办"],
  "widget.fullscreen_focus": ["全屏待办", "放大清单", "专注看任务"],
  "widget.remove": ["关闭待办", "关掉清单", "把待办收起来"],
  "todo.add_item": ["下午三点叫我开会", "一会儿提醒我喝水", "添加待办明天买牛奶"],
  "todo.complete_item": ["把买牛奶勾掉", "把任务做完", "标记买牛奶完成"],
  "todo.clear_completed": ["清理已完成待办", "清空做完的任务", "删除已完成事项前先确认"]
};

const descriptionByTool: Record<string, string> = {
  "todo.add_item": "Add a todo or reminder. If the user gives a time such as 明天上午九点、今晚八点、三十分钟后、7月20日上午8点, put the task text in text and the parsed ISO time in dueAt.",
  "todo.complete_item": "Complete an existing todo. Put only the todo title or matching keywords in text; remove words like 完成、标记完成、这个待办、这个任务."
};

function isTodoTool(action: AssistantAction): boolean {
  return action.spec.widgetType === "todo" || todoWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return todoToolArgSchemas[name as keyof typeof todoToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createTodoTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isTodoTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        description: descriptionByTool[action.spec.name] ?? action.spec.description,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: todoResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["下午三点叫我开会", "把买牛奶勾掉", "打开待办"]
      }
    };
  });
}

export function createTodoActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createTodoTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: descriptionByTool[action.spec.name] ?? action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: todoResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `todo:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["下午三点叫我开会", "把买牛奶勾掉", "打开待办"]
    };
  });
}
