import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const clipboardResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const clipboardToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "clipboard.add_text": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    text: { type: "string", required: true },
    pinned: { type: "boolean" }
  }),
  "clipboard.clear": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    includePinned: { type: "boolean" }
  })
} as const;

const clipboardWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开剪贴板", "调出复制板", "唤出剪贴板"],
  "widget.focus": ["聚焦剪贴板", "切到复制板", "打开剪贴板"],
  "widget.fullscreen_focus": ["全屏剪贴板", "放大剪贴板", "专注看剪贴板"],
  "widget.remove": ["关闭剪贴板", "关掉复制板", "把剪贴板收起来"],
  "clipboard.add_text": ["复制账号 demo 到剪贴板", "保存这段文字到剪贴板", "固定保存到剪贴板账号是 demo"],
  "clipboard.clear": ["清空剪贴板", "清一下剪贴板", "清掉复制板"]
};

const descriptionByTool: Record<string, string> = {
  "clipboard.add_text": "Add text to clipboard history. Set pinned=true when the user says 固定、置顶、钉住、pin, or asks to keep the record fixed.",
  "clipboard.clear": "Clear clipboard history. Omit includePinned or set false to preserve pinned records; set includePinned=true only when the user explicitly asks to clear fixed/pinned records too."
};

function isClipboardTool(action: AssistantAction): boolean {
  return action.spec.widgetType === "clipboard" || clipboardWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return clipboardToolArgSchemas[name as keyof typeof clipboardToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string, risk: AssistantAction["spec"]["risk"]) {
  if (risk === "destructive") return "destructive";
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createClipboardTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isClipboardTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        description: descriptionByTool[action.spec.name] ?? action.spec.description,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: clipboardResultSchema,
        idempotency: idempotencyForTool(action.spec.name, action.spec.risk),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["复制账号 demo 到剪贴板", "清一下剪贴板", "打开剪贴板"]
      }
    };
  });
}

export function createClipboardActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createClipboardTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: descriptionByTool[action.spec.name] ?? action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: clipboardResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name, action.spec.risk),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `clipboard:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["复制账号 demo 到剪贴板", "清一下剪贴板", "打开剪贴板"]
    };
  });
}
