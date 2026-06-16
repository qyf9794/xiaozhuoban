export type AssistantActionRisk = "safe" | "confirm" | "destructive";

export type AssistantToolSource = "shortcut" | "realtime" | "text" | "test";

export type AssistantToolScopeKind = "desktop" | "widget-selection" | "widget-detail" | "deferred";

export interface AssistantSchemaParseSuccess<T> {
  success: true;
  data: T;
}

export interface AssistantSchemaParseFailure {
  success: false;
  error: {
    issues?: Array<{
      path?: Array<string | number>;
      message: string;
    }>;
    message?: string;
  };
}

export interface AssistantParameterSchema<T> {
  safeParse(value: unknown): AssistantSchemaParseSuccess<T> | AssistantSchemaParseFailure;
}

export interface AssistantToolSpec<TArgs = unknown> {
  name: string;
  description: string;
  parameters: AssistantParameterSchema<TArgs>;
  risk?: AssistantActionRisk;
  scope?: AssistantToolScopeKind;
  widgetType?: string;
  requiresTarget?: boolean;
}

export interface AssistantToolCall<TArgs = unknown> {
  id: string;
  name: string;
  arguments: TArgs;
  source: AssistantToolSource;
  transcript?: string;
}

export interface ResolvedWidgetTarget {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  confidence: number;
  reason: string;
}

export interface ConfirmationRequest<TArgs = unknown> {
  id: string;
  actionName: string;
  arguments: TArgs;
  target?: ResolvedWidgetTarget;
  message: string;
  createdAt: string;
}

export type AssistantToolResultStatus =
  | "success"
  | "failed"
  | "needs_confirmation"
  | "needs_clarification"
  | "cancelled"
  | "timed_out";

export interface AssistantToolResult<TData = unknown> {
  status: AssistantToolResultStatus;
  message: string;
  data?: TData;
  confirmation?: ConfirmationRequest;
  errorCode?: string;
}

export interface AssistantActionContext {
  now: () => string;
  target?: ResolvedWidgetTarget;
  signal?: AbortSignal;
}

export interface AssistantAction<TArgs = unknown, TResult = unknown> {
  spec: AssistantToolSpec<TArgs>;
  execute: (args: TArgs, context: AssistantActionContext) => Promise<AssistantToolResult<TResult>> | AssistantToolResult<TResult>;
}

export interface IntentShortcutMatch<TArgs = unknown> {
  matched: true;
  confidence: number;
  toolCall: AssistantToolCall<TArgs>;
}

export interface IntentShortcutNoMatch {
  matched: false;
  reason: string;
}

export type IntentShortcutResult<TArgs = unknown> = IntentShortcutMatch<TArgs> | IntentShortcutNoMatch;

export interface IntentShortcutContext {
  pendingConfirmation?: ConfirmationRequest;
  source?: AssistantToolSource;
  availableWidgets?: CompactWidgetSummary[];
  availableDefinitions?: Array<{
    definitionId: string;
    type: string;
    name: string;
  }>;
  focusedWidget?: CompactWidgetSummary;
}

export interface AssistantToolScope {
  kind: AssistantToolScopeKind;
  widgetType?: string;
  toolNames: string[];
}

export interface CompactWidgetSummary {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  order: number;
  summary: string;
  recent?: boolean;
  focused?: boolean;
}

export interface CompactAssistantContext {
  boardId?: string;
  boardName?: string;
  widgetCountsByType: Record<string, number>;
  widgets: CompactWidgetSummary[];
  focusedWidget?: CompactWidgetSummary;
  pendingConfirmation?: Pick<ConfirmationRequest, "id" | "actionName" | "message">;
}

export interface WidgetContextSnapshot {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  order: number;
  state?: Record<string, unknown>;
  summary?: string;
}

export interface ContextSummarizerInput {
  boardId?: string;
  boardName?: string;
  widgets: WidgetContextSnapshot[];
  focusedWidgetId?: string;
  recentWidgetIds?: string[];
  pendingConfirmation?: ConfirmationRequest;
  maxWidgets?: number;
}

export interface IntentShortcutRule {
  name: string;
  match: (normalizedInput: string, rawInput: string, context: IntentShortcutContext) => IntentShortcutResult;
}

export interface WidgetTargetResolverContext {
  widgets: CompactWidgetSummary[];
  focusedWidget?: CompactWidgetSummary;
  recentWidgetIds?: string[];
}

export type WidgetTargetResolution =
  | {
      status: "resolved";
      target: ResolvedWidgetTarget;
    }
  | {
      status: "needs_clarification";
      message: string;
      candidates: ResolvedWidgetTarget[];
    }
  | {
      status: "not_found";
      message: string;
    };

export class AssistantRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "AssistantRegistryError";
  }
}

function formatSchemaError(error: AssistantSchemaParseFailure["error"]): string {
  const issues = error.issues ?? [];
  if (issues.length > 0) {
    return issues
      .map((issue) => {
        const path = issue.path?.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
  return error.message || "参数校验失败";
}

function defaultNow() {
  return new Date().toISOString();
}

export class ActionRegistry {
  private readonly actions = new Map<string, AssistantAction<unknown, unknown>>();

  register<TArgs, TResult>(action: AssistantAction<TArgs, TResult>): void {
    const name = action.spec.name.trim();
    if (!name) {
      throw new AssistantRegistryError("Action name is required", "ACTION_NAME_REQUIRED");
    }
    if (this.actions.has(name)) {
      throw new AssistantRegistryError(`Action already registered: ${name}`, "ACTION_ALREADY_REGISTERED");
    }

    this.actions.set(name, action as AssistantAction<unknown, unknown>);
  }

  list(scope?: AssistantToolScopeKind): AssistantToolSpec[] {
    const specs = [...this.actions.values()].map((action) => action.spec);
    return scope ? specs.filter((spec) => spec.scope === scope) : specs;
  }

  get(name: string): AssistantToolSpec | null {
    return this.actions.get(name)?.spec ?? null;
  }

  async execute<TData = unknown>(
    call: AssistantToolCall,
    context: Partial<AssistantActionContext> = {}
  ): Promise<AssistantToolResult<TData>> {
    const action = this.actions.get(call.name);
    if (!action) {
      return {
        status: "failed",
        message: `未知工具：${call.name}`,
        errorCode: "UNKNOWN_TOOL"
      };
    }

    const parsed = action.spec.parameters.safeParse(call.arguments);
    if (!parsed.success) {
      return {
        status: "failed",
        message: formatSchemaError(parsed.error),
        errorCode: "INVALID_ARGUMENTS"
      };
    }

    try {
      return (await action.execute(parsed.data, {
        now: context.now ?? defaultNow,
        target: context.target,
        signal: context.signal
      })) as AssistantToolResult<TData>;
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "工具执行失败",
        errorCode: "EXECUTION_FAILED"
      };
    }
  }
}

export class ToolScopeManager {
  constructor(private readonly tools: AssistantToolSpec[]) {}

  getInitialTools(): AssistantToolSpec[] {
    return this.filterTools((tool) => tool.scope === "desktop" || tool.scope === "widget-selection");
  }

  getWidgetDetailTools(widgetType: string): AssistantToolSpec[] {
    return this.filterTools(
      (tool) =>
        tool.scope === "desktop" ||
        tool.scope === "widget-selection" ||
        (tool.scope === "widget-detail" && tool.widgetType === widgetType)
    );
  }

  getDeferredTools(): AssistantToolSpec[] {
    return this.tools.filter((tool) => tool.scope === "deferred");
  }

  private filterTools(predicate: (tool: AssistantToolSpec) => boolean): AssistantToolSpec[] {
    const seen = new Set<string>();
    return this.tools.filter((tool) => {
      if (tool.scope === "deferred" || seen.has(tool.name) || !predicate(tool)) {
        return false;
      }
      seen.add(tool.name);
      return true;
    });
  }
}

function truncateSummary(value: string, maxLength = 24) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function summarizeStateValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} 项`;
  if (value && typeof value === "object") return "有状态";
  return "";
}

function summarizeWidgetState(type: string, state: Record<string, unknown> | undefined) {
  if (!state || Object.keys(state).length === 0) return "";

  if (type === "note") {
    return truncateSummary(summarizeStateValue(state.content));
  }
  if (type === "todo") {
    return Array.isArray(state.items) ? `${state.items.length} 个待办` : truncateSummary(summarizeStateValue(state.input));
  }
  if (type === "weather") {
    return truncateSummary(summarizeStateValue(state.cityCode) || summarizeStateValue(state.city));
  }
  if (type === "countdown") {
    const remaining = summarizeStateValue(state.remainingSeconds);
    const total = summarizeStateValue(state.totalSeconds);
    return remaining || total ? `倒计时 ${remaining || total} 秒` : "";
  }
  if (type === "tv") {
    return truncateSummary(summarizeStateValue(state.selectedChannelName) || summarizeStateValue(state.playlistUrl));
  }
  if (type === "music") {
    return truncateSummary(summarizeStateValue(state.query));
  }
  if (type === "translate") {
    return truncateSummary(summarizeStateValue(state.sourceText));
  }
  if (type === "worldClock") {
    return Array.isArray(state.zones) ? `${state.zones.length} 个时区` : "";
  }
  if (type === "clipboard") {
    return Array.isArray(state.items) ? `${state.items.length} 条剪贴板记录` : "";
  }

  const firstUseful = Object.entries(state).find(([, value]) => {
    if (typeof value === "string") return value.trim().length > 0;
    return typeof value === "number" || typeof value === "boolean";
  });
  return firstUseful ? truncateSummary(summarizeStateValue(firstUseful[1])) : "有状态";
}

export class ContextSummarizer {
  summarize(input: ContextSummarizerInput): CompactAssistantContext {
    const recentSet = new Set(input.recentWidgetIds ?? []);
    const widgetCountsByType = input.widgets.reduce<Record<string, number>>((counts, widget) => {
      counts[widget.type] = (counts[widget.type] ?? 0) + 1;
      return counts;
    }, {});

    const orderedWidgets = [...input.widgets].sort((a, b) => {
      const aFocused = a.widgetId === input.focusedWidgetId ? 0 : 1;
      const bFocused = b.widgetId === input.focusedWidgetId ? 0 : 1;
      if (aFocused !== bFocused) return aFocused - bFocused;
      const aRecent = recentSet.has(a.widgetId) ? 0 : 1;
      const bRecent = recentSet.has(b.widgetId) ? 0 : 1;
      if (aRecent !== bRecent) return aRecent - bRecent;
      return a.order - b.order;
    });

    const maxWidgets = Math.max(1, input.maxWidgets ?? 8);
    const widgets = orderedWidgets.slice(0, maxWidgets).map((widget): CompactWidgetSummary => {
      const summary = widget.summary ?? summarizeWidgetState(widget.type, widget.state);
      return {
        widgetId: widget.widgetId,
        definitionId: widget.definitionId,
        type: widget.type,
        name: widget.name,
        order: widget.order,
        summary: truncateSummary(summary || "无摘要"),
        recent: recentSet.has(widget.widgetId) || undefined,
        focused: widget.widgetId === input.focusedWidgetId || undefined
      };
    });

    const focusedWidget = widgets.find((widget) => widget.widgetId === input.focusedWidgetId);

    return {
      boardId: input.boardId,
      boardName: input.boardName,
      widgetCountsByType,
      widgets,
      focusedWidget,
      pendingConfirmation: input.pendingConfirmation
        ? {
            id: input.pendingConfirmation.id,
            actionName: input.pendingConfirmation.actionName,
            message: input.pendingConfirmation.message
          }
        : undefined
    };
  }
}

export function createPassthroughSchema<T>(guard?: (value: unknown) => value is T): AssistantParameterSchema<T> {
  return {
    safeParse(value) {
      if (!guard || guard(value)) {
        return { success: true, data: value as T };
      }
      return {
        success: false,
        error: {
          issues: [{ message: "参数形状不匹配" }]
        }
      };
    }
  };
}

function normalizeShortcutInput(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ");
}

function shortcutCall(name: string, args: unknown, source: AssistantToolSource, transcript: string): AssistantToolCall {
  return {
    id: `shortcut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    arguments: args,
    source,
    transcript
  };
}

function shortcutMatch(
  name: string,
  args: unknown,
  confidence: number,
  source: AssistantToolSource,
  transcript: string
): IntentShortcutMatch {
  return {
    matched: true,
    confidence,
    toolCall: shortcutCall(name, args, source, transcript)
  };
}

function findWidgetByType(context: IntentShortcutContext, type: string) {
  const widgets = context.availableWidgets ?? [];
  return (
    context.focusedWidget?.type === type
      ? context.focusedWidget
      : widgets.find((widget) => widget.type === type && widget.recent) ?? widgets.find((widget) => widget.type === type)
  );
}

function findDefinitionByType(context: IntentShortcutContext, type: string) {
  return (context.availableDefinitions ?? []).find((definition) => definition.type === type);
}

function parseChineseInteger(input: string): number | null {
  const direct = input.match(/\d+/)?.[0];
  if (direct) return Number(direct);

  const normalized = input.replace(/\s/g, "");
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  if (normalized.includes("半")) return 30;
  if (normalized.includes("十五")) return 15;
  if (normalized.includes("二十") || normalized.includes("两十")) return 20;
  if (normalized.includes("三十")) return 30;
  for (const [word, value] of Object.entries(map)) {
    if (normalized.includes(word)) return value;
  }
  return null;
}

function inferCityName(input: string) {
  const knownCities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "荆州", "重庆", "南京", "西安", "大连"];
  const known = knownCities.find((city) => input.includes(city));
  if (known) return known;
  const beforeWeather = input.match(/([\u4e00-\u9fa5a-zA-Z-]{2,24})\s*天气/);
  return beforeWeather?.[1] ?? "";
}

function inferOutOfScopeRequest(input: string):
  | {
      category: "deferred_widget" | "ai_form" | "dynamic_widget_generation" | "complex_planning" | "long_text_rewrite";
      targetType?: string;
    }
  | null {
  const compact = input.replace(/\s+/g, "");

  if (/五子棋|gomoku/i.test(compact) && /(落子|下棋|接受|邀请|开局|悔棋|加入|对战)/.test(compact)) {
    return { category: "deferred_widget", targetType: "gomoku" };
  }
  if (/大富翁|monopoly/i.test(compact) && /(掷骰|骰|买地|开局|邀请|加入|行动)/.test(compact)) {
    return { category: "deferred_widget", targetType: "monopoly" };
  }
  if (/掼蛋|guandan/i.test(compact) && /(出牌|过牌|贡|还牌|接受|邀请|开局)/.test(compact)) {
    return { category: "deferred_widget", targetType: "guandan" };
  }
  if (/(ai表单|AI表单|表单)/.test(input) && /(提交|填写|生成|运行|调用)/.test(input)) {
    return { category: "ai_form", targetType: "aiForm" };
  }
  if (/(生成|创建|做|定制|开发).*(新)?(小工具|工具|widget)/i.test(input)) {
    return { category: "dynamic_widget_generation" };
  }
  if (/(重写|改写|润色|扩写|总结).*(长文|文章|文档|这篇|全文)/.test(input)) {
    return { category: "long_text_rewrite" };
  }
  if (/(复杂规划|长期规划|旅行规划|项目计划|多步骤计划|帮我规划.*(一天|一周|项目|旅行))/.test(input)) {
    return { category: "complex_planning" };
  }
  return null;
}

export class IntentShortcutRouter {
  constructor(private readonly rules: IntentShortcutRule[]) {}

  route(input: string, context: IntentShortcutContext = {}): IntentShortcutResult {
    const normalized = normalizeShortcutInput(input);
    if (!normalized) {
      return { matched: false, reason: "empty_input" };
    }

    for (const rule of this.rules) {
      const result = rule.match(normalized, input, context);
      if (result.matched) {
        return result;
      }
    }

    return { matched: false, reason: "no_shortcut_match" };
  }
}

export function createDefaultIntentShortcutRouter(): IntentShortcutRouter {
  const rules: IntentShortcutRule[] = [
    {
      name: "confirm",
      match(normalized, raw, context) {
        if (!context.pendingConfirmation) return { matched: false, reason: "no_pending_confirmation" };
        if (/^(确认|确定|好的|好|是|是的|执行|继续)$/.test(normalized)) {
          return shortcutMatch(
            "assistant.confirm",
            { confirmationId: context.pendingConfirmation.id },
            0.98,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "not_confirm" };
      }
    },
    {
      name: "cancel",
      match(normalized, raw, context) {
        if (!context.pendingConfirmation) return { matched: false, reason: "no_pending_confirmation" };
        if (/^(取消|算了|不要|不用了|停止)$/.test(normalized)) {
          return shortcutMatch(
            "assistant.cancel",
            { confirmationId: context.pendingConfirmation.id },
            0.98,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "not_cancel" };
      }
    },
    {
      name: "out_of_scope",
      match(_normalized, raw, context) {
        const request = inferOutOfScopeRequest(raw);
        if (!request) return { matched: false, reason: "not_out_of_scope" };
        return shortcutMatch(
          "assistant.out_of_scope",
          { ...request, request: raw },
          0.96,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "auto_align",
      match(normalized, raw, context) {
        if (/(整理|排列|对齐|收拾).*(桌面|桌板|小工具)|^(整理|排列|对齐|收拾)$/.test(normalized)) {
          return shortcutMatch("board.auto_align", {}, 0.9, context.source ?? "shortcut", raw);
        }
        return { matched: false, reason: "not_auto_align" };
      }
    },
    {
      name: "open_weather",
      match(normalized, raw, context) {
        if (!normalized.includes("天气")) return { matched: false, reason: "not_weather" };
        const cityName = inferCityName(raw);
        const widget = findWidgetByType(context, "weather");
        if (widget && cityName) {
          return shortcutMatch(
            "weather.set_city",
            { widgetId: widget.widgetId, city: cityName },
            0.92,
            context.source ?? "shortcut",
            raw
          );
        }
        if (widget) {
          return shortcutMatch("widget.focus", { widgetId: widget.widgetId }, 0.86, context.source ?? "shortcut", raw);
        }
        const definition = findDefinitionByType(context, "weather");
        if (definition) {
          return shortcutMatch(
            "board.add_widget",
            { definitionId: definition.definitionId },
            cityName ? 0.82 : 0.78,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "weather_definition_missing" };
      }
    },
    {
      name: "countdown_duration",
      match(normalized, raw, context) {
        if (!normalized.includes("倒计时")) return { matched: false, reason: "not_countdown" };
        const minutes = parseChineseInteger(normalized);
        if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
          return { matched: false, reason: "countdown_duration_missing" };
        }
        const widget = findWidgetByType(context, "countdown");
        if (widget) {
          return shortcutMatch(
            "countdown.set",
            { widgetId: widget.widgetId, totalSeconds: minutes * 60, start: true },
            0.9,
            context.source ?? "shortcut",
            raw
          );
        }
        const definition = findDefinitionByType(context, "countdown");
        if (definition) {
          return shortcutMatch(
            "board.add_widget",
            { definitionId: definition.definitionId },
            0.75,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "countdown_target_missing" };
      }
    },
    {
      name: "open_widget",
      match(normalized, raw, context) {
        const openIntent = /(打开|添加|新增|叫出|显示)/.test(normalized);
        if (!openIntent) return { matched: false, reason: "not_open_widget" };
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记"] },
          { type: "todo", aliases: ["待办", "任务"] },
          { type: "tv", aliases: ["电视", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲"] },
          { type: "worldClock", aliases: ["世界时钟", "时区"] },
          { type: "dialClock", aliases: ["时钟", "表盘"] },
          { type: "translate", aliases: ["翻译"] },
          { type: "converter", aliases: ["换算", "单位"] },
          { type: "clipboard", aliases: ["剪贴板"] },
          { type: "recorder", aliases: ["录音"] },
          { type: "messageBoard", aliases: ["留言板", "留言"] }
        ];
        const matchedType = knownTypes.find((entry) => entry.aliases.some((alias) => raw.includes(alias)))?.type;
        if (!matchedType) return { matched: false, reason: "widget_type_missing" };
        const widget = findWidgetByType(context, matchedType);
        if (widget) {
          return shortcutMatch("widget.focus", { widgetId: widget.widgetId }, 0.84, context.source ?? "shortcut", raw);
        }
        const definition = findDefinitionByType(context, matchedType);
        if (!definition) return { matched: false, reason: "definition_missing" };
        return shortcutMatch("board.add_widget", { definitionId: definition.definitionId }, 0.82, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "media_play_pause",
      match(normalized, raw, context) {
        const isPlay = /(播放|继续)/.test(normalized);
        const isPause = /(暂停|停一下)/.test(normalized);
        if (!isPlay && !isPause) return { matched: false, reason: "not_media_control" };
        const targetType = raw.includes("电视") ? "tv" : raw.includes("音乐") || raw.includes("歌") ? "music" : "";
        const widget = targetType ? findWidgetByType(context, targetType) : context.focusedWidget;
        if (!widget || !["tv", "music", "recorder"].includes(widget.type)) {
          return { matched: false, reason: "media_target_missing" };
        }
        return shortcutMatch(
          `${widget.type}.${isPause ? "pause" : "play"}`,
          { widgetId: widget.widgetId },
          0.86,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "fullscreen",
      match(normalized, raw, context) {
        if (!/(全屏|放大)/.test(normalized)) return { matched: false, reason: "not_fullscreen" };
        const widget = context.focusedWidget ?? context.availableWidgets?.find((item) => item.recent);
        if (!widget) return { matched: false, reason: "fullscreen_target_missing" };
        return shortcutMatch("widget.fullscreen_focus", { widgetId: widget.widgetId }, 0.84, context.source ?? "shortcut", raw);
      }
    }
  ];

  return new IntentShortcutRouter(rules);
}

const WIDGET_TYPE_ALIASES: Array<{ type: string; aliases: string[] }> = [
  { type: "note", aliases: ["便签", "笔记"] },
  { type: "todo", aliases: ["待办", "任务", "清单"] },
  { type: "calculator", aliases: ["计算器", "计算"] },
  { type: "countdown", aliases: ["倒计时", "计时器"] },
  { type: "weather", aliases: ["天气"] },
  { type: "headline", aliases: ["新闻", "头条"] },
  { type: "market", aliases: ["指数", "行情", "市场"] },
  { type: "music", aliases: ["音乐", "歌曲"] },
  { type: "tv", aliases: ["电视", "直播", "频道"] },
  { type: "dialClock", aliases: ["时钟", "表盘"] },
  { type: "worldClock", aliases: ["世界时钟", "时区"] },
  { type: "clipboard", aliases: ["剪贴板"] },
  { type: "converter", aliases: ["换算", "单位"] },
  { type: "translate", aliases: ["翻译"] },
  { type: "messageBoard", aliases: ["留言板", "留言"] },
  { type: "recorder", aliases: ["录音", "录音机"] }
];

const ORDINALS: Array<{ pattern: RegExp; index: number }> = [
  { pattern: /(第\s*1\s*个|第一个|第一)/, index: 0 },
  { pattern: /(第\s*2\s*个|第二个|第二)/, index: 1 },
  { pattern: /(第\s*3\s*个|第三个|第三)/, index: 2 },
  { pattern: /(第\s*4\s*个|第四个|第四)/, index: 3 },
  { pattern: /(最后一个|最后)/, index: -1 }
];

function toResolvedTarget(widget: CompactWidgetSummary, confidence: number, reason: string): ResolvedWidgetTarget {
  return {
    widgetId: widget.widgetId,
    definitionId: widget.definitionId,
    type: widget.type,
    name: widget.name,
    confidence,
    reason
  };
}

function inferWidgetType(input: string) {
  return WIDGET_TYPE_ALIASES.find((entry) => entry.aliases.some((alias) => input.includes(alias)))?.type ?? "";
}

function inferOrdinalIndex(input: string) {
  return ORDINALS.find((entry) => entry.pattern.test(input))?.index ?? null;
}

function sortByBoardOrder(widgets: CompactWidgetSummary[]) {
  return [...widgets].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.widgetId.localeCompare(b.widgetId);
  });
}

function sortByRecent(context: WidgetTargetResolverContext, widgets: CompactWidgetSummary[]) {
  const recentIds = context.recentWidgetIds ?? [];
  return [...widgets].sort((a, b) => {
    const aFocused = context.focusedWidget?.widgetId === a.widgetId ? 0 : 1;
    const bFocused = context.focusedWidget?.widgetId === b.widgetId ? 0 : 1;
    if (aFocused !== bFocused) return aFocused - bFocused;

    const aRecentFlag = a.recent ? 0 : 1;
    const bRecentFlag = b.recent ? 0 : 1;
    if (aRecentFlag !== bRecentFlag) return aRecentFlag - bRecentFlag;

    const aRecentIndex = recentIds.includes(a.widgetId) ? recentIds.indexOf(a.widgetId) : Number.POSITIVE_INFINITY;
    const bRecentIndex = recentIds.includes(b.widgetId) ? recentIds.indexOf(b.widgetId) : Number.POSITIVE_INFINITY;
    if (aRecentIndex !== bRecentIndex) return aRecentIndex - bRecentIndex;

    return a.order - b.order;
  });
}

export class WidgetTargetResolver {
  resolve(input: string, context: WidgetTargetResolverContext): WidgetTargetResolution {
    const normalized = normalizeShortcutInput(input);
    const widgets = context.widgets;
    if (widgets.length === 0) {
      return { status: "not_found", message: "当前桌板没有可匹配的小工具" };
    }

    const inferredType = inferWidgetType(input);
    const ordinalIndex = inferOrdinalIndex(normalized);
    const candidatesByType = inferredType ? widgets.filter((widget) => widget.type === inferredType) : widgets;

    if (candidatesByType.length === 0 && inferredType) {
      return { status: "not_found", message: `当前桌板没有${input}对应的小工具` };
    }

    if (ordinalIndex !== null) {
      const ordered = sortByBoardOrder(candidatesByType);
      const widget = ordinalIndex === -1 ? ordered[ordered.length - 1] : ordered[ordinalIndex];
      if (!widget) {
        return { status: "not_found", message: "没有找到对应顺序的小工具" };
      }
      return { status: "resolved", target: toResolvedTarget(widget, 0.92, "matched_by_order") };
    }

    if (/(那个|这个|当前|正在|最近)/.test(normalized)) {
      const recent = sortByRecent(context, candidatesByType);
      const top = recent[0];
      if (!top) {
        return { status: "not_found", message: "没有找到最近的小工具" };
      }
      if (!inferredType && recent.length > 1 && context.focusedWidget?.widgetId !== top.widgetId && !top.recent) {
        return {
          status: "needs_clarification",
          message: "你指的是哪一个小工具？",
          candidates: recent.slice(0, 4).map((widget) => toResolvedTarget(widget, 0.45, "ambiguous_recent_reference"))
        };
      }
      return { status: "resolved", target: toResolvedTarget(top, inferredType ? 0.88 : 0.76, "matched_by_recent") };
    }

    const textMatches = widgets.filter((widget) => {
      const text = `${widget.name} ${widget.type} ${widget.summary}`.toLowerCase();
      return normalized
        .split(" ")
        .filter((part) => part.length >= 2)
        .some((part) => text.includes(part));
    });

    if (textMatches.length === 1) {
      return { status: "resolved", target: toResolvedTarget(textMatches[0], 0.72, "matched_by_text") };
    }
    if (textMatches.length > 1) {
      return {
        status: "needs_clarification",
        message: "匹配到多个小工具，请说得更具体一点",
        candidates: textMatches.slice(0, 4).map((widget) => toResolvedTarget(widget, 0.5, "ambiguous_text_match"))
      };
    }

    if (inferredType && candidatesByType.length === 1) {
      return { status: "resolved", target: toResolvedTarget(candidatesByType[0], 0.82, "matched_by_type") };
    }

    if (inferredType && candidatesByType.length > 1) {
      return {
        status: "needs_clarification",
        message: "匹配到多个同类小工具，请指定第几个或最近的那个",
        candidates: sortByRecent(context, candidatesByType)
          .slice(0, 4)
          .map((widget) => toResolvedTarget(widget, 0.55, "ambiguous_type_match"))
      };
    }

    return { status: "not_found", message: "没有找到匹配的小工具" };
  }
}
