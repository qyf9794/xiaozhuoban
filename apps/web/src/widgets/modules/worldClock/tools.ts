import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const worldClockResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const worldClockToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "worldClock.set_zones": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    zones: { type: "array", required: true }
  })
} as const;

const worldClockWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开世界时钟", "打开世界时间", "唤出时区"],
  "widget.focus": ["聚焦世界时钟", "切到世界时间", "打开世界时钟"],
  "widget.fullscreen_focus": ["全屏世界时钟", "放大世界时钟", "专注看世界时间"],
  "widget.remove": ["关闭世界时钟", "关掉世界时间", "把世界时钟收起来"],
  "worldClock.set_zones": ["NYC and Tokyo time", "看东京巴黎悉尼时间", "看东京时间"]
};

function isWorldClockTool(action: AssistantAction): boolean {
  return action.spec.widgetType === WORLD_CLOCK_MODULE_TYPE || worldClockWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return worldClockToolArgSchemas[name as keyof typeof worldClockToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

const WORLD_CLOCK_MODULE_TYPE = "worldClock";

export function createWorldClockTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isWorldClockTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: worldClockResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["NYC and Tokyo time", "看东京时间", "打开世界时钟"]
      }
    };
  });
}

export function createWorldClockActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createWorldClockTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: worldClockResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `worldClock:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["NYC and Tokyo time", "看东京时间", "打开世界时钟"]
    };
  });
}
