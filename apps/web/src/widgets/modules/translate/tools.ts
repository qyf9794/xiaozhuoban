import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";
import { TRANSLATE_MODULE_TYPE } from "./definition";

const translateResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const translateToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "translate.set_draft": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    sourceText: { type: "string", required: true },
    sourceLang: { type: "string" },
    targetLang: { type: "string" }
  })
} as const;

const translateWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开翻译", "打开翻译器", "唤出翻译"],
  "widget.focus": ["聚焦翻译", "切到翻译器", "打开翻译"],
  "widget.fullscreen_focus": ["全屏翻译", "放大翻译", "专注翻译"],
  "widget.remove": ["关闭翻译", "关掉翻译器", "把翻译收起来"],
  "translate.set_draft": ["翻译一下 hello", "hello 是什么意思", "把 hello 翻译成中文"]
};

function isTranslateTool(action: AssistantAction): boolean {
  return action.spec.widgetType === TRANSLATE_MODULE_TYPE || translateWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return translateToolArgSchemas[name as keyof typeof translateToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createTranslateTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isTranslateTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: translateResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["翻译一下 hello", "hello 是什么意思", "打开翻译"]
      }
    };
  });
}

export function createTranslateActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createTranslateTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: translateResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `translate:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["翻译一下 hello", "hello 是什么意思", "打开翻译"]
    };
  });
}
