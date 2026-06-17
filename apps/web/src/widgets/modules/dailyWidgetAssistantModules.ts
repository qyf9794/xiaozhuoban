import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest,
  type ShortcutRule,
  createStrictObjectSchema,
  type WidgetAssistantDefinition,
  type WidgetModuleActionSpec,
  type WidgetAssistantModule,
  type WidgetExecutionPolicy
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

type DailyWidgetModuleSeed = {
  type: string;
  aliases: string[];
  capabilities: string[];
  shortcutExamples: string[];
  riskSummary?: string[];
  shortcuts: ShortcutRule[];
  executionPolicy?: WidgetExecutionPolicy;
  permissions?: string[];
};

const genericWindowToolNames = new Set(["board.add_widget", "widget.focus", "widget.fullscreen_focus", "widget.remove"]);

const defaultExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "sequential",
  canRunInParallelWith: ["weather", "music", "headline", "worldClock"]
};

const seeds: DailyWidgetModuleSeed[] = [
  {
    type: "note",
    aliases: ["便签", "笔记"],
    capabilities: ["记便签", "追加文本", "清空便签", "关闭窗口"],
    shortcutExamples: ["帮我记一下今天继续测试小桌板", "清一下便签"],
    riskSummary: ["清空便签内容需要确认"],
    shortcuts: [
      { id: "note.write", intent: "note_write", actions: ["记", "写"], examples: ["帮我记一下今天继续测试小桌板"], risk: "safe" },
      { id: "note.clear", intent: "note_clear", actions: ["清空", "清一下"], examples: ["清一下便签"], risk: "destructive" }
    ]
  },
  {
    type: "tv",
    aliases: ["电视", "直播", "电视机"],
    capabilities: ["打开电视", "选择频道", "播放", "暂停", "全屏", "关闭窗口"],
    shortcutExamples: ["看央视新闻", "暂停 CCTV1", "央视五套全屏播放"],
    shortcuts: [
      { id: "tv.channel", intent: "tv_channel", actions: ["看", "切到", "播放"], examples: ["看央视新闻"], risk: "safe" }
    ]
  },
  {
    type: "countdown",
    aliases: ["倒计时", "计时器", "定时器", "定时"],
    capabilities: ["设置倒计时", "暂停", "继续", "重置", "关闭窗口"],
    shortcutExamples: ["定时十分钟", "暂停计时", "取消倒计时"],
    shortcuts: [
      { id: "countdown.set", intent: "countdown_set", actions: ["倒计时", "定时"], examples: ["定时十分钟"], risk: "safe" }
    ],
    executionPolicy: { ...defaultExecutionPolicy, defaultMode: "latest-wins" }
  },
  {
    type: "headline",
    aliases: ["新闻", "头条"],
    capabilities: ["打开新闻", "刷新新闻", "关闭窗口"],
    shortcutExamples: ["今天有什么新闻", "最新头条"],
    shortcuts: [
      { id: "headline.refresh", intent: "headline_refresh", actions: ["新闻", "头条"], examples: ["今天有什么新闻"], risk: "safe" }
    ]
  },
  {
    type: "market",
    aliases: ["行情", "市场", "指数", "美股", "A股", "港股"],
    capabilities: ["打开行情", "查询指数", "刷新行情", "关闭窗口"],
    shortcutExamples: ["美股怎么样", "A股行情", "看恒生指数"],
    shortcuts: [
      { id: "market.indices", intent: "market_indices", actions: ["行情", "指数"], examples: ["美股怎么样", "A股行情"], risk: "safe" }
    ],
    executionPolicy: { ...defaultExecutionPolicy, defaultMode: "latest-wins" }
  },
  {
    type: "calculator",
    aliases: ["计算器", "计算", "算一下"],
    capabilities: ["打开计算器", "展示计算结果", "关闭窗口"],
    shortcutExamples: ["12加30是多少", "12乘以8"],
    shortcuts: [
      { id: "calculator.calculate", intent: "calculate", actions: ["计算", "算"], examples: ["12加30是多少"], risk: "safe" }
    ],
    executionPolicy: { ...defaultExecutionPolicy, defaultMode: "latest-wins" }
  },
  {
    type: "translate",
    aliases: ["翻译", "翻译器", "什么意思"],
    capabilities: ["打开翻译", "翻译文本", "设置目标语言", "关闭窗口"],
    shortcutExamples: ["翻译一下 hello", "hello 是什么意思"],
    shortcuts: [
      { id: "translate.draft", intent: "translate_text", actions: ["翻译"], examples: ["翻译一下 hello"], risk: "safe" }
    ],
    executionPolicy: { ...defaultExecutionPolicy, defaultMode: "latest-wins" }
  },
  {
    type: "worldClock",
    aliases: ["世界时钟", "世界时间", "时区"],
    capabilities: ["打开世界时钟", "设置城市时区", "关闭窗口"],
    shortcutExamples: ["NYC and Tokyo time", "看东京巴黎悉尼时间"],
    shortcuts: [
      { id: "worldClock.zones", intent: "world_clock_zones", actions: ["时间", "时区"], examples: ["NYC and Tokyo time"], risk: "safe" }
    ]
  },
  {
    type: "recorder",
    aliases: ["录音", "录制", "录音机"],
    capabilities: ["开始录音", "播放录音", "暂停录音", "关闭窗口"],
    shortcutExamples: ["开始录制", "播放录制"],
    riskSummary: ["录音需要麦克风权限"],
    permissions: ["microphone"],
    shortcuts: [
      { id: "recorder.control", intent: "recorder_control", actions: ["开始", "播放", "暂停"], examples: ["开始录制"], risk: "safe" }
    ]
  }
];

function truncateSummary(value: string, maxLength = 24) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function createDefinition(seed: DailyWidgetModuleSeed, definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? seed.type,
    type: seed.type,
    name: definition?.name ?? seed.type,
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}

const emptyArgsSchema = createStrictObjectSchema({});
const widgetIdArgsSchema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
const resultSchema = { type: "object", additionalProperties: true };

const toolArgSchemas: Record<string, ReturnType<typeof createStrictObjectSchema>> = {
  "board.add_widget": createStrictObjectSchema({
    definitionId: { type: "string", required: true },
    mobileMode: { type: "boolean" },
    followUp: { type: "object" }
  }),
  "widget.focus": widgetIdArgsSchema,
  "widget.fullscreen_focus": widgetIdArgsSchema,
  "widget.remove": widgetIdArgsSchema,
  "note.write": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    content: { type: "string", required: true },
    mode: { type: "string", enum: ["replace", "append"] }
  }),
  "note.clear": widgetIdArgsSchema,
  "countdown.set": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    hours: { type: "number" },
    minutes: { type: "number" },
    seconds: { type: "number" },
    totalSeconds: { type: "number" },
    start: { type: "boolean" }
  }),
  "countdown.pause": widgetIdArgsSchema,
  "countdown.resume": widgetIdArgsSchema,
  "countdown.reset": widgetIdArgsSchema,
  "calculator.set_display": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    display: { type: ["string", "number"], required: true }
  }),
  "headline.request_refresh": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    requestedAt: { type: "string" }
  }),
  "market.set_indices": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    indexCode: { type: "string" },
    indexCodes: { type: "array" }
  }),
  "worldClock.set_zones": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    zones: { type: "array", required: true }
  }),
  "translate.set_draft": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    sourceText: { type: "string", required: true },
    sourceLang: { type: "string" },
    targetLang: { type: "string" }
  }),
  "tv.play": widgetIdArgsSchema,
  "tv.pause": widgetIdArgsSchema,
  "tv.fullscreen": widgetIdArgsSchema,
  "tv.select_channel": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    channelName: { type: "string" },
    channelUrl: { type: "string" }
  }),
  "recorder.start": widgetIdArgsSchema,
  "recorder.stop": widgetIdArgsSchema,
  "recorder.play": createStrictObjectSchema({
    widgetId: { type: "string", required: true },
    recordingId: { type: "string" }
  }),
  "recorder.pause": widgetIdArgsSchema
};

function toolExamples(toolName: string, seed: DailyWidgetModuleSeed): string[] {
  const examples: Record<string, string[]> = {
    "widget.remove": [`关闭${seed.aliases[0]}`, `${seed.aliases[0]}关掉`, `把${seed.aliases[0]}收起来`],
  };
  return examples[toolName] ?? seed.shortcutExamples.slice(0, 3).concat(seed.capabilities.slice(0, 3)).slice(0, 3);
}

function enhanceActionForModule(action: AssistantAction, seed: DailyWidgetModuleSeed): AssistantAction {
  const schema = toolArgSchemas[action.spec.name] ?? emptyArgsSchema;
  return {
    ...action,
    spec: {
      ...action.spec,
      parameters: schema,
      argumentKeys: schema.argumentKeys,
      resultSchema,
      idempotency: action.spec.risk === "destructive" ? "destructive" : action.spec.name.startsWith("widget.") ? "idempotent" : "stateful",
      missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
      requiresPermission: seed.permissions,
      examples: toolExamples(action.spec.name, seed)
    }
  };
}

function createActionSpec(action: AssistantAction, seed: DailyWidgetModuleSeed): WidgetModuleActionSpec {
  const schema = toolArgSchemas[action.spec.name] ?? emptyArgsSchema;
  return {
    name: action.spec.name,
    intent: action.spec.name,
    description: action.spec.description,
    argsSchema: schema.jsonSchema,
    resultSchema,
    risk: action.spec.risk ?? "safe",
    requiresMountedWidget: action.spec.scope === "widget-detail",
    requiresAuth: action.spec.name.startsWith("music."),
    requiresPermission: seed.permissions,
    idempotency: action.spec.risk === "destructive" ? "destructive" : action.spec.name.startsWith("widget.") ? "idempotent" : "stateful",
    missingArgPolicy: action.spec.requiresTarget ? "ask" : "fail",
    concurrencyKey: `${seed.type}:${action.spec.name}`,
    examples: toolExamples(action.spec.name, seed)
  };
}

function toolsForModule(type: string, actions: AssistantAction[]): AssistantAction[] {
  return actions.filter((action) => action.spec.widgetType === type || genericWindowToolNames.has(action.spec.name));
}

function createScopedContext(
  seed: DailyWidgetModuleSeed,
  tools: AssistantAction[],
  executionPolicy: WidgetExecutionPolicy,
  request: ScopedContextRequest
): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === seed.type)
    .map((widget) => ({ ...widget, summary: truncateSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: seed.type,
    tools: safeTools,
    toolSchemas: Object.fromEntries(
      safeTools.map((tool) => [
        tool.name,
        (tool.parameters as { jsonSchema?: Record<string, unknown> }).jsonSchema ?? {
          name: tool.name,
          scope: tool.scope,
          risk: tool.risk,
          widgetType: tool.widgetType,
          requiresTarget: tool.requiresTarget,
          argumentKeys: tool.argumentKeys
        }
      ])
    ),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint
    },
    shortcutExamples: seed.shortcutExamples.slice(0, 8),
    executionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createDailyWidgetAssistantModules(
  definitions: WidgetDefinition[],
  actions: AssistantAction[]
): WidgetAssistantModule[] {
  const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));
  return seeds.map((seed) => {
    const moduleTools = toolsForModule(seed.type, actions).map((action) => enhanceActionForModule(action, seed));
    const executionPolicy = seed.executionPolicy ?? defaultExecutionPolicy;
    const context = (request: ScopedContextRequest) => createScopedContext(seed, moduleTools, executionPolicy, request);
    return {
      type: seed.type,
      definition: createDefinition(seed, definitionsByType.get(seed.type)),
      aliases: seed.aliases,
      shortcuts: seed.shortcuts,
      tools: moduleTools,
      context: {
        maxRealtimeContextTokens: 900,
        getScopedContext: context,
        redactContext: (moduleContext) => ({
          ...moduleContext,
          instances: moduleContext.instances.map((instance) => ({
            ...instance,
            summary: truncateSummary(instance.summary)
          }))
        })
      },
      realtime: {
        exposeCatalog: () => ({
          type: seed.type,
          displayName: definitionsByType.get(seed.type)?.name ?? seed.type,
          aliases: seed.aliases,
          capabilities: seed.capabilities,
          shortcutExamples: seed.shortcutExamples.slice(0, 5),
          riskSummary: seed.riskSummary ?? moduleTools.filter((action) => action.spec.risk).map((action) => `${action.spec.name}:${action.spec.risk}`)
        }),
        getScopedContext: context
      },
      executionPolicy,
      actionSpecs: moduleTools.map((action) => createActionSpec(action, seed)),
      legacyBridge: true,
      migrationNotes: ["当前模块复用既有 ActionRegistry/capability bridge；模块级 schema、context、policy 已独立收紧。"],
      testMatrix: {
        localParsing: seed.shortcutExamples,
        commandPlans: seed.shortcuts.flatMap((shortcut) => shortcut.examples),
        execution: moduleTools.flatMap((action) => action.spec.examples ?? []),
        realtimeFallback: seed.shortcutExamples.map((example) => `${example}（复杂口语兜底）`),
        regression: seed.shortcuts.flatMap((shortcut) => shortcut.examples)
      }
    };
  });
}

export function createDailyWidgetAssistantModuleByType(
  type: string,
  definitions: WidgetDefinition[],
  actions: AssistantAction[]
): WidgetAssistantModule {
  const module = createDailyWidgetAssistantModules(definitions, actions).find((item) => item.type === type);
  if (!module) {
    throw new Error(`Unknown daily widget assistant module: ${type}`);
  }
  return module;
}
