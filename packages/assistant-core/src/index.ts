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

export interface IntentShortcutRule {
  name: string;
  match: (normalizedInput: string, rawInput: string, context: IntentShortcutContext) => IntentShortcutResult;
}

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
            { widgetId: widget.widgetId, cityName },
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
            "countdown.set_duration",
            { widgetId: widget.widgetId, durationSeconds: minutes * 60, start: true },
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
