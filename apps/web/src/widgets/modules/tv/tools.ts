import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";
import { TV_MODULE_TYPE } from "./definition";

const tvResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const tvChannelArgsSchema = createStrictObjectSchema({
  widgetId: { type: "string", required: true },
  channelName: { type: "string" },
  channelUrl: { type: "string" }
});
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const tvToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "tv.play": tvChannelArgsSchema,
  "tv.pause": widgetIdArgsSchema,
  "tv.fullscreen": widgetIdArgsSchema,
  "tv.select_channel": tvChannelArgsSchema
} as const;

const tvWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开电视", "打开电视机", "唤出直播"],
  "widget.focus": ["聚焦电视", "切到电视", "打开电视"],
  "widget.fullscreen_focus": ["全屏电视", "放大电视", "专注看电视"],
  "widget.remove": ["关闭电视", "关掉电视机", "把电视收起来"],
  "tv.play": ["播放 CCTV1", "我想看 BBC", "看央视新闻", "央视五套全屏播放"],
  "tv.pause": ["暂停 CCTV1", "暂停电视", "先别播电视"],
  "tv.fullscreen": ["电视全屏", "央视五套全屏播放", "全屏播放电视"],
  "tv.select_channel": ["看央视新闻", "我想看 BBC", "切到 BBC", "切到 CCTV13", "播放 CCTV1"]
};

function isTvTool(action: AssistantAction): boolean {
  return action.spec.widgetType === TV_MODULE_TYPE || tvWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return tvToolArgSchemas[name as keyof typeof tvToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createTvTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isTvTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: tvResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        examples: examplesByTool[action.spec.name] ?? ["看央视新闻", "暂停 CCTV1", "打开电视"]
      }
    };
  });
}

export function createTvActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createTvTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: tvResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `tv:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["看央视新闻", "暂停 CCTV1", "打开电视"]
    };
  });
}
