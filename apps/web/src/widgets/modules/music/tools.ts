import {
  createStrictObjectSchema,
  type AssistantAction,
  type WidgetModuleActionSpec
} from "@xiaozhuoban/assistant-core";

const musicResultSchema = { type: "object", additionalProperties: true };
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const windowAddWidgetArgsSchema = createStrictObjectSchema({
  definitionId: { type: "string", required: true },
  mobileMode: { type: "boolean" },
  followUp: { type: "object" }
});

export const musicToolArgSchemas = {
  "board.add_widget": windowAddWidgetArgsSchema,
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "music.auth_status": widgetIdArgsSchema,
  "music.search": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    query: { type: "string", required: true },
    kind: { type: "string" }
  }),
  "music.play": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    query: { type: "string" },
    kind: { type: "string" },
    resultIndex: { type: "number" }
  }),
  "music.pause": widgetIdArgsSchema,
  "music.resume": widgetIdArgsSchema,
  "music.next": widgetIdArgsSchema,
  "music.previous": widgetIdArgsSchema
} as const;

const musicWindowTools = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const examplesByTool: Record<string, string[]> = {
  "board.add_widget": ["打开音乐", "调出播放器", "唤出音乐播放器"],
  "widget.focus": ["聚焦音乐", "打开音乐", "切到播放器"],
  "widget.fullscreen_focus": ["全屏音乐", "放大播放器", "专注播放音乐"],
  "widget.remove": ["关闭音乐", "音乐关掉", "把音乐收起来"],
  "music.auth_status": ["Apple Music 登录了吗", "确认音乐账号登录状态", "播放器现在可以用吗"],
  "music.search": ["只搜索七里香，不要播放", "展示周杰伦的搜索结果", "找一点巴洛克羽管键琴，暂时不播放", "我想看看放松音乐的结果但不播放"],
  "music.play": ["播放周杰伦", "来个周杰伦经典", "播放陈奕迅十年", "想听王菲红豆", "播放 Nils Frahm 的 Says", "播放 Olafur Arnalds 的 Near Light", "播放第一首"],
  "music.pause": ["暂停音乐", "音乐暂停", "先别放音乐"],
  "music.resume": ["继续音乐", "继续刚才的音乐", "恢复播放音乐", "接着放"],
  "music.next": ["下一首", "切下一首歌", "播放下一首"],
  "music.previous": ["上一首", "切回上一首", "播放上一首"]
};

function isMusicTool(action: AssistantAction): boolean {
  return action.spec.widgetType === "music" || musicWindowTools.has(action.spec.name);
}

function schemaForTool(name: string) {
  return musicToolArgSchemas[name as keyof typeof musicToolArgSchemas] ?? createStrictObjectSchema({});
}

function idempotencyForTool(name: string) {
  return name.startsWith("widget.") ? "idempotent" : "stateful";
}

function requiresMusicAuthorization(name: string) {
  return name.startsWith("music.") && name !== "music.auth_status";
}

export function createMusicTools(actions: AssistantAction[]): AssistantAction[] {
  return actions.filter(isMusicTool).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      ...action,
      spec: {
        ...action.spec,
        parameters: schema,
        argumentKeys: schema.argumentKeys,
        resultSchema: musicResultSchema,
        idempotency: idempotencyForTool(action.spec.name),
        missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
        requiresAuth: requiresMusicAuthorization(action.spec.name),
        examples: examplesByTool[action.spec.name] ?? ["打开音乐", "关闭音乐", "暂停音乐"]
      }
    };
  });
}

export function createMusicActionSpecs(actions: AssistantAction[]): WidgetModuleActionSpec[] {
  return createMusicTools(actions).map((action) => {
    const schema = schemaForTool(action.spec.name);
    return {
      name: action.spec.name,
      intent: action.spec.name,
      description: action.spec.description,
      argsSchema: schema.jsonSchema,
      resultSchema: musicResultSchema,
      risk: action.spec.risk ?? "safe",
      requiresMountedWidget: action.spec.scope === "widget-detail",
      requiresAuth: requiresMusicAuthorization(action.spec.name),
      idempotency: idempotencyForTool(action.spec.name),
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      concurrencyKey: `music:${action.spec.name}`,
      examples: examplesByTool[action.spec.name] ?? ["打开音乐", "关闭音乐", "暂停音乐"]
    };
  });
}
