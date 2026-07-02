import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";
import { MARKET_MODULE_TYPE } from "./definition";

const marketResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const marketToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "market.set_indices": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    indexCode: { type: "string" },
    indexCodes: { type: "array" },
    symbol: { type: "string" },
    symbols: { type: "array" },
    query: { type: "string" }
  })
} as const;

const marketWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开行情", "打开市场", "唤出指数"],
  "widget.focus": ["聚焦行情", "切到市场", "打开行情"],
  "widget.fullscreen_focus": ["全屏行情", "放大市场", "专注看指数"],
  "widget.remove": ["关闭行情", "关掉市场", "把行情收起来"],
  "market.set_indices": ["看苹果股票", "打开特斯拉股价", "看腾讯股票", "查 AAPL", "看纳斯达克", "打开纳指", "NASDAQ 100", "美股三大指数", "A股行情", "看恒生指数"]
};

function isMarketTool(action: AssistantAction): boolean {
  return action.spec.widgetType === MARKET_MODULE_TYPE || marketWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return marketToolArgSchemas[name as keyof typeof marketToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createMarketTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isMarketTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: marketResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["美股怎么样", "A股行情", "打开行情"]
      }
    };
  });
}

export function createMarketActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createMarketTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: marketResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `market:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["美股怎么样", "A股行情", "打开行情"]
    };
  });
}
