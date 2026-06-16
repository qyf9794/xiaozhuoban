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

function inferTvChannelName(input: string) {
  const cctv = input.match(/CCTV\s*[\w+-]+/i);
  if (cctv) return cctv[0].replace(/\s+/g, "").toUpperCase();
  const cctvCn = input.match(/央视\s*[\d一二三四五六七八九十]+/);
  if (cctvCn) return cctvCn[0].replace(/\s+/g, "");
  return "";
}

function inferMusicQuery(input: string) {
  return input
    .replace(/(播放|搜索|查找|找一下|找|来一首|放一首|放首|听一下|听|音乐播放器|音乐|歌曲|歌单|专辑|歌手|歌|一下|给我)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const switchTarget = raw.match(/(?:切换到|切到|打开|进入|回到)\s*([^，。,.]+)/);
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
    .replace(/[。.!！\s]+$/, "")
    .trim();
}

function inferNoteContent(raw: string) {
  const patterns = [
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
    /把(.+?)(?:添加|新增|记下|记录|加入)(?:到|进)?(?:待办|任务|清单)/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const text = cleanCommandContent(match?.[1] ?? "");
    if (text) return text;
  }
  return "";
}

function inferClipboardText(raw: string) {
  const patterns = [
    /(?:保存|加入|添加|记录)(?:到|进)?(?:剪贴板|剪贴板历史)[：:\s]*(.+)/,
    /(?:剪贴板|剪贴板历史).*(?:保存|加入|添加|记录)[：:\s]*(.+)/,
    /把(.+?)(?:保存|加入|添加|记录)(?:到|进)?(?:剪贴板|剪贴板历史)/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const text = cleanCommandContent(match?.[1] ?? "");
    if (text) return text;
  }
  return "";
}

function normalizeTranslateTarget(raw: string) {
  if (/(英文|英语|en)/i.test(raw)) return "en";
  if (/(中文|汉语|zh)/i.test(raw)) return "zh-CN";
  return "zh-CN";
}

function inferTranslateDraft(raw: string) {
  const patterns = [
    /(?:把)?(.+?)(?:翻译)(?:成|为|到)?(英文|英语|中文|汉语|en|zh-CN)?$/,
    /翻译(?:一下)?[：:\s]*(.+?)(?:成|为|到)(英文|英语|中文|汉语|en|zh-CN)$/,
    /(?:把)(.+?)(?:翻译)?(?:成|为|到)(英文|英语|中文|汉语|en|zh-CN)$/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const sourceText = cleanCommandContent(match?.[1] ?? "");
    if (!sourceText || /^(一下|翻译)$/.test(sourceText)) continue;
    return { sourceText, targetLang: normalizeTranslateTarget(match?.[2] ?? raw) };
  }
  return null;
}

const UNIT_ALIASES: Record<string, { category: string; unit: string }> = {
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
  kg: { category: "weight", unit: "kg" },
  克: { category: "weight", unit: "g" },
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
  const unitPattern = "(摄氏度|华氏度|开尔文|摄氏|华氏|公里|千米|厘米|英寸|英尺|公斤|千克|盎司|米|克|磅|km|cm|inch|ft|kg|lb|oz|m|g)";
  const patterns = [
    new RegExp(`([+-]?\\d+(?:\\.\\d+)?)\\s*${unitPattern}.*(?:换算|转换|转|到|成)\\s*${unitPattern}`, "i"),
    new RegExp(`(?:换算|转换)\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*${unitPattern}\\s*(?:到|成|为)\\s*${unitPattern}`, "i")
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const value = match[1];
    const from = UNIT_ALIASES[match[2]] ?? UNIT_ALIASES[match[2]?.toLowerCase() ?? ""];
    const to = UNIT_ALIASES[match[3]] ?? UNIT_ALIASES[match[3]?.toLowerCase() ?? ""];
    if (value && from && to && from.category === to.category) {
      return { category: from.category, value, fromUnit: from.unit, toUnit: to.unit };
    }
  }
  return null;
}

function evaluateArithmeticExpression(expression: string) {
  const normalized = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/，/g, "").trim();
  if (!/^[\d+\-*/().\s]+$/.test(normalized) || !/[+\-*/]/.test(normalized)) return null;
  try {
    const value = Function(`"use strict"; return (${normalized});`)();
    return typeof value === "number" && Number.isFinite(value) ? String(Number(value.toFixed(8))) : null;
  } catch {
    return null;
  }
}

function inferCalculatorDisplay(raw: string) {
  const expression = raw.match(/([0-9][0-9+\-*/×÷().\s]+[0-9])/);
  const evaluated = expression ? evaluateArithmeticExpression(expression[1]) : null;
  if (evaluated) return evaluated;
  const display = raw.match(/(?:计算器)(?:显示|设为|输入)?[：:\s]*([+-]?\d+(?:\.\d+)?)/);
  return display?.[1] ?? "";
}

function inferMarketIndexCodes(raw: string) {
  const pairs: Array<[RegExp, string]> = [
    [/(标普|S&P|sp500|SPX)/i, "usINX"],
    [/(纳指|纳斯达克|NDX|nasdaq)/i, "usNDX"],
    [/(道指|道琼斯|DJI)/i, "usDJI"],
    [/(恒生|港股|HSI)/i, "hkHSI"],
    [/(上证|沪指|A股|sh000001)/i, "sh000001"],
    [/(深成|深证|sz399001)/i, "sz399001"]
  ];
  return pairs.filter(([pattern]) => pattern.test(raw)).map(([, code]) => code);
}

function inferWorldClockZones(raw: string) {
  const zones = ["北京", "伦敦", "纽约", "东京", "洛杉矶", "波士顿"].filter((city) => raw.includes(city));
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
      name: "auto_align",
      match(normalized, raw, context) {
        if (/(整理|排列|对齐|收拾).*(桌面|桌板|小工具)|^(整理|排列|对齐|收拾)$/.test(normalized)) {
          return shortcutMatch("board.auto_align", {}, 0.9, context.source ?? "shortcut", raw);
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
        if (!/(切换到|切到|打开|进入|回到).*(桌板|桌面|面板)/.test(normalized)) {
          return { matched: false, reason: "not_switch_board" };
        }
        const board = findBoardByName(context, inferBoardSwitchName(raw));
        if (!board) {
          return { matched: false, reason: "board_target_missing" };
        }
        return shortcutMatch("board.switch", { boardId: board.boardId }, 0.88, context.source ?? "shortcut", raw);
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
            {
              definitionId: definition.definitionId,
              followUp: {
                name: "countdown.set",
                arguments: { totalSeconds: minutes * 60, start: true }
              }
            },
            0.75,
            context.source ?? "shortcut",
            raw
          );
        }
        return { matched: false, reason: "countdown_target_missing" };
      }
    },
    {
      name: "note_write",
      match(normalized, raw, context) {
        if (!/(便签|笔记)/.test(normalized) || !/(写|记录|记下|添加|追加)/.test(normalized)) {
          return { matched: false, reason: "not_note_write" };
        }
        const content = inferNoteContent(raw);
        if (!content) return { matched: false, reason: "note_content_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "note", "note.write", { content, mode: "append" }, 0.9) ?? {
            matched: false,
            reason: "note_target_missing"
          }
        );
      }
    },
    {
      name: "todo_add",
      match(normalized, raw, context) {
        if (!/(待办|任务|清单)/.test(normalized) || !/(添加|新增|记下|记录|加入)/.test(normalized)) {
          return { matched: false, reason: "not_todo_add" };
        }
        const text = inferTodoText(raw);
        if (!text) return { matched: false, reason: "todo_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "todo", "todo.add_item", { text }, 0.9) ?? {
            matched: false,
            reason: "todo_target_missing"
          }
        );
      }
    },
    {
      name: "clipboard_add",
      match(normalized, raw, context) {
        if (!/(剪贴板|剪贴板历史)/.test(normalized) || !/(保存|加入|添加|记录)/.test(normalized)) {
          return { matched: false, reason: "not_clipboard_add" };
        }
        const text = inferClipboardText(raw);
        if (!text) return { matched: false, reason: "clipboard_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "clipboard", "clipboard.add_text", { text }, 0.88) ?? {
            matched: false,
            reason: "clipboard_target_missing"
          }
        );
      }
    },
    {
      name: "translate_set_draft",
      match(normalized, raw, context) {
        if (!/翻译/.test(normalized)) return { matched: false, reason: "not_translate" };
        const draft = inferTranslateDraft(raw);
        if (!draft) return { matched: false, reason: "translate_text_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "translate", "translate.set_draft", draft, 0.88) ?? {
            matched: false,
            reason: "translate_target_missing"
          }
        );
      }
    },
    {
      name: "converter_set",
      match(normalized, raw, context) {
        if (!/(换算|转换|转成|转为)/.test(normalized)) return { matched: false, reason: "not_converter" };
        const args = inferConverterArgs(raw);
        if (!args) return { matched: false, reason: "converter_args_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "converter", "converter.set", args, 0.88) ?? {
            matched: false,
            reason: "converter_target_missing"
          }
        );
      }
    },
    {
      name: "calculator_set_display",
      match(normalized, raw, context) {
        if (!/(计算器|计算|算一下|等于多少)/.test(normalized)) return { matched: false, reason: "not_calculator" };
        const display = inferCalculatorDisplay(raw);
        if (!display) return { matched: false, reason: "calculator_display_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "calculator", "calculator.set_display", { display }, 0.86) ?? {
            matched: false,
            reason: "calculator_target_missing"
          }
        );
      }
    },
    {
      name: "market_set_indices",
      match(normalized, raw, context) {
        if (!/(行情|指数|市场|股票)/.test(normalized)) return { matched: false, reason: "not_market" };
        const indexCodes = inferMarketIndexCodes(raw);
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
        if (!/(世界时钟|时区|几点)/.test(normalized)) return { matched: false, reason: "not_world_clock" };
        const zones = inferWorldClockZones(raw);
        if (zones.length === 0) return { matched: false, reason: "world_clock_zones_missing" };
        return (
          routeWidgetDetailOrAdd(context, raw, "worldClock", "worldClock.set_zones", { zones }, 0.86) ?? {
            matched: false,
            reason: "world_clock_target_missing"
          }
        );
      }
    },
    {
      name: "headline_refresh",
      match(normalized, raw, context) {
        if (!/(刷新|更新|重新加载|换一批)/.test(normalized) || !/(新闻|头条)/.test(normalized)) {
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
        if (!/(录音|录音机)/.test(normalized)) return { matched: false, reason: "not_recorder" };
        const wantsStop = /(停止|结束|完成|停下|停掉).*(录音|录制)|^(停止|结束|完成|停下|停掉)录音/.test(normalized);
        const wantsPlay = /(播放|回放|听一下|听).*(录音|录音机)/.test(normalized);
        const wantsPause = /(暂停).*(录音|录音机)/.test(normalized);
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
        const mentionsNightMode = /(夜间模式|夜晚模式|黑夜模式|睡眠模式|夜灯)/.test(normalized);
        const mentionsDialClock = /(时钟|表盘|钟表)/.test(normalized);
        if (!mentionsNightMode && !(mentionsDialClock && /(夜间|夜晚|黑夜|睡眠|夜灯)/.test(normalized))) {
          return { matched: false, reason: "not_dial_clock_night_mode" };
        }
        const wantsOff = /(关闭|关掉|退出|取消|停用|关上|关了)/.test(normalized);
        const wantsOn = /(打开|开启|进入|启用|切到|切换到|启动)/.test(normalized) || !wantsOff;
        return (
          routeWidgetDetailOrAdd(context, raw, "dialClock", "dialClock.set_night_mode", { enabled: wantsOn }, 0.88) ?? {
            matched: false,
            reason: "dial_clock_target_missing"
          }
        );
      }
    },
    {
      name: "open_widget",
      match(normalized, raw, context) {
        const openIntent = /(打开|添加|新增|叫出|显示|启动|来个|放上|放一个|加一个)/.test(normalized);
        if (!openIntent) return { matched: false, reason: "not_open_widget" };
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记"] },
          { type: "todo", aliases: ["待办", "任务"] },
          { type: "calculator", aliases: ["计算器", "计算"] },
          { type: "countdown", aliases: ["倒计时", "计时器"] },
          { type: "weather", aliases: ["天气"] },
          { type: "headline", aliases: ["新闻", "头条"] },
          { type: "market", aliases: ["指数", "行情", "市场"] },
          { type: "tv", aliases: ["电视", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器"] },
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
        const isPause = /(暂停|停一下|停止|停掉)/.test(normalized);
        const isNext = /(下一首|下首|切歌|换一首|跳过)/.test(normalized);
        if (!isPlay && !isPause && !isNext) return { matched: false, reason: "not_media_control" };
        const channelName = inferTvChannelName(raw);
        let targetType =
          raw.includes("录音") || raw.includes("录音机")
            ? "recorder"
            : raw.includes("电视") || channelName
              ? "tv"
              : raw.includes("音乐") || raw.includes("歌")
                ? "music"
                : "";
        const musicQuery = isPlay ? inferMusicQuery(raw) : "";
        if (!targetType && isPlay && musicQuery && findWidgetByType(context, "music")) {
          targetType = "music";
        }
        const widget = targetType ? findWidgetByType(context, targetType) : context.focusedWidget;
        if (!widget || !["tv", "music", "recorder"].includes(widget.type)) {
          return { matched: false, reason: "media_target_missing" };
        }
        if (isNext) {
          if (widget.type !== "music") return { matched: false, reason: "media_next_target_missing" };
          return shortcutMatch("music.next", { widgetId: widget.widgetId }, 0.86, context.source ?? "shortcut", raw);
        }
        const args = {
          widgetId: widget.widgetId,
          ...(channelName ? { channelName } : {}),
          ...(widget.type === "music" && isPlay && musicQuery ? { query: musicQuery } : {}),
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
          0.86,
          context.source ?? "shortcut",
          raw
        );
      }
    },
    {
      name: "close_widget",
      match(normalized, raw, context) {
        if (!/(关|关闭|关掉|关上|关了|收起|删掉|删除|移除|去掉)/.test(normalized)) return { matched: false, reason: "not_close_widget" };
        const knownTypes: Array<{ type: string; aliases: string[] }> = [
          { type: "note", aliases: ["便签", "笔记"] },
          { type: "todo", aliases: ["待办", "任务"] },
          { type: "calculator", aliases: ["计算器", "计算"] },
          { type: "countdown", aliases: ["倒计时", "计时器"] },
          { type: "weather", aliases: ["天气"] },
          { type: "headline", aliases: ["新闻", "头条"] },
          { type: "market", aliases: ["指数", "行情", "市场"] },
          { type: "tv", aliases: ["电视", "直播"] },
          { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器"] },
          { type: "worldClock", aliases: ["世界时钟", "时区"] },
          { type: "dialClock", aliases: ["时钟", "表盘"] },
          { type: "translate", aliases: ["翻译"] },
          { type: "converter", aliases: ["换算", "单位"] },
          { type: "clipboard", aliases: ["剪贴板"] },
          { type: "recorder", aliases: ["录音"] },
          { type: "messageBoard", aliases: ["留言板", "留言"] }
        ];
        const matchedType = knownTypes.find((entry) => entry.aliases.some((alias) => raw.includes(alias)))?.type;
        if (!matchedType && !/(窗口|小工具|组件|面板)/.test(normalized)) {
          return { matched: false, reason: "close_widget_target_missing" };
        }
        const widget = matchedType ? findWidgetByType(context, matchedType) : context.focusedWidget;
        if (!widget) return { matched: false, reason: "close_widget_target_missing" };
        return shortcutMatch("widget.remove", { widgetId: widget.widgetId }, 0.88, context.source ?? "shortcut", raw);
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
