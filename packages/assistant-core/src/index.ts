export * from "./realtimeConfig";
export * from "./moduleRegistry";
export * from "./commandPlanner";
export * from "./previewGate";
export * from "./commandExecutor";
export * from "./runtimeBudget";
export * from "./outbox";
export * from "./learningSystem";
export * from "./aiModuleReview";
export * from "./moduleTestRunner";
export * from "./commandPolicy";
export * from "./shortcutDeferralPolicy";

export type AssistantActionRisk = "safe" | "confirm" | "destructive";

export type AssistantToolSource = "shortcut" | "realtime" | "text" | "learned" | "test";

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
  argumentKeys?: string[];
  resultSchema?: unknown;
  idempotency?: "idempotent" | "repeatable" | "stateful" | "destructive";
  missingArgPolicy?: "ask" | "use_default" | "fail";
  requiresAuth?: boolean;
  requiresPermission?: string[];
  concurrencyKey?: string;
  examples?: string[];
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
  preview?: unknown;
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
  operationId?: string;
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
  currentTime?: string;
  boardId?: string;
  boardName?: string;
  availableBoards?: CompactBoardSummary[];
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

export interface CompactBoardSummary {
  boardId: string;
  name: string;
  active?: boolean;
}

export interface CompactAssistantContext {
  contextVersion?: string;
  toolCatalogVersion?: string;
  boardId?: string;
  boardName?: string;
  availableBoards?: CompactBoardSummary[];
  availableDefinitions?: Array<{
    definitionId: string;
    type: string;
    name: string;
  }>;
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
  availableBoards?: CompactBoardSummary[];
  availableDefinitions?: Array<{
    definitionId: string;
    type: string;
    name: string;
  }>;
  widgets: WidgetContextSnapshot[];
  focusedWidgetId?: string;
  recentWidgetIds?: string[];
  pendingConfirmation?: ConfirmationRequest;
  maxWidgets?: number;
}

function stableAssistantContextValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stableAssistantContextValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "contextVersion" && key !== "toolCatalogVersion")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableAssistantContextValue(item)])
    );
  }
  return value;
}

function hashStableAssistantContext(value: unknown): string {
  const text = JSON.stringify(stableAssistantContextValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createCompactAssistantContextVersion(context: Omit<CompactAssistantContext, "contextVersion">): string {
  return `ctx_${hashStableAssistantContext(context)}`;
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
    if (parsed.success === false) {
      return {
        status: "failed",
        message: formatSchemaError(parsed.error),
        errorCode: "INVALID_ARGUMENTS"
      };
    }

    try {
      return (await action.execute(parsed.data, {
        now: context.now ?? defaultNow,
        operationId: context.operationId,
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

  getMountedWidgetDetailTools(widgetTypes: string[]): AssistantToolSpec[] {
    const mountedTypes = new Set(widgetTypes.filter(Boolean));
    return this.filterTools(
      (tool) =>
        tool.scope === "desktop" ||
        tool.scope === "widget-selection" ||
        (tool.scope === "widget-detail" && Boolean(tool.widgetType && mountedTypes.has(tool.widgetType)))
    );
  }

  getActiveTools(): AssistantToolSpec[] {
    return this.filterTools((tool) => tool.scope !== "deferred");
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

    const compactContext: Omit<CompactAssistantContext, "contextVersion"> = {
      boardId: input.boardId,
      boardName: input.boardName,
      availableBoards: input.availableBoards,
      availableDefinitions: input.availableDefinitions,
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
    return {
      contextVersion: createCompactAssistantContextVersion(compactContext),
      ...compactContext
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

type StrictObjectFieldType = "string" | "number" | "boolean" | "object" | "array" | "unknown";

export interface StrictObjectField {
  type: StrictObjectFieldType | StrictObjectFieldType[];
  required?: boolean;
  enum?: unknown[];
}

export type StrictObjectShape = Record<string, StrictObjectField>;

function isStrictObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesStrictFieldType(value: unknown, type: StrictObjectFieldType): boolean {
  if (type === "unknown") return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isStrictObjectRecord(value);
  return typeof value === type;
}

export function createStrictObjectSchema<T extends Record<string, unknown> = Record<string, unknown>>(
  shape: StrictObjectShape
): AssistantParameterSchema<T> & { argumentKeys: string[]; jsonSchema: Record<string, unknown> } {
  const argumentKeys = Object.keys(shape);
  return {
    argumentKeys,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: argumentKeys.filter((key) => shape[key]?.required),
      properties: Object.fromEntries(
        argumentKeys.map((key) => {
          const field = shape[key]!;
          const type = Array.isArray(field.type) ? field.type : [field.type];
          return [
            key,
            {
              type: type.length === 1 ? type[0] : type,
              ...(field.enum ? { enum: field.enum } : {})
            }
          ];
        })
      )
    },
    safeParse(value) {
      if (!isStrictObjectRecord(value)) {
        return { success: false, error: { issues: [{ message: "参数必须是对象" }] } };
      }
      const extraKeys = Object.keys(value).filter((key) => !argumentKeys.includes(key));
      if (extraKeys.length > 0) {
        return {
          success: false,
          error: { issues: extraKeys.map((key) => ({ path: [key], message: "未声明参数" })) }
        };
      }
      const issues: AssistantSchemaParseFailure["error"]["issues"] = [];
      for (const [key, field] of Object.entries(shape)) {
        const current = value[key];
        if (current === undefined) {
          if (field.required) issues.push({ path: [key], message: "参数必填" });
          continue;
        }
        const types = Array.isArray(field.type) ? field.type : [field.type];
        if (!types.some((type) => matchesStrictFieldType(current, type))) {
          issues.push({ path: [key], message: `参数类型必须是 ${types.join(" 或 ")}` });
          continue;
        }
        if (field.enum && !field.enum.includes(current)) {
          issues.push({ path: [key], message: "参数不在允许范围内" });
        }
      }
      if (issues.length > 0) {
        return { success: false, error: { issues } };
      }
      return { success: true, data: value as T };
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

function compactShortcutInput(input: string) {
  return input.replace(/[\s，。！？、,.!?]+/g, "");
}

const CLOSE_SHORTCUT_INTENT_PATTERN = /(关闭|关掉|关上|关了|收起|删掉|删除|移除|去掉|关)/;

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
  if (normalized === "十") return 10;
  const tens = normalized.match(/^十([一二两三四五六七八九])$/);
  if (tens) return 10 + (map[tens[1]!] ?? 0);
  const compound = normalized.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
  if (compound) return (map[compound[1]!] ?? 0) * 10 + (compound[2] ? (map[compound[2]] ?? 0) : 0);
  if (normalized.includes("十五")) return 15;
  if (normalized.includes("二十") || normalized.includes("两十")) return 20;
  if (normalized.includes("三十")) return 30;
  for (const [word, value] of Object.entries(map)) {
    if (normalized.includes(word)) return value;
  }
  return null;
}

function parseNumberToken(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return parseChineseInteger(normalized);
}

function inferCityName(input: string) {
  const normalized = input.trim();
  if (/(^|[^a-z])la(?=[^a-z]|$)/i.test(normalized)) return "los-angeles";
  const knownCities: Array<[string, string]> = [
    ["北京", "北京"],
    ["帝都", "北京"],
    ["首都", "北京"],
    ["上海", "上海"],
    ["魔都", "上海"],
    ["大连", "大连"],
    ["广州", "广州"],
    ["羊城", "广州"],
    ["深圳", "深圳"],
    ["鹏城", "深圳"],
    ["杭州", "杭州"],
    ["杭城", "杭州"],
    ["成都", "成都"],
    ["蓉城", "成都"],
    ["武汉", "武汉"],
    ["荆州", "荆州"],
    ["重庆", "重庆"],
    ["山城", "重庆"],
    ["南京", "南京"],
    ["西安", "西安"],
    ["洛杉矶", "洛杉矶"],
    ["洛城", "los-angeles"],
    ["los-angeles", "los-angeles"],
    ["波士顿", "波士顿"],
    ["boston", "boston"]
  ];
  const lower = normalized.toLowerCase();
  const known = knownCities.find(([alias]) => lower.includes(alias.toLowerCase()));
  if (known) return known[1];
  const beforeWeather = normalized.match(/([\u4e00-\u9fa5a-zA-Z-]{2,24})\s*(?:天气|weather)/i);
  const candidate = cleanCommandContent(beforeWeather?.[1] ?? "")
    .replace(/^(帮我查一下|帮我查|查一下|查查|查询|切换到|切到|聚焦|再打开一个|再打开|打开一个|打开|显示|看看|看|查)/, "")
    .replace(/^(一个|一下|个|小工具|窗口|卡片|面板)/, "");
  if (!candidate || /^(天气|weather|小工具|窗口|卡片|面板)$/i.test(candidate)) return "";
  return cleanCommandContent(candidate);
}

function inferTvChannelName(input: string) {
  const cctv = input.match(/CCTV\s*[\w+-]+/i);
  if (cctv) return cctv[0].replace(/\s+/g, "").toUpperCase();
  const aliases: Array<[RegExp, string]> = [
    [/(央视|中央|CCTV)\s*(综合|一套|1套|一频道|1频道)/i, "CCTV1"],
    [/(央视|中央|CCTV)\s*(财经|二套|2套|二频道|2频道)/i, "CCTV2"],
    [/(央视|中央|CCTV)\s*(综艺|三套|3套|三频道|3频道)/i, "CCTV3"],
    [/(央视|中央|CCTV)\s*(中文国际|四套|4套|四频道|4频道)/i, "CCTV4"],
    [/(央视|中央|CCTV)\s*(体育|五套|5套|五频道|5频道|体育频道)/i, "CCTV5"],
    [/(央视|中央|CCTV)\s*(电影|六套|6套|六频道|6频道|电影频道)/i, "CCTV6"],
    [/(央视|中央|CCTV)\s*(电视剧|八套|8套|八频道|8频道|电视剧频道)/i, "CCTV8"],
    [/(央视|中央|CCTV)\s*(新闻|十三套|13套|十三频道|13频道|新闻频道)/i, "CCTV13"],
    [/(央视|中央|CCTV)\s*(少儿|十四套|14套|十四频道|14频道|少儿频道)/i, "CCTV14"],
    [/(新闻频道|央视新闻|中央新闻|CCTV新闻)/i, "CCTV13"],
    [/(体育频道|央视体育|中央体育|CCTV体育)/i, "CCTV5"],
    [/(财经频道|央视财经|中央财经|CCTV财经)/i, "CCTV2"],
    [/(电影频道|央视电影|中央电影|CCTV电影)/i, "CCTV6"],
    [/(电视剧频道|央视电视剧|中央电视剧|CCTV电视剧)/i, "CCTV8"],
    [/(少儿频道|央视少儿|中央少儿|CCTV少儿)/i, "CCTV14"]
  ];
  const known = aliases.find(([pattern]) => pattern.test(input));
  if (known) return known[1];
  const cctvCn = input.match(/(?:央视|中央)\s*(?:第)?\s*([\d一二三四五六七八九十]+)\s*(?:套|频道)?/);
  const channelNumber = cctvCn?.[1] ? parseChineseInteger(cctvCn[1]) : null;
  if (channelNumber) return `CCTV${channelNumber}`;
  return "";
}

function inferMusicQuery(input: string) {
  const query = input
    .replace(/(播放|搜索|搜|查找|找一下|找|来一首|放一首|放首|放点|放个|放些|听一下|听|音乐播放器|音乐|歌曲|歌单|专辑|歌手|歌|第一首|第一条|第一个|首个|一下|给我|帮我|麻烦|麻烦你)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(一点|一些|几首|几首?|来点|来些|轻一点的|轻松一点的)\s*/g, "")
    .replace(/^([^\s的]{1,24})的(.+)$/g, "$1 $2")
    .replace(/的\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const artistPrefixes = ["陈奕迅", "王菲", "周杰伦", "林俊杰", "五月天", "孙燕姿", "张学友", "刘德华"];
  const artist = artistPrefixes.find((prefix) => query.startsWith(prefix) && query.length > prefix.length && !query.startsWith(`${prefix} `));
  return artist ? `${artist} ${query.slice(artist.length).trim()}` : query;
}

function inferMusicKind(input: string): "song" | "album" | "playlist" | undefined {
  if (/(歌单|播放列表|playlist)/i.test(input)) return "playlist";
  if (/(专辑|album)/i.test(input)) return "album";
  if (/(歌曲|单曲|song)/i.test(input)) return "song";
  return undefined;
}

function inferMusicResultIndex(input: string) {
  if (/(第一首|第一条|第一个|首个)/.test(input)) return 0;
  if (/(第二首|第二条|第二个)/.test(input)) return 1;
  if (/(第三首|第三条|第三个)/.test(input)) return 2;
  const numbered = input.match(/第\s*(\d+)\s*(?:首|条|个)/);
  if (!numbered) return undefined;
  const index = Number(numbered[1]);
  return Number.isInteger(index) && index > 0 ? index - 1 : undefined;
}

function inferMusicArgs(input: string) {
  const query = inferMusicQuery(input);
  const kind = inferMusicKind(input);
  const resultIndex = inferMusicResultIndex(input);
  return {
    ...(query ? { query } : {}),
    ...(kind ? { kind } : {}),
    ...(resultIndex !== undefined ? { resultIndex } : {})
  };
}

function inferMessageBoardText(input: string) {
  const quoted = input.match(/[「“"']([^」”"']+)[」”"']/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const afterColon = input.match(/[：:]\s*(.+)$/);
  if (afterColon?.[1]?.trim()) return afterColon[1].trim();

  const explicit = input.match(
    /(?:留言板|留言区|消息板).*?(?:发一下|发一条|发一句|发送|发|说一下|说一句|说|写一条|写一句|写|发布|留言)(?:一条|一句|一下|消息|内容)?\s*(.+)$/
  );
  if (explicit?.[1]?.trim()) return explicit[1].replace(/[，。,.]+$/g, "").trim();

  const broad = input.match(/(?:给大家留言|留言|给大家说|跟大家说|公告一下|通知一下)(?:一条|一句|一下|一声|消息|内容)?\s*(.+)$/);
  if (broad?.[1]?.trim()) return broad[1].replace(/[，。,.]+$/g, "").trim();

  return input
    .replace(/^(请|帮我|麻烦|麻烦你|可以)?\s*/, "")
    .replace(/(在|到|往|给)?\s*(留言板|留言区|消息板|留言|给大家|跟大家)\s*(里|上|中|给大家)?/g, " ")
    .replace(/(发一下|发一条|发一句|发送|发|说一下|说一句|说一声|说|写一条|写一句|写|发布|公告一下|通知一下|留一条言|留个言)/g, " ")
    .replace(/(一条|一句|一下|消息|内容)/g, " ")
    .replace(/[，。,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getShortcutNow(context: IntentShortcutContext) {
  const parsed = context.currentTime ? new Date(context.currentTime) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), 0, 0);
}

function parseTodoHour(token: string) {
  const value = parseChineseInteger(token);
  return value === null || value < 0 || value > 24 ? null : value;
}

function parseTodoMinute(token: string | undefined) {
  if (!token) return 0;
  if (token.includes("半")) return 30;
  if (token.includes("一刻")) return 15;
  if (token.includes("三刻")) return 45;
  const value = parseChineseInteger(token);
  return value === null || value < 0 || value > 59 ? null : value;
}

const WEEKDAY_INDEX: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
};

function resolveWeekdayDate(now: Date, token: string, nextWeek: boolean) {
  const targetDay = WEEKDAY_INDEX[token];
  if (targetDay === undefined) return undefined;
  const currentDay = now.getDay();
  if (nextWeek) {
    const daysFromCurrentToThisMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const targetOffsetFromMonday = targetDay === 0 ? 6 : targetDay - 1;
    return addDays(now, daysFromCurrentToThisMonday + 7 + targetOffsetFromMonday);
  }
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(now, delta);
}

function inferTodoDueAt(input: string, now: Date) {
  const compact = input.replace(/\s+/g, "");
  if (/一会儿后?|待会儿后?|等会儿后?/.test(compact)) {
    return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  }
  const explicitDate = compact.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
  const slashDate = compact.match(/(?<!\d)(\d{1,2})[\/.-](\d{1,2})(?!\d)/);
  const daysLater = compact.match(/([零〇一二两三四五六七八九十\d]{1,3})天后/);
  const weekday = compact.match(/(?:(下)(?:周|星期|礼拜)|(?:周|星期|礼拜))([日天一二两三四五六])/);
  const timeMatch =
    compact.match(/(?:(凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚))?([零〇一二两三四五六七八九十\d]{1,3})点(?:(半|一刻|三刻|[零〇一二两三四五六七八九十\d]{1,3})分?)?/) ??
    compact.match(/(?:(凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚))?(\d{1,2})[:：]([0-5]\d)/);

  if (!timeMatch) {
    const relativeSeconds = /(小时|钟头|分钟|分)(?:半)?(?:以)?后|秒(?:以)?后/.test(compact) ? parseCountdownDurationSeconds(compact) : undefined;
    if (!relativeSeconds || !Number.isFinite(relativeSeconds) || relativeSeconds <= 0) return undefined;
    return new Date(now.getTime() + relativeSeconds * 1000).toISOString();
  }

  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();

  if (explicitDate) {
    year = explicitDate[1] ? Number(explicitDate[1]) : year;
    month = Number(explicitDate[2]) - 1;
    day = Number(explicitDate[3]);
  } else if (slashDate) {
    month = Number(slashDate[1]) - 1;
    day = Number(slashDate[2]);
  } else if (daysLater) {
    const dayCount = parseChineseInteger(daysLater[1] ?? "");
    if (!dayCount || dayCount < 0) return undefined;
    const next = addDays(now, dayCount);
    year = next.getFullYear();
    month = next.getMonth();
    day = next.getDate();
  } else if (weekday) {
    const next = resolveWeekdayDate(now, weekday[2] ?? "", Boolean(weekday[1]));
    if (!next) return undefined;
    year = next.getFullYear();
    month = next.getMonth();
    day = next.getDate();
  } else if (/(明天|明早|明晚)/.test(compact)) {
    const next = addDays(now, 1);
    year = next.getFullYear();
    month = next.getMonth();
    day = next.getDate();
  } else if (/后天/.test(compact)) {
    const next = addDays(now, 2);
    year = next.getFullYear();
    month = next.getMonth();
    day = next.getDate();
  }

  const period = timeMatch[1] ?? "";
  let hour = parseTodoHour(timeMatch[2] ?? "");
  const minute = parseTodoMinute(timeMatch[3]);
  if (hour === null || minute === null) return undefined;

  if (/(下午|晚上|今晚|傍晚|夜里|明晚)/.test(period) && hour < 12) hour += 12;
  if (/中午/.test(period) && hour < 11) hour += 12;
  if (hour === 24) hour = 0;

  let due = new Date(year, month, day, hour, minute, 0, 0);
  if (!explicitDate && !slashDate && !/(今天|明天|明早|明晚|后天|今晚)/.test(compact) && due.getTime() <= now.getTime()) {
    due = addDays(due, 1);
  }
  return due.toISOString();
}

function stripTodoDueText(text: string) {
  return text
    .replace(/(?:[零〇一二两三四五六七八九十\d]+|半)(?:个)?(?:小时|钟头)(?:(?:[零〇一二两三四五六七八九十\d]+|半)(?:分钟|分))?(?:以)?后/g, " ")
    .replace(/(?:[零〇一二两三四五六七八九十\d]+|半)(?:个)?(?:分钟|分)(?:半)?(?:以)?后/g, " ")
    .replace(/(?:[零〇一二两三四五六七八九十\d]+|半)(?:个)?秒(?:以)?后/g, " ")
    .replace(/(一会儿后?|待会儿后?|等会儿后?)/g, " ")
    .replace(/(?:(?:今天|明天|后天|今晚|明早|明晚|[零〇一二两三四五六七八九十\d]{1,3}天后|(?:(?:下)?(?:周|星期|礼拜)[日天一二两三四五六]))\s*)?(?:凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚)?\s*[零〇一二两三四五六七八九十\d]{1,3}\s*点\s*(?:半|一刻|三刻|[零〇一二两三四五六七八九十\d]{1,3}\s*分?)?\s*(?:之前|以前|前(?!端))/g, " ")
    .replace(/(?:(?:今天|明天|后天|今晚|明早|明晚|[零〇一二两三四五六七八九十\d]{1,3}天后|(?:(?:下)?(?:周|星期|礼拜)[日天一二两三四五六]))\s*)?(?:凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚)?\s*\d{1,2}\s*[:：]\s*[0-5]\d\s*(?:之前|以前|前(?!端))/g, " ")
    .replace(/(?:(?:今天|明天|后天|今晚|明早|明晚|[零〇一二两三四五六七八九十\d]{1,3}天后|(?:(?:下)?(?:周|星期|礼拜)[日天一二两三四五六]))\s*)?(?:凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚)?\s*[零〇一二两三四五六七八九十\d]{1,3}\s*点\s*(?:半|一刻|三刻|[零〇一二两三四五六七八九十\d]{1,3}\s*分?)?/g, " ")
    .replace(/(?:(?:今天|明天|后天|今晚|明早|明晚|[零〇一二两三四五六七八九十\d]{1,3}天后|(?:(?:下)?(?:周|星期|礼拜)[日天一二两三四五六]))\s*)?(?:凌晨|早上|上午|中午|下午|晚上|今晚|傍晚|夜里|明早|明晚)?\s*\d{1,2}\s*[:：]\s*[0-5]\d/g, " ")
    .replace(/(?:(?:\d{4})年)?\d{1,2}月\d{1,2}[日号]?/g, " ")
    .replace(/(?<!\d)\d{1,2}[\/.-]\d{1,2}(?!\d)/g, " ")
    .replace(/(今天|明天|后天|今晚|明早|明晚|[零〇一二两三四五六七八九十\d]{1,3}天后|(?:(?:下)?(?:周|星期|礼拜)[日天一二两三四五六]))/g, " ")
    .replace(/(截止|到时候|的时候|之前|以前|提醒我|提醒|到点叫我|叫我|记得|别忘了)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCountdownDurationSeconds(input: string) {
  const compact = input.replace(/\s+/g, "").replace(/以后/g, "后");
  let totalSeconds = 0;
  const unitPattern = /([零〇一二两三四五六七八九十\d]+|半)(?:个)?(小时|钟头|分钟|分|秒)/g;
  for (const match of compact.matchAll(unitPattern)) {
    const token = match[1] ?? "";
    const unit = match[2] ?? "";
    const value = token === "半" ? 0.5 : parseChineseInteger(token);
    if (value === null || value <= 0) continue;
    if (unit === "小时" || unit === "钟头") totalSeconds += value * 3600;
    if (unit === "分钟" || unit === "分") totalSeconds += value * 60;
    if (unit === "秒") totalSeconds += value;
  }
  if (/(小时|钟头)半/.test(compact)) totalSeconds += 30 * 60;
  if (/(分钟|分)半/.test(compact)) totalSeconds += 30;
  if (totalSeconds > 0) return Math.round(totalSeconds);
  const minutes = parseChineseInteger(compact);
  return minutes && Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : undefined;
}

function cleanBoardName(value: string) {
  return value
    .replace(/^(一个|一张|新的|新|空白|的)+/, "")
    .replace(/(桌板|桌面|面板)$/, "")
    .trim();
}

function inferNamedBoard(raw: string) {
  const quoted = raw.match(/[「“"']([^」”"']+)[」”"']/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const explicit = raw.match(/(?:名为|命名为|改名为|重命名为|叫做|叫成|叫)\s*([^，。,.]+)/);
  if (explicit?.[1]?.trim()) return explicit[1].trim();

  const createPrefix = raw.match(/(?:新建|创建|新增|添加)(?:一个|一张)?\s*([^，。,.]*?)(?:桌板|桌面|面板)/);
  if (createPrefix?.[1]?.trim()) return cleanBoardName(createPrefix[1]);

  return "";
}

function inferBoardSwitchName(raw: string) {
  const named = inferNamedBoard(raw);
  if (named) return named;
  const switchTarget = raw.match(/(?:切换到|切到|打开|进入|回到|回|去)\s*([^，。,.]+)/);
  if (switchTarget?.[1]?.trim()) return cleanBoardName(switchTarget[1]);
  return "";
}

function findBoardByName(context: IntentShortcutContext, rawName: string) {
  const name = cleanBoardName(rawName);
  if (!name) return null;
  return (
    context.availableBoards?.find((board) => board.name === name) ??
    context.availableBoards?.find((board) => cleanBoardName(board.name) === name) ??
    context.availableBoards?.find((board) => board.name.includes(name) || name.includes(cleanBoardName(board.name))) ??
    null
  );
}

function cleanCommandContent(value: string) {
  return value
    .replace(/^[：:，,\s]+/, "")
    .replace(/[，,\s]*场景\d+$/i, "")
    .replace(/[。.!！\s]+$/, "")
    .trim();
}

function inferNoteContent(raw: string) {
  const patterns = [
    /(?:请|帮我|麻烦|麻烦你)?\s*(?:记个|写个|开个|新建个|新增个|添加个)(?:便签|笔记)[：:\s]*(.+)/,
    /(?:请|帮我|麻烦|麻烦你)?\s*(?:记一下|记下|记录一下|写一下|记一笔)[：:\s]*(.+)/,
    /(?:便签|笔记).*(?:写|记录|记下|添加|追加)(?:一下|一个|一条)?[：:\s]*(.+)/,
    /(?:写|记录|记下|添加|追加)(?:到|进)?(?:便签|笔记)[：:\s]*(.+)/,
    /把(.+?)(?:写|记录|记下|添加|追加)(?:到|进)?(?:便签|笔记)/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const content = cleanCommandContent(match?.[1] ?? "");
    if (content) return content;
  }
  return "";
}

function inferTodoText(raw: string) {
  const patterns = [
    /(?:添加|新增|记下|记录|加入)(?:一个|一条)?(?:待办|任务|清单)[：:\s]*(.+)/,
    /(?:待办|任务|清单).*(?:添加|新增|记下|记录|加入)(?:一个|一条)?[：:\s]*(.+)/,
    /(?:提醒我|提醒|记得|别忘了)[：:\s]*(.+)/,
    /(.+?)(?:提醒我|提醒|叫我)[：:\s]*(.+)/,
    /把(.+?)(?:添加|新增|记下|记录|加入)(?:到|进)?(?:待办|任务|清单)/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const text = cleanCommandContent([match?.[1], match?.[2]].filter(Boolean).join(" "));
    if (text) return text;
  }
  return "";
}

function inferTodoAdd(raw: string, now: Date) {
  let inferredText = inferTodoText(raw);
  const rawDueAt = inferTodoDueAt(raw, now);
  if (rawDueAt && /^(我|俺)$/.test(inferredText) && /(提醒我|叫我|到点叫我)/.test(raw)) {
    inferredText = "";
  }
  const dueAt = rawDueAt ?? inferTodoDueAt(inferredText, now);
  const fallbackReminderText = rawDueAt && /叫我|到点叫我/.test(raw) ? "叫我" : rawDueAt && /(提醒我|提醒|记得|别忘了)/.test(raw) ? "提醒我" : "";
  const text = inferredText || fallbackReminderText;
  const cleaned = dueAt && inferredText ? stripTodoDueText(inferredText) : text;
  return { text: cleanCommandContent(cleaned) || cleanCommandContent(fallbackReminderText) || cleanCommandContent(text), dueAt };
}

function inferTodoCompleteText(raw: string) {
  const patterns = [
    /(?:完成|做完|办完|勾掉|勾选|删除|移除|去掉)(?:一个|一条)?(?:待办|任务|清单)[：:\s]*(.+)/,
    /(?:待办|任务|清单).*(?:完成|做完|办完|勾掉|勾选|删除|移除|去掉)(?:一个|一条)?[：:\s]*(.+)/,
    /把(.+?)(?:标记为已完成|标记完成|设为完成|完成|做完|办完|勾掉|勾选|删除|移除|去掉)(?:待办|任务|清单)?/,
    /(?:完成|做完|办完|勾掉|勾选|标记完成|标记为已完成)\s*(.+)/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const text = cleanCommandContent(match?.[1] ?? "").replace(/(?:这)?(?:一)?(?:项|条|个)$/, "").trim();
    if (text) return text;
  }
  return "";
}

function inferClipboardText(raw: string) {
  const patterns = [
    /(?:固定|置顶|钉住|pin)?\s*(?:保存|存一下|存|加入|添加|记录|复制|拷贝)(?:到|进)?(?:剪贴板|剪贴板历史)[：:\s]*(.+)/i,
    /(?:剪贴板|剪贴板历史).*(?:固定|置顶|钉住|pin)?\s*(?:保存|存一下|存|加入|添加|记录|复制|拷贝)[：:\s]*(.+)/i,
    /(?:固定|置顶|钉住|pin)?\s*(?:复制|拷贝|保存|存一下|存)\s*(.+?)(?:到|进)?(?:剪贴板|剪贴板历史)/i,
    /把(.+?)(?:固定|置顶|钉住|pin)?\s*(?:保存|存一下|存|加入|添加|记录|复制|拷贝)(?:到|进)?(?:剪贴板|剪贴板历史)/i,
    /(?:固定|置顶|钉住|pin)\s*(?:保存|存一下|存|记录)\s*(.+)/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const text = cleanCommandContent(match?.[1] ?? "");
    if (text) return text;
  }
  return "";
}

function inferClipboardPinned(raw: string) {
  return /(固定|置顶|钉住|pin)/i.test(raw);
}

function inferDefaultTranslateTarget(sourceText: string) {
  return /[\u4e00-\u9fa5]/.test(sourceText) ? "en" : "zh-CN";
}

function normalizeTranslateTarget(raw: string, sourceText = "") {
  if (/(英文|英语|en)/i.test(raw)) return "en";
  if (/(中文|汉语|zh)/i.test(raw)) return "zh-CN";
  return inferDefaultTranslateTarget(sourceText);
}

function inferTranslateDraft(raw: string) {
  const meaning = raw.match(/(?:帮我|请|麻烦|麻烦你)?\s*(?:看下|看看|查一下|查查|查)?\s*(.+?)(?:是什么意思|什么意思|啥意思)\s*$/);
  const meaningSource = cleanCommandContent(meaning?.[1] ?? "");
  if (meaningSource) return { sourceText: meaningSource, targetLang: "zh-CN" };

  const patterns = [
    /(?:把)?(.+?)(?:翻译)(?:成|为|到)?(英文|英语|中文|汉语|en|zh-CN)?$/,
    /翻译(?:一下)?[：:\s]*(.+?)(?:成|为|到)(英文|英语|中文|汉语|en|zh-CN)$/,
    /(?:把)(.+?)(?:翻译)?(?:成|为|到)(英文|英语|中文|汉语|en|zh-CN)$/,
    /翻译(?:一下)?[：:\s]*(.+)$/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const sourceText = cleanCommandContent(match?.[1] ?? "");
    if (!sourceText || /^(一下|翻译)$/.test(sourceText)) continue;
    return { sourceText, targetLang: normalizeTranslateTarget(match?.[2] ?? raw, sourceText) };
  }
  return null;
}

const UNIT_ALIASES: Record<string, { category: string; unit: string; scale?: number }> = {
  米: { category: "length", unit: "m" },
  m: { category: "length", unit: "m" },
  公里: { category: "length", unit: "km" },
  千米: { category: "length", unit: "km" },
  km: { category: "length", unit: "km" },
  厘米: { category: "length", unit: "cm" },
  cm: { category: "length", unit: "cm" },
  英寸: { category: "length", unit: "inch" },
  inch: { category: "length", unit: "inch" },
  英尺: { category: "length", unit: "ft" },
  ft: { category: "length", unit: "ft" },
  公斤: { category: "weight", unit: "kg" },
  千克: { category: "weight", unit: "kg" },
  斤: { category: "weight", unit: "kg", scale: 0.5 },
  kg: { category: "weight", unit: "kg" },
  克: { category: "weight", unit: "g" },
  两: { category: "weight", unit: "g", scale: 50 },
  g: { category: "weight", unit: "g" },
  磅: { category: "weight", unit: "lb" },
  lb: { category: "weight", unit: "lb" },
  盎司: { category: "weight", unit: "oz" },
  oz: { category: "weight", unit: "oz" },
  摄氏度: { category: "temperature", unit: "c" },
  摄氏: { category: "temperature", unit: "c" },
  华氏度: { category: "temperature", unit: "f" },
  华氏: { category: "temperature", unit: "f" },
  开尔文: { category: "temperature", unit: "k" }
};

function inferConverterArgs(raw: string) {
  const unitPattern = "(摄氏度|华氏度|开尔文|摄氏|华氏|公里|千米|厘米|英寸|英尺|公斤|千克|盎司|斤|两|米|克|磅|km|cm|inch|ft|kg|lb|oz|m|g)";
  const numberPattern = "([+-]?(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十]+))";
  const patterns = [
    new RegExp(`${numberPattern}\\s*${unitPattern}.*(?:换算|转换|转|到|成)\\s*${unitPattern}`, "i"),
    new RegExp(`${numberPattern}\\s*${unitPattern}\\s*(?:等于多少|是多少|有多少|等于|多少|是)\\s*${unitPattern}`, "i"),
    new RegExp(`(?:换算|转换)\\s*${numberPattern}\\s*${unitPattern}\\s*(?:到|成|为)\\s*${unitPattern}`, "i")
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const value = match[1];
    const numericValue = value ? parseNumberToken(value) : null;
    const from = UNIT_ALIASES[match[2]] ?? UNIT_ALIASES[match[2]?.toLowerCase() ?? ""];
    const to = UNIT_ALIASES[match[3]] ?? UNIT_ALIASES[match[3]?.toLowerCase() ?? ""];
    if (numericValue !== null && from && to && from.category === to.category) {
      if (to.scale && to.scale !== 1) continue;
      const scaledValue = from.scale ? numericValue * from.scale : numericValue;
      return {
        category: from.category,
        value: Number.isFinite(scaledValue) ? String(Number(scaledValue.toFixed(8))) : String(numericValue),
        fromUnit: from.unit,
        toUnit: to.unit
      };
    }
  }
  return null;
}

function evaluateArithmeticExpression(expression: string) {
  const normalized = expression
    .replace(/加上|加/g, "+")
    .replace(/减去|减/g, "-")
    .replace(/乘以|乘/g, "*")
    .replace(/除以|除/g, "/")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/，/g, "")
    .trim();
  if (!/^[\d+\-*/().\s]+$/.test(normalized) || !/[+\-*/]/.test(normalized)) return null;
  try {
    const value = Function(`"use strict"; return (${normalized});`)();
    return typeof value === "number" && Number.isFinite(value) ? String(Number(value.toFixed(8))) : null;
  } catch {
    return null;
  }
}

function inferCalculatorDisplay(raw: string) {
  const chineseExpression = raw.match(/([零〇一二两三四五六七八九十\d]+)\s*(加上|加|减去|减|乘以|乘|除以|除)\s*([零〇一二两三四五六七八九十\d]+)/);
  if (chineseExpression) {
    const left = parseNumberToken(chineseExpression[1] ?? "");
    const right = parseNumberToken(chineseExpression[3] ?? "");
    const op = chineseExpression[2] ?? "";
    if (left !== null && right !== null) {
      const value =
        op.includes("加") ? left + right :
        op.includes("减") ? left - right :
        op.includes("乘") ? left * right :
        op.includes("除") && right !== 0 ? left / right :
        null;
      if (value !== null && Number.isFinite(value)) return String(Number(value.toFixed(8)));
    }
  }
  const expression =
    raw.match(/([0-9][0-9+\-*/×÷().\s]+[0-9])/) ??
    raw.match(/([0-9][0-9+\-*/×÷().\s]*(?:加上|加|减去|减|乘以|乘|除以|除)[0-9+\-*/×÷().\s]*\d)/);
  const evaluated = expression ? evaluateArithmeticExpression(expression[1]) : null;
  if (evaluated) return evaluated;
  const display = raw.match(/(?:计算器)(?:显示|设为|输入)?[：:\s]*([+-]?\d+(?:\.\d+)?)/);
  return display?.[1] ?? "";
}

function inferMarketIndexCodes(raw: string) {
  const normalized = raw.toLowerCase();
  if (/(美股三大|三大美股|美股.*三大|三大.*美股)/.test(raw)) {
    return ["usINX", "usNDX", "usDJI"];
  }
  if (/(沪深|上证.*深|深.*上证|沪指.*深|深.*沪指)/.test(raw)) {
    return ["sh000001", "sz399001"];
  }
  if (/(A股|a股|中国股市|内地股市)/.test(raw)) {
    return ["sh000001", "sz399001"];
  }
  const pairs: Array<[RegExp, string]> = [
    [/(标普|标普500|S&P|sp500|spx|standard\s*&?\s*poor)/i, "usINX"],
    [/(纳指|纳斯达克|纳斯达克100|NDX|nasdaq|nasdaq\s*100)/i, "usNDX"],
    [/(道指|道琼斯|道琼斯工业|DJI|dow|dow\s*jones)/i, "usDJI"],
    [/(恒生|港股|HSI|hang\s*seng)/i, "hkHSI"],
    [/(上证|沪指|A股|a股|sh000001)/i, "sh000001"],
    [/(深成|深证|深证成指|sz399001)/i, "sz399001"]
  ];
  const matchedCodes = pairs.filter(([pattern]) => pattern.test(normalized)).map(([, code]) => code);
  if (matchedCodes.length > 0) return matchedCodes;
  if (/(美股|美国股市|美国市场)/.test(raw)) return ["usINX", "usNDX", "usDJI"];
  if (/(港股|香港股市|香港市场)/.test(raw)) return ["hkHSI"];
  return [];
}

function inferWorldClockZones(raw: string) {
  const lower = raw.toLowerCase();
  const pairs: Array<[string, string]> = [
    ["北京", "北京"],
    ["上海", "北京"],
    ["伦敦", "伦敦"],
    ["london", "伦敦"],
    ["纽约", "纽约"],
    ["nyc", "纽约"],
    ["new york", "纽约"],
    ["洛杉矶", "洛杉矶"],
    ["洛城", "洛杉矶"],
    ["los angeles", "洛杉矶"],
    ["巴黎", "巴黎"],
    ["paris", "巴黎"],
    ["柏林", "柏林"],
    ["berlin", "柏林"],
    ["东京", "东京"],
    ["tokyo", "东京"],
    ["首尔", "首尔"],
    ["汉城", "首尔"],
    ["seoul", "首尔"],
    ["新加坡", "新加坡"],
    ["singapore", "新加坡"],
    ["迪拜", "迪拜"],
    ["dubai", "迪拜"],
    ["悉尼", "悉尼"],
    ["sydney", "悉尼"]
  ];
  const zones = pairs
    .map(([alias, zone]) => ({ index: lower.indexOf(alias.toLowerCase()), zone }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.zone)
    .filter((zone, index, items) => items.indexOf(zone) === index);
  return zones.length > 0 ? zones : [];
}

function routeWidgetDetailOrAdd(
  context: IntentShortcutContext,
  raw: string,
  widgetType: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
  confidence: number
) {
  const widget = findWidgetByType(context, widgetType);
  if (widget) {
    return shortcutMatch(
      toolName,
      { widgetId: widget.widgetId, ...toolArguments },
      confidence,
      context.source ?? "shortcut",
      raw
    );
  }

  const definition = findDefinitionByType(context, widgetType);
  if (!definition) return null;
  return shortcutMatch(
    "board.add_widget",
    {
      definitionId: definition.definitionId,
      followUp: {
        name: toolName,
        arguments: toolArguments
      }
    },
    Math.max(0.7, confidence - 0.1),
    context.source ?? "shortcut",
    raw
  );
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
      name: "app_sidebar",
      match(normalized, raw, context) {
        const sidebar = /(侧栏|侧边栏|左边栏|左侧栏)/.test(normalized);
        if (!sidebar) return { matched: false, reason: "not_app_sidebar" };
        const wantsHide =
          /(藏|隐藏|收起|关掉|关闭).*(侧栏|侧边栏|左边栏|左侧栏)/.test(normalized) ||
          /(侧栏|侧边栏|左边栏|左侧栏).*(藏|隐藏|收起|关掉|关闭)/.test(normalized);
        const wantsShow =
          /(显示|打开|展开|恢复|重新显示).*(侧栏|侧边栏|左边栏|左侧栏)/.test(normalized) ||
          /(侧栏|侧边栏|左边栏|左侧栏).*(显示|打开|展开|恢复|重新显示)/.test(normalized);
        if (!wantsHide && !wantsShow) return { matched: false, reason: "app_sidebar_mode_missing" };
        return shortcutMatch("app.sidebar.set", { mode: wantsShow ? "show" : "hide" }, 0.96, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "app_fullscreen",
      match(normalized, raw, context) {
        const fullscreen = /(沉浸|普通窗口|小桌板.*全屏|页面.*全屏|窗口.*全屏|全屏.*小桌板|全屏.*页面|全屏.*窗口)/.test(normalized);
        if (!fullscreen) return { matched: false, reason: "not_app_fullscreen" };
        const wantsExit =
          /(退出|离开|关闭).*(全屏|沉浸)/.test(normalized) ||
          /(全屏|沉浸).*(退出|离开|关闭)/.test(normalized) ||
          /(回|恢复).*(普通窗口|普通模式)/.test(normalized);
        const wantsEnter = /(进入|打开|开启|切到|全屏|沉浸)/.test(normalized) && !wantsExit;
        if (!wantsExit && !wantsEnter) return { matched: false, reason: "app_fullscreen_mode_missing" };
        return shortcutMatch("app.fullscreen.set", { mode: wantsExit ? "exit" : "enter" }, 0.96, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "app_settings",
      match(normalized, raw, context) {
        if (!/(打开|显示|进入|调出).*(设置)|^(设置)$/.test(normalized)) {
          return { matched: false, reason: "not_app_settings" };
        }
        return shortcutMatch("app.settings.open", {}, 0.96, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "app_command_palette",
      match(normalized, raw, context) {
        const commandPalette =
          /(打开|显示|进入|调出).*(搜索|命令面板|指令面板|命令中心)/.test(normalized) ||
          /(搜索|命令面板|指令面板|命令中心).*(打开|显示|进入|调出)/.test(normalized);
        if (!commandPalette) return { matched: false, reason: "not_app_command_palette" };
        return shortcutMatch("app.command_palette.open", {}, 0.96, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "app_ai_dialog",
      match(normalized, raw, context) {
        const aiWidget = /(ai|AI|人工智能).*(小工具|组件|widget|生成|新建|创建)/i.test(raw);
        const createWidget = /(新建|创建|新增|生成|打开).*(ai|AI|人工智能).*(小工具|组件|widget)/i.test(raw);
        if (!aiWidget && !createWidget) return { matched: false, reason: "not_app_ai_dialog" };
        return shortcutMatch("app.ai_dialog.open", {}, 0.96, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "auto_align",
      match(normalized, raw, context) {
        if (/(整理|排列|对齐|收拾).*(桌面|桌板|小工具)|^(整理|排列|对齐|收拾)$/.test(normalized)) {
          return shortcutMatch("board.auto_align", {}, 0.94, context.source ?? "shortcut", raw);
        }
        return { matched: false, reason: "not_auto_align" };
      }
    },
    {
      name: "create_board",
      match(normalized, raw, context) {
        if (!/(新建|创建|新增|添加).*(桌板|桌面|面板)/.test(normalized)) {
          return { matched: false, reason: "not_create_board" };
        }
        const name = inferNamedBoard(raw);
        return shortcutMatch("board.create", name ? { name } : {}, 0.88, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "rename_board",
      match(normalized, raw, context) {
        if (
          !(
            /(重命名|改名|命名|叫做|叫成).*(桌板|桌面|面板|当前)/.test(normalized) ||
            /(桌板|桌面|面板|当前).*(重命名|改名|命名|叫做|叫成)/.test(normalized)
          )
        ) {
          return { matched: false, reason: "not_rename_board" };
        }
        if (!context.boardId) {
          return { matched: false, reason: "board_id_missing" };
        }
        const name = inferNamedBoard(raw);
        if (!name) {
          return { matched: false, reason: "board_name_missing" };
        }
        return shortcutMatch("board.rename", { boardId: context.boardId, name }, 0.88, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "switch_board",
      match(normalized, raw, context) {
        const board = findBoardByName(context, inferBoardSwitchName(raw));
        const explicitBoardSwitch = /(切换到|切到|打开|进入|回到).*(桌板|桌面|面板)/.test(normalized);
        const casualBoardSwitch = /^(回到|回|去|进入|切到|切换到)/.test(normalized) && Boolean(board);
        if (!explicitBoardSwitch && !casualBoardSwitch) {
          return { matched: false, reason: "not_switch_board" };
        }
        if (!board) {
          return { matched: false, reason: "board_target_missing" };
        }
        return shortcutMatch("board.switch", { boardId: board.boardId }, 0.88, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "open_weather",
      match(normalized, raw, context) {
        const cityName = inferCityName(raw);
        const weatherIntent =
          /(天气|weather)/i.test(normalized) ||
          (Boolean(cityName) && /(冷不冷|热不热|冷吗|热吗|气温|温度|下雨|雨|风大|适合出门|出门|穿什么|冷|热)/.test(normalized));
        if (!weatherIntent) return { matched: false, reason: "not_weather" };
        if (CLOSE_SHORTCUT_INTENT_PATTERN.test(normalized)) return { matched: false, reason: "weather_close_deferred" };
        const windowIntent = /(聚焦|切到|再打开|打开一个|打开天气|天气窗口|天气卡片)/.test(normalized);
        const widget = findWidgetByType(context, "weather");
        if (windowIntent && widget) {
          return shortcutMatch("widget.focus", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
        }
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
          const args = cityName
            ? {
                definitionId: definition.definitionId,
                followUp: {
                  name: "weather.set_city",
                  arguments: { city: cityName }
                }
              }
            : { definitionId: definition.definitionId };
          return shortcutMatch(
            "board.add_widget",
            args,
            cityName ? 0.9 : 0.92,
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
        if (!/(倒计时|计时器|定时|计时)/.test(normalized)) return { matched: false, reason: "not_countdown" };
        if (/(打开|再打开|聚焦|切到).*(倒计时|计时器)/.test(normalized) && !/[0-9一二两三四五六七八九十半\d]+\s*(秒|分钟|分|小时|钟)/.test(normalized)) {
          return { matched: false, reason: "countdown_window_intent" };
        }
        const totalSeconds = parseCountdownDurationSeconds(normalized);
        if (!totalSeconds || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
          return { matched: false, reason: "countdown_duration_missing" };
        }
        const widget = findWidgetByType(context, "countdown");
        if (widget) {
          return shortcutMatch(
            "countdown.set",
            { widgetId: widget.widgetId, totalSeconds, start: true },
            0.9,
            context.source ?? "shortcut",
            raw
          );
        }
        const definition = findDefinitionByType(context, "countdown");
        if (definition) {
          return shortcutMatch(
            "board.add_widget",
            {
              definitionId: definition.definitionId,
              followUp: {
                name: "countdown.set",
                arguments: { totalSeconds, start: true }
              }
            },
            0.9,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "countdown_target_missing" };
      }
    },
    {
      name: "countdown_control",
      match(normalized, raw, context) {
        if (!/(倒计时|计时器|定时器|计时|定时)/.test(normalized)) return { matched: false, reason: "not_countdown_control" };
        const widget = findWidgetByType(context, "countdown");
        if (!widget) return { matched: false, reason: "countdown_target_missing" };
        const wantsReset = /(重置|复位|归零|重新来|重新开始)/.test(normalized);
        const wantsResume = /(继续|恢复|接着|启动|开始)/.test(normalized);
        const wantsPause = /(暂停|停止|停一下|停住|停掉|先停|取消|结束)/.test(normalized);
        const action = wantsReset ? "reset" : wantsResume ? "resume" : wantsPause ? "pause" : "";
        if (!action) return { matched: false, reason: "countdown_control_intent_missing" };
        return shortcutMatch(
          `countdown.${action}`,
          { widgetId: widget.widgetId },
          0.92,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "note_write",
      match(normalized, raw, context) {
        const explicitNoteWrite = /(便签|笔记)/.test(normalized) && /(写|写个|记录|记下|记个|开个|新建|新增|添加|追加)/.test(normalized);
        const casualNoteWrite =
          /(记一下|记下|记录一下|写一下|记一笔)/.test(normalized) &&
          !/(待办|任务|清单|提醒|记得|别忘了|剪贴板|留言板|留言区|消息板|留言)/.test(normalized);
        if (!explicitNoteWrite && !casualNoteWrite) {
          return { matched: false, reason: "not_note_write" };
        }
        const content = inferNoteContent(raw);
        if (!content) return { matched: false, reason: "note_content_missing" };
        const confidence = explicitNoteWrite ? 1 : 0.9;
        return (
          routeWidgetDetailOrAdd(context, raw, "note", "note.write", { content, mode: "append" }, confidence) ?? {
            matched: false,
            reason: "note_target_missing"
          }
        );
      }
    },
    {
      name: "note_clear",
      match(normalized, raw, context) {
        if (!/(便签|笔记)/.test(normalized) || !/(清空|清理|清除|清一下|清掉|清除一下|擦掉|删除内容|移除内容)/.test(normalized)) {
          return { matched: false, reason: "not_note_clear" };
        }
        const widget = findWidgetByType(context, "note");
        if (!widget) return { matched: false, reason: "note_target_missing" };
        return shortcutMatch("note.clear", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "todo_add",
      match(normalized, raw, context) {
        if (
          (!/(待办|任务|清单)/.test(normalized) || !/(添加|新增|记下|记录|加入)/.test(normalized)) &&
          !/(提醒我|提醒|叫我|到点叫我|记得|别忘了)/.test(normalized)
        ) {
          return { matched: false, reason: "not_todo_add" };
        }
        const { text, dueAt } = inferTodoAdd(raw, getShortcutNow(context));
        if (!text) return { matched: false, reason: "todo_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "todo", "todo.add_item", { text, ...(dueAt ? { dueAt } : {}) }, 1) ?? {
            matched: false,
            reason: "todo_target_missing"
          }
        );
      }
    },
    {
      name: "todo_complete",
      match(normalized, raw, context) {
        const explicitTodoComplete = /(待办|任务|清单)/.test(normalized) && /(完成|做完|办完|勾掉|勾选|删除|移除|去掉|标记)/.test(normalized);
        const implicitTodoComplete =
          /(完成|做完|办完|勾掉|勾选|标记完成|标记为已完成)/.test(normalized) &&
          !/(便签|笔记|剪贴板|留言板|留言区|消息板|留言|音乐|电视|倒计时|计时器|新闻|头条)/.test(normalized);
        if (!explicitTodoComplete && !implicitTodoComplete) {
          return { matched: false, reason: "not_todo_complete" };
        }
        const text = inferTodoCompleteText(raw);
        if (!text) return { matched: false, reason: "todo_complete_text_missing" };
        const widget = findWidgetByType(context, "todo");
        if (!widget) return { matched: false, reason: "todo_target_missing" };
        return shortcutMatch(
          "todo.complete_item",
          { widgetId: widget.widgetId, text },
          0.92,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "clipboard_add",
      match(normalized, raw, context) {
        const explicitClipboard = /(剪贴板|剪贴板历史)/.test(normalized) && /(保存|存一下|存|加入|添加|记录|复制|拷贝)/.test(normalized);
        const pinnedSave = /(固定|置顶|钉住|pin)/i.test(raw) && /(保存|存一下|存|记录)/.test(normalized);
        if (!explicitClipboard && !pinnedSave) {
          return { matched: false, reason: "not_clipboard_add" };
        }
        const text = inferClipboardText(raw);
        if (!text) return { matched: false, reason: "clipboard_text_missing" };
        const pinned = inferClipboardPinned(raw);
        return (
          routeWidgetDetailOrAdd(context, raw, "clipboard", "clipboard.add_text", { text, ...(pinned ? { pinned } : {}) }, 1) ?? {
            matched: false,
            reason: "clipboard_target_missing"
          }
        );
      }
    },
    {
      name: "clipboard_clear",
      match(normalized, raw, context) {
        if (!/(剪贴板|剪贴板历史)/.test(normalized) || !/(清空|清理|清除|清一下|清掉|清除一下|删除|移除)/.test(normalized)) {
          return { matched: false, reason: "not_clipboard_clear" };
        }
        const includePinned = /(全部|所有|固定|置顶|包含固定|连固定|一起)/.test(normalized);
        const widget = findWidgetByType(context, "clipboard");
        if (!widget) return { matched: false, reason: "clipboard_target_missing" };
        return shortcutMatch(
          "clipboard.clear",
          { widgetId: widget.widgetId, includePinned },
          0.92,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "message_board_send",
      match(normalized, raw, context) {
        if (CLOSE_SHORTCUT_INTENT_PATTERN.test(normalized)) {
          return { matched: false, reason: "message_board_close_deferred" };
        }
        const hasMessageAction =
          /(发|发送|说|写|发布|公告|通知)/.test(normalized) || /(给大家|跟大家)?留言\s*[:：]/.test(raw) || /(给大家|跟大家)留言/.test(normalized);
        if (!/(留言板|留言区|消息板|留言|给大家|跟大家|公告|通知)/.test(normalized) || !hasMessageAction) {
          return { matched: false, reason: "not_message_board_send" };
        }
        const text = inferMessageBoardText(raw);
        if (!text) return { matched: false, reason: "message_board_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "messageBoard", "messageBoard.send", { text }, 0.88) ?? {
            matched: false,
            reason: "message_board_target_missing"
          }
        );
      }
    },
    {
      name: "translate_set_draft",
      match(normalized, raw, context) {
        if (!/翻译|什么意思|啥意思|是什么意思/.test(normalized)) return { matched: false, reason: "not_translate" };
        if (
          /(打开|打开一下|开一下|添加|新增|再打开|来个|来一个|加一个|聚焦|切到|关闭|关掉|收起|收起来|隐藏).*(翻译|翻译器)/.test(normalized) ||
          /(翻译|翻译器).*(打开|添加|新增|聚焦|切到|关闭|关掉|收起|收起来|隐藏)/.test(normalized)
        ) {
          return { matched: false, reason: "translate_window_intent_deferred" };
        }
        const draft = inferTranslateDraft(raw);
        if (!draft) return { matched: false, reason: "translate_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "translate", "translate.set_draft", draft, 1) ?? {
            matched: false,
            reason: "translate_target_missing"
          }
        );
      }
    },
    {
      name: "converter_set",
      match(normalized, raw, context) {
        if (!/(换算|转换|转成|转为|等于|多少|是多少|转)/.test(normalized)) return { matched: false, reason: "not_converter" };
        const args = inferConverterArgs(raw);
        if (!args) return { matched: false, reason: "converter_args_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "converter", "converter.set", args, 1) ?? {
            matched: false,
            reason: "converter_target_missing"
          }
        );
      }
    },
    {
      name: "calculator_set_display",
      match(normalized, raw, context) {
        const hasArithmeticIntent = /[0-9]\s*(?:[+\-*/×÷]|加上|加|减去|减|乘以|乘|除以|除)/.test(raw);
        if (!hasArithmeticIntent && !/(计算器|计算|算一下|等于多少|是多少)/.test(normalized)) {
          return { matched: false, reason: "not_calculator" };
        }
        const display = inferCalculatorDisplay(raw);
        if (!display) return { matched: false, reason: "calculator_display_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "calculator", "calculator.set_display", { display }, 1) ?? {
            matched: false,
            reason: "calculator_target_missing"
          }
        );
      }
    },
    {
      name: "market_set_indices",
      match(normalized, raw, context) {
        const indexCodes = inferMarketIndexCodes(raw);
        if (!/(行情|指数|市场|股票|涨跌|走势|怎么样|如何)/.test(normalized) && indexCodes.length === 0) {
          return { matched: false, reason: "not_market" };
        }
        if (indexCodes.length === 0) return { matched: false, reason: "market_indices_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "market", "market.set_indices", { indexCodes }, 0.86) ?? {
            matched: false,
            reason: "market_target_missing"
          }
        );
      }
    },
    {
      name: "world_clock_set_zones",
      match(normalized, raw, context) {
        if (!/(世界时钟|世界时间|时区|几点|时间)/.test(normalized) && !/\btime\b/i.test(raw)) {
          return { matched: false, reason: "not_world_clock" };
        }
        const zones = inferWorldClockZones(raw);
        if (zones.length === 0) return { matched: false, reason: "world_clock_zones_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "worldClock", "worldClock.set_zones", { zones }, 1) ?? {
            matched: false,
            reason: "world_clock_target_missing"
          }
        );
      }
    },
    {
      name: "headline_refresh",
      match(normalized, raw, context) {
        if (inferTvChannelName(raw) && /(央视|中央|CCTV|频道)/i.test(raw)) {
          return { matched: false, reason: "headline_deferred_to_tv" };
        }
        if (
          !/(新闻|头条)/.test(normalized) ||
          !/(刷新|更新|重新加载|换一批|看看|看一下|看|有什么|今日|今天|最新)/.test(normalized)
        ) {
          return { matched: false, reason: "not_headline_refresh" };
        }
        return (
          routeWidgetDetailOrAdd(context, raw, "headline", "headline.request_refresh", {}, 0.84) ?? {
            matched: false,
            reason: "headline_target_missing"
          }
        );
      }
    },
    {
      name: "recorder_control",
      match(normalized, raw, context) {
        if (!/(录音|录音机|录制)/.test(normalized)) return { matched: false, reason: "not_recorder" };
        const wantsStop = /(停止|结束|完成|停下|停掉).*(录音|录制)|^(停止|结束|完成|停下|停掉)录音/.test(normalized);
        const wantsPlay = /(播放|回放|听一下|听).*(录音|录音机|录制)/.test(normalized);
        const wantsPause = /(暂停).*(录音|录音机|录制)/.test(normalized);
        const wantsStart =
          !wantsStop &&
          !wantsPlay &&
          !wantsPause &&
          (/(开始|启动|录一段|录一下|录制)/.test(normalized) || /^录音$/.test(normalized) || /^(开始|启动)?录音/.test(normalized));
        if (!wantsStart && !wantsStop && !wantsPlay && !wantsPause) {
          return { matched: false, reason: "recorder_action_missing" };
        }
        if (wantsStart) {
          return (
            routeWidgetDetailOrAdd(context, raw, "recorder", "recorder.start", {}, 0.9) ?? {
              matched: false,
              reason: "recorder_target_missing"
            }
          );
        }
        const widget = findWidgetByType(context, "recorder");
        if (!widget) return { matched: false, reason: "recorder_target_missing" };
        const action = wantsStop ? "stop" : wantsPause ? "pause" : "play";
        return shortcutMatch(
          `recorder.${action}`,
          { widgetId: widget.widgetId },
          0.88,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "dial_clock_night_mode",
      match(normalized, raw, context) {
        const mentionsNightMode = /(夜间模式|夜晚模式|黑夜模式|睡眠模式|夜灯|暗色模式|深色模式)/.test(normalized);
        const mentionsDialClock = /(时钟|表盘|钟表)/.test(normalized);
        if (!mentionsNightMode && !(mentionsDialClock && /(夜间|夜晚|黑夜|睡眠|夜灯|暗色|深色)/.test(normalized))) {
          return { matched: false, reason: "not_dial_clock_night_mode" };
        }
        const wantsOff = /(关闭|关掉|退出|取消|停用|关上|关了|不要|取消)/.test(normalized);
        const wantsOn = /(打开|开启|进入|启用|切到|切换到|启动|开一下)/.test(normalized) || !wantsOff;
        return (
          routeWidgetDetailOrAdd(context, raw, "dialClock", "dialClock.set_night_mode", { enabled: wantsOn }, 1) ?? {
            matched: false,
            reason: "dial_clock_target_missing"
          }
        );
      }
    },
    {
      name: "tv_channel_control",
      match(normalized, raw, context) {
        const wantsTvPlaybackFullscreen =
          /(电视|直播|电视频道).*(全屏|放大)/.test(normalized) ||
          /(全屏|放大).*(播放|播).*(电视|直播|电视频道)/.test(normalized) ||
          /(央视|中央|CCTV).*(全屏|放大).*(播放|播)?/i.test(raw);
        if (/(窗口|面板|卡片).{0,20}(缩小|调小|右上角|右侧|左侧|移动|移到|放到|挡眼|太挡眼)|(?:缩小|调小|右上角|右侧|左侧|移动|移到|放到|挡眼|太挡眼).{0,20}(窗口|面板|卡片)/.test(normalized)) {
          return { matched: false, reason: "tv_window_layout_deferred" };
        }
        if (/(暂停|停一下|停止|停掉)/.test(normalized)) return { matched: false, reason: "tv_pause_deferred" };
        const channelName = inferTvChannelName(raw);
        if (!channelName && wantsTvPlaybackFullscreen) {
          return (
            routeWidgetDetailOrAdd(context, raw, "tv", "tv.fullscreen", {}, 0.93) ?? {
              matched: false,
              reason: "tv_target_missing"
            }
          );
        }
        if (!channelName) return { matched: false, reason: "tv_channel_missing" };
        const hasTvIntent =
          /(电视|直播|频道|换台|切台|台|央视|中央)/.test(normalized) ||
          /CCTV/i.test(raw) ||
          /(新闻频道|体育频道|财经频道|电影频道|电视剧频道|少儿频道)/.test(raw);
        const hasControlIntent = /(播放|放|看|打开|换台|切台|换到|切到|切换到|转到|调到|选|全屏|放大)/.test(normalized);
        if (!hasTvIntent || !hasControlIntent) return { matched: false, reason: "not_tv_channel_control" };
        const wantsFullscreen = /(全屏|放大)/.test(normalized);
        const wantsPlayback = /(播放|放|看|打开|全屏|放大)/.test(normalized);
        const toolName = wantsPlayback ? "tv.play" : "tv.select_channel";
        const confidence = /(央视|中央|CCTV)/i.test(raw) ? 0.93 : 0.88;
        return (
          routeWidgetDetailOrAdd(
            context,
            raw,
            "tv",
            toolName,
            {
              channelName,
              ...(wantsFullscreen
                ? {
                    followUp: {
                      name: "tv.fullscreen",
                      arguments: {}
                    }
                  }
                : {})
            },
            confidence
          ) ?? { matched: false, reason: "tv_target_missing" }
        );
      }
    },
    {
      name: "open_widget",
      match(normalized, raw, context) {
        const openIntent = /(打开|打开一下|开一下|添加|新增|叫出|叫一下|唤出|调出|拉起|显示|启动|来个|来一个|放上|放一个|加一个|加个|聚焦|切到)/.test(normalized);
        if (!openIntent) return { matched: false, reason: "not_open_widget" };
        const aliasInput = `${raw}${compactShortcutInput(normalized)}`.toLowerCase();
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记", "备忘录"] },
          { type: "todo", aliases: ["待办", "任务", "清单"] },
          { type: "calculator", aliases: ["计算器", "计算"] },
          { type: "countdown", aliases: ["倒计时", "计时器", "定时器", "计时", "定时"] },
          { type: "weather", aliases: ["天气"] },
          { type: "headline", aliases: ["新闻", "头条", "资讯"] },
          { type: "market", aliases: ["指数", "行情", "市场", "股票", "股市"] },
          { type: "tv", aliases: ["电视", "电视机", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器", "音乐播放器"] },
          { type: "worldClock", aliases: ["世界时钟", "世界时间", "时区"] },
          { type: "dialClock", aliases: ["时钟", "钟表", "表盘"] },
          { type: "translate", aliases: ["翻译", "翻译器"] },
          { type: "converter", aliases: ["换算", "转换", "单位", "单位换算"] },
          { type: "clipboard", aliases: ["剪贴板", "复制板"] },
          { type: "recorder", aliases: ["录音", "录音机"] },
          { type: "messageBoard", aliases: ["留言板", "留言", "消息板"] }
        ];
        const matchedType = knownTypes.find((entry) => entry.aliases.some((alias) => aliasInput.includes(alias.toLowerCase())))?.type;
        if (!matchedType) return { matched: false, reason: "widget_type_missing" };
        const widget = findWidgetByType(context, matchedType);
        if (widget) {
          return shortcutMatch("widget.focus", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
        }
        const definition = findDefinitionByType(context, matchedType);
        if (!definition) return { matched: false, reason: "definition_missing" };
        return shortcutMatch("board.add_widget", { definitionId: definition.definitionId }, 0.92, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "bring_widget_to_front",
      match(normalized, raw, context) {
        if (!/(置顶|放到?最前|最前面|放前面|别被挡住|不要挡住)/.test(normalized)) {
          return { matched: false, reason: "not_bring_widget_to_front" };
        }
        const aliasInput = `${raw}${compactShortcutInput(normalized)}`;
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记", "备忘录"] },
          { type: "todo", aliases: ["待办", "任务", "清单"] },
          { type: "calculator", aliases: ["计算器", "计算"] },
          { type: "countdown", aliases: ["倒计时", "计时器", "定时器"] },
          { type: "weather", aliases: ["天气"] },
          { type: "headline", aliases: ["新闻", "头条", "资讯"] },
          { type: "market", aliases: ["指数", "行情", "市场", "股票", "股市"] },
          { type: "tv", aliases: ["电视", "电视机", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器", "音乐播放器"] },
          { type: "worldClock", aliases: ["世界时钟", "世界时间", "时区"] },
          { type: "dialClock", aliases: ["时钟", "钟表", "表盘"] },
          { type: "translate", aliases: ["翻译", "翻译器"] },
          { type: "converter", aliases: ["换算", "转换", "单位", "单位换算"] },
          { type: "clipboard", aliases: ["剪贴板", "复制板"] },
          { type: "recorder", aliases: ["录音", "录音机"] },
          { type: "messageBoard", aliases: ["留言板", "留言", "消息板"] }
        ];
        const matchedType = knownTypes.find((entry) => entry.aliases.some((alias) => aliasInput.includes(alias)))?.type;
        const widget = matchedType ? findWidgetByType(context, matchedType) : context.focusedWidget;
        if (!widget) return { matched: false, reason: "bring_widget_target_missing" };
        return shortcutMatch("widget.bring_to_front", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
      }
    },
    {
      name: "music_search",
      match(normalized, raw, context) {
        if (!/(搜索|查找|找一下|找|搜一下|搜)/.test(normalized)) return { matched: false, reason: "not_music_search" };
        const hasExplicitMusicTarget = /(音乐|歌曲|歌单|专辑|歌手|歌|播放列表|playlist|album|song)/i.test(raw);
        if (!hasExplicitMusicTarget && context.focusedWidget?.type !== "music") {
          return { matched: false, reason: "music_search_target_missing" };
        }
        const args = inferMusicArgs(raw);
        if (!args.query) return { matched: false, reason: "music_query_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "music", "music.search", args, 0.86) ?? {
            matched: false,
            reason: "music_target_missing"
          }
        );
      }
    },
    {
      name: "media_play_pause",
      match(normalized, raw, context) {
        const isResume = /(继续|恢复|接着播|继续播)/.test(normalized);
        const suppressPlayback = /(不一定播放|先不播放|不要播放|别播放|不用播放)/.test(normalized);
        const isPlay = !suppressPlayback && (/(播放|来一首|放一首|放首|听一下|听|放点|放个|放些)/.test(normalized) || isResume);
        const isPause = /(暂停|停一下|停止|停掉)/.test(normalized);
        const isNext = /(下一首|下首|切歌|换一首|跳过)/.test(normalized);
        const isPrevious = /(上一首|上首|前一首|返回上一首|倒回上一首)/.test(normalized);
        if (!isPlay && !isPause && !isNext && !isPrevious) return { matched: false, reason: "not_media_control" };
        const channelName = inferTvChannelName(raw);
        let targetType =
          raw.includes("录音") || raw.includes("录音机")
            ? "recorder"
            : raw.includes("电视") || channelName
              ? "tv"
              : raw.includes("音乐") || raw.includes("歌")
                ? "music"
                : "";
        const musicArgs = isPlay ? inferMusicArgs(raw) : {};
        const musicQuery = typeof musicArgs.query === "string" ? musicArgs.query : "";
        if (!targetType && isPlay && musicQuery && findWidgetByType(context, "music")) {
          targetType = "music";
        }
        if (!targetType && (isNext || isPrevious) && findWidgetByType(context, "music")) {
          targetType = "music";
        }
        if (!targetType && isPlay && musicQuery && !channelName) {
          return { matched: false, reason: "music_play_requires_realtime_target" };
        }
        if (targetType === "music" && isPlay && !isPause && !isNext && !isPrevious && !isResume) {
          const confidence = /(播放|来一首|放一首|放首)/.test(normalized) ? 0.88 : 0.86;
          return (
            routeWidgetDetailOrAdd(context, raw, "music", "music.play", musicArgs, confidence) ?? {
              matched: false,
              reason: "music_target_missing"
            }
          );
        }
        const widget = targetType ? findWidgetByType(context, targetType) : context.focusedWidget;
        if (!widget || !["tv", "music", "recorder"].includes(widget.type)) {
          return { matched: false, reason: "media_target_missing" };
        }
        if (isNext) {
          if (widget.type !== "music") return { matched: false, reason: "media_next_target_missing" };
          return shortcutMatch("music.next", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
        }
        if (isPrevious) {
          if (widget.type !== "music") return { matched: false, reason: "media_previous_target_missing" };
          return shortcutMatch("music.previous", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
        }
        if (isResume && widget.type === "music") {
          return shortcutMatch("music.resume", { widgetId: widget.widgetId }, 0.92, context.source ?? "shortcut", raw);
        }
        const args = {
          widgetId: widget.widgetId,
          ...(channelName ? { channelName } : {}),
          ...(widget.type === "music" && isPlay ? musicArgs : {}),
          ...(widget.type === "tv" && isPlay && /(全屏|放大)/.test(normalized)
            ? {
                followUp: {
                  name: "tv.fullscreen",
                  arguments: {}
                }
              }
            : {})
        };
        return shortcutMatch(
          `${widget.type}.${isPause ? "pause" : "play"}`,
          args,
          widget.type === "tv" || isPause || (widget.type === "music" && /(播放|继续|恢复)/.test(normalized)) ? 0.92 : 0.86,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "close_widget",
      match(normalized, raw, context) {
        if (!/(关|关闭|关掉|关上|关了|收起|收了|收起来|收一收|撤掉|拿掉|删掉|删除|移除|去掉|隐藏)/.test(normalized)) {
          return { matched: false, reason: "not_close_widget" };
        }
        const aliasInput = `${raw}${compactShortcutInput(normalized)}`;
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记", "备忘录"] },
          { type: "todo", aliases: ["待办", "任务", "清单"] },
          { type: "calculator", aliases: ["计算器", "计算"] },
          { type: "countdown", aliases: ["倒计时", "计时器", "定时器"] },
          { type: "weather", aliases: ["天气"] },
          { type: "headline", aliases: ["新闻", "头条", "资讯"] },
          { type: "market", aliases: ["指数", "行情", "市场", "股票", "股市"] },
          { type: "tv", aliases: ["电视", "电视机", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器", "音乐播放器"] },
          { type: "worldClock", aliases: ["世界时钟", "世界时间", "时区"] },
          { type: "dialClock", aliases: ["时钟", "钟表", "表盘"] },
          { type: "translate", aliases: ["翻译", "翻译器"] },
          { type: "converter", aliases: ["换算", "转换", "单位", "单位换算"] },
          { type: "clipboard", aliases: ["剪贴板", "复制板"] },
          { type: "recorder", aliases: ["录音", "录音机"] },
          { type: "messageBoard", aliases: ["留言板", "留言", "消息板"] }
        ];
        const matchedType = knownTypes.find((entry) => entry.aliases.some((alias) => aliasInput.includes(alias)))?.type;
        if (!matchedType && !/(窗口|小工具|组件|面板)/.test(normalized)) {
          return { matched: false, reason: "close_widget_target_missing" };
        }
        const widget = matchedType ? findWidgetByType(context, matchedType) : context.focusedWidget;
        if (!widget) return { matched: false, reason: "close_widget_target_missing" };
        return shortcutMatch("widget.remove", { widgetId: widget.widgetId }, 0.95, context.source ?? "shortcut", raw);
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
