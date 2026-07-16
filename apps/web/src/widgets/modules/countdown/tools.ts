import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const countdownResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const countdownToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "countdown.set": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    hours: { type: "number" },
    minutes: { type: "number" },
    seconds: { type: "number" },
    totalSeconds: { type: "number" },
    durationMs: { type: "number" },
    durationSeconds: { type: "number" },
    durationInMinutes: { type: "number" },
    durationMinutes: { type: "number" },
    durationText: { type: "string" },
    time: { type: "string" },
    label: { type: "string" },
    start: { type: "boolean" },
    autoStart: { type: "boolean" }
  }),
  "countdown.pause": widgetIdArgsSchema,
  "countdown.resume": widgetIdArgsSchema,
  "countdown.reset": widgetIdArgsSchema
} as const;

const countdownWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开倒计时", "打开定时器", "唤出计时器"],
  "widget.focus": ["聚焦倒计时", "切到定时器", "打开计时器"],
  "widget.fullscreen_focus": ["全屏倒计时", "放大计时器", "专注看倒计时"],
  "widget.remove": ["关闭倒计时", "取消倒计时", "把定时器收起来"],
  "countdown.set": ["定时十分钟", "倒计时 30 秒", "帮我把倒计时设为 10 分钟"],
  "countdown.pause": ["暂停计时", "暂停倒计时", "先别计时"],
  "countdown.resume": ["继续定时器", "继续倒计时", "恢复计时"],
  "countdown.reset": ["重置定时", "重置倒计时", "重新开始计时"]
};

const descriptionByTool: Record<string, string> = {
  "countdown.set": "Set a pure countdown/timer such as 倒计时十分钟 or 定时30秒. Do not use for reminders with a task like 三十分钟后提醒我喝水; those are todo.add_item with dueAt.",
  "countdown.pause": "Pause the current countdown timer.",
  "countdown.resume": "Resume the current countdown timer.",
  "countdown.reset": "Reset the current countdown timer."
};

function isCountdownTool(action: AssistantAction): boolean {
  return action.spec.widgetType === COUNTDOWN_MODULE_TYPE || countdownWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return countdownToolArgSchemas[name as keyof typeof countdownToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

const COUNTDOWN_MODULE_TYPE = "countdown";

export function createCountdownTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isCountdownTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        description: descriptionByTool[action.spec.name] ?? action.spec.description,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: countdownResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["定时十分钟", "暂停计时", "打开倒计时"]
      }
    };
  });
}

export function createCountdownActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createCountdownTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: descriptionByTool[action.spec.name] ?? action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: countdownResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `countdown:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["定时十分钟", "暂停计时", "打开倒计时"]
    };
  });
}
