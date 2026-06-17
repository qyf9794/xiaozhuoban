import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";
import { RECORDER_MODULE_TYPE } from "./definition";

const recorderResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const recorderToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "recorder.start": widgetIdArgsSchema,
  "recorder.stop": widgetIdArgsSchema,
  "recorder.play": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    recordingId: { type: "string" }
  }),
  "recorder.pause": widgetIdArgsSchema
} as const;

const recorderWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开录音机", "打开录制", "唤出录音"],
  "widget.focus": ["聚焦录音机", "切到录音", "打开录音机"],
  "widget.fullscreen_focus": ["全屏录音机", "放大录音机", "专注录音"],
  "widget.remove": ["关闭录音机", "关掉录音", "把录音机收起来"],
  "recorder.start": ["开始录制", "开始录音", "录一下"],
  "recorder.stop": ["停止录音", "结束录制", "停掉录音"],
  "recorder.play": ["播放录制", "播放录音", "回放录音"],
  "recorder.pause": ["暂停录制", "暂停录音", "先别播放录音"]
};

function isRecorderTool(action: AssistantAction): boolean {
  return action.spec.widgetType === RECORDER_MODULE_TYPE || recorderWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return recorderToolArgSchemas[name as keyof typeof recorderToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

export function createRecorderTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isRecorderTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: recorderResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        requiresPermission: ["microphone"],
        examples: examplesByTool[action.spec.name] ?? ["开始录制", "播放录制", "暂停录制"]
      }
    };
  });
}

export function createRecorderActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createRecorderTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: recorderResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      requiresPermission: ["microphone"],
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `recorder:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["开始录制", "播放录制", "暂停录制"]
    };
  });
}
