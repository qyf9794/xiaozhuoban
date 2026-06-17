import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const weatherResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const weatherToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "weather.set_city": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    city: { type: "string" },
    cityCode: { type: "string" }
  })
} as const;

const weatherWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开天气", "调出天气", "看天气"],
  "widget.focus": ["聚焦天气", "切到天气", "打开天气"],
  "widget.fullscreen_focus": ["全屏天气", "放大天气", "专注看天气"],
  "widget.remove": ["关闭天气", "天气关掉", "把天气收起来"],
  "weather.set_city": ["北京天气", "帮我查一下北京天气", "上海天气"]
};

function isWeatherTool(action: AssistantAction): boolean {
  return action.spec.widgetType === "weather" || weatherWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return weatherToolArgSchemas[name as keyof typeof weatherToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createWeatherTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isWeatherTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: weatherResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["北京天气", "上海天气", "打开天气"]
      }
    };
  });
}

export function createWeatherActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createWeatherTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: weatherResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `weather:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["北京天气", "上海天气", "打开天气"]
    };
  });
}
