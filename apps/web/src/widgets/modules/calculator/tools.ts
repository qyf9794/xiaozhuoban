import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";
import { CALCULATOR_MODULE_TYPE } from "./definition";

const calculatorResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const calculatorToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "calculator.set_display": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    display: { type: ["string", "number"], required: true }
  })
} as const;

const calculatorWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开计算器", "打开计算", "唤出计算器"],
  "widget.focus": ["聚焦计算器", "切到计算器", "打开计算器"],
  "widget.fullscreen_focus": ["全屏计算器", "放大计算器", "专注计算"],
  "widget.remove": ["关闭计算器", "关掉计算器", "把计算器收起来"],
  "calculator.set_display": ["12加30是多少", "12乘以8", "2斤是多少克"]
};

function isCalculatorTool(action: AssistantAction): boolean {
  return action.spec.widgetType === CALCULATOR_MODULE_TYPE || calculatorWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return calculatorToolArgSchemas[name as keyof typeof calculatorToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createCalculatorTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isCalculatorTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: calculatorResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["12加30是多少", "12乘以8", "打开计算器"]
      }
    };
  });
}

export function createCalculatorActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createCalculatorTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: calculatorResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `calculator:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["12加30是多少", "12乘以8", "打开计算器"]
    };
  });
}
