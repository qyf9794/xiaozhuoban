import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const headlineResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const headlineToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "headline.request_refresh": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    requestedAt: { type: "string" }
  })
} as const;

const headlineWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开新闻", "打开头条", "唤出新闻"],
  "widget.focus": ["聚焦新闻", "切到头条", "打开新闻"],
  "widget.fullscreen_focus": ["全屏新闻", "放大头条", "专注看新闻"],
  "widget.remove": ["关闭新闻", "关掉头条", "把新闻收起来"],
  "headline.request_refresh": ["今天有什么新闻", "最新头条", "刷新新闻"]
};

function isHeadlineTool(action: AssistantAction): boolean {
  return action.spec.widgetType === HEADLINE_MODULE_TYPE || headlineWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return headlineToolArgSchemas[name as keyof typeof headlineToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

const HEADLINE_MODULE_TYPE = "headline";

export function createHeadlineTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isHeadlineTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: headlineResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["今天有什么新闻", "最新头条", "打开新闻"]
      }
    };
  });
}

export function createHeadlineActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createHeadlineTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: headlineResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `headline:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["今天有什么新闻", "最新头条", "打开新闻"]
    };
  });
}
