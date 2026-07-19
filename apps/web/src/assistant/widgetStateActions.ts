import {
  createPassthroughSchema,
  inferCalculatorDisplay,
  type AssistantAction,
  type AssistantActionContext,
  type AssistantToolResult
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { DEFAULT_WORLD_CLOCK_ZONES, normalizeWorldClockZones, WORLD_CLOCK_ZONE_OPTIONS } from "../widgets/worldClockShared";

export interface WidgetStateActionStore {
  getWidgetInstances: () => WidgetInstance[];
  getWidgetDefinitions: () => WidgetDefinition[];
  updateWidgetState: (
    widgetId: string,
    state: Record<string, unknown>,
    options?: { operationId?: string }
  ) => Promise<void> | void;
}

type NoteWriteArgs = { content: string; mode?: "replace" | "append" };
type NoteClearArgs = Record<string, never>;
type TodoAddArgs = { text: string; dueAt?: string };
type TodoCompleteArgs = { text: string };
type TodoClearCompletedArgs = Record<string, never>;
type CountdownSetArgs = { hours?: number; minutes?: number; seconds?: number; totalSeconds?: number; start?: boolean; label?: string };
type CountdownControlArgs = Record<string, never>;
type WeatherCityArgs = { city?: string; cityCode?: string };
type CalculatorSetArgs = { display: string | number };
type HeadlineRefreshArgs = { requestedAt?: string };
type MarketSetArgs = { indexCode?: string; indexCodes?: string[]; symbol?: string; symbols?: string[]; query?: string };
type WorldClockSetArgs = { zones: string[]; compact?: boolean };
type ConverterSetArgs = { category?: string; value: string | number; fromUnit?: string; toUnit?: string };
type TranslateDraftArgs = { sourceText: string; sourceLang?: string; targetLang?: string };
type ClipboardAddArgs = { text: string; pinned?: boolean };
type ClipboardClearArgs = { includePinned?: boolean };
type MarketTargetCode = { code: string; label?: string };
type GeoSearchResult = {
  cityCode: string;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  worldClockZone: string;
};
type WeatherCityTarget = {
  cityCode: string;
  city?: GeoSearchResult;
};
type TodoStateItem = { id: string; text: string; dueAt?: string; completed?: boolean };
type ClipboardStateItem = { id: string; text: string; pinned?: boolean; createdAt: string };

const STAGE_ONE_WIDGET_TYPES = [
  "note",
  "todo",
  "calculator",
  "countdown",
  "weather",
  "headline",
  "market",
  "worldClock",
  "converter",
  "translate",
  "clipboard"
] as const;

const WEATHER_CITY_ALIASES: Record<string, string> = {
  beijing: "beijing",
  北京: "beijing",
  shanghai: "shanghai",
  上海: "shanghai",
  dalian: "dalian",
  大连: "dalian",
  guangzhou: "guangzhou",
  广州: "guangzhou",
  shenzhen: "shenzhen",
  深圳: "shenzhen",
  hangzhou: "hangzhou",
  杭州: "hangzhou",
  chengdu: "chengdu",
  成都: "chengdu",
  wuhan: "wuhan",
  武汉: "wuhan",
  jingzhou: "jingzhou",
  荆州: "jingzhou",
  chongqing: "chongqing",
  重庆: "chongqing",
  nanjing: "nanjing",
  南京: "nanjing",
  xian: "xian",
  西安: "xian",
  "los-angeles": "los-angeles",
  洛杉矶: "los-angeles",
  boston: "boston",
  波士顿: "boston",
  "new-york": "new-york",
  "new york": "new-york",
  nyc: "new-york",
  纽约: "new-york",
  tokyo: "tokyo",
  东京: "tokyo",
  paris: "paris",
  巴黎: "paris"
};

const MARKET_CODE_ALIASES: Record<string, string> = {
  usinx: "usINX",
  "s&p": "usINX",
  "s&p500": "usINX",
  sp500: "usINX",
  spx: "usINX",
  标普: "usINX",
  标普500: "usINX",
  usndx: "usNDX",
  ndx: "usNDX",
  nasdaq: "usNDX",
  "nasdaq100": "usNDX",
  "nasdaq 100": "usNDX",
  纳指: "usNDX",
  纳斯达克: "usNDX",
  纳斯达克100: "usNDX",
  usdj: "usDJI",
  usdji: "usDJI",
  dji: "usDJI",
  dow: "usDJI",
  "dowjones": "usDJI",
  "dow jones": "usDJI",
  道指: "usDJI",
  道琼斯: "usDJI",
  hkhsi: "hkHSI",
  hsi: "hkHSI",
  "hangseng": "hkHSI",
  "hang seng": "hkHSI",
  恒生: "hkHSI",
  港股: "hkHSI",
  sh000001: "sh000001",
  上证: "sh000001",
  上证指数: "sh000001",
  上海综指: "sh000001",
  沪深: "sh000001",
  沪指: "sh000001",
  sz399001: "sz399001",
  深成: "sz399001",
  深成指: "sz399001",
  深证: "sz399001",
  深证成指: "sz399001"
};
const MARKET_INDEX_CODES = new Set(["usINX", "usNDX", "usDJI", "hkHSI", "sh000001", "sz399001"]);
const CONVERTER_UNITS: Record<string, string[]> = {
  length: ["m", "km", "cm", "inch", "ft"],
  weight: ["kg", "g", "lb", "oz"],
  temperature: ["c", "f", "k"],
  area: ["sqm", "sqcm", "sqkm"],
  time: ["minute", "hour", "second"],
  currency: ["usd", "cny"]
};
const TRANSLATE_LANGS = new Set(["auto", "zh-CN", "en"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && value[key].trim().length > 0;
}

function hasOptionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function hasOptionalNumber(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || (typeof value[key] === "number" && Number.isFinite(value[key]));
}

function hasStringOrNumber(value: Record<string, unknown>, key: string) {
  return (
    (typeof value[key] === "string" && value[key].trim().length > 0) ||
    (typeof value[key] === "number" && Number.isFinite(value[key]))
  );
}

function parseWith<T>(guard: (value: unknown) => value is T) {
  return createPassthroughSchema<T>(guard);
}

const noteWriteSchema = parseWith<NoteWriteArgs>(
  (value): value is NoteWriteArgs =>
    isRecord(value) &&
    hasString(value, "content") &&
    (value.mode === undefined || value.mode === "replace" || value.mode === "append")
);

const noteClearSchema = parseWith<NoteClearArgs>((value): value is NoteClearArgs => isRecord(value));

const todoAddSchema = parseWith<TodoAddArgs>(
  (value): value is TodoAddArgs =>
    isRecord(value) && hasString(value, "text") && (value.dueAt === undefined || typeof value.dueAt === "string")
);

const todoCompleteSchema = parseWith<TodoCompleteArgs>((value): value is TodoCompleteArgs => isRecord(value) && hasString(value, "text"));

const todoClearCompletedSchema = parseWith<TodoClearCompletedArgs>((value): value is TodoClearCompletedArgs => isRecord(value));

const countdownSetSchema = parseWith<CountdownSetArgs>(
  (value): value is CountdownSetArgs =>
    isRecord(value) &&
    hasOptionalNumber(value, "hours") &&
    hasOptionalNumber(value, "minutes") &&
    hasOptionalNumber(value, "seconds") &&
    hasOptionalNumber(value, "totalSeconds") &&
    hasOptionalString(value, "label") &&
    (value.start === undefined || typeof value.start === "boolean")
);

const countdownControlSchema = parseWith<CountdownControlArgs>((value): value is CountdownControlArgs => isRecord(value));

const weatherCitySchema = parseWith<WeatherCityArgs>(
  (value): value is WeatherCityArgs =>
    isRecord(value) && (hasOptionalString(value, "city") || hasOptionalString(value, "cityCode")) && Boolean(value.city || value.cityCode)
);

const calculatorSetSchema = parseWith<CalculatorSetArgs>(
  (value): value is CalculatorSetArgs => isRecord(value) && hasStringOrNumber(value, "display")
);

const headlineRefreshSchema = parseWith<HeadlineRefreshArgs>(
  (value): value is HeadlineRefreshArgs => isRecord(value) && hasOptionalString(value, "requestedAt")
);

const marketSetSchema = parseWith<MarketSetArgs>(
  (value): value is MarketSetArgs =>
    isRecord(value) &&
    (
      typeof value.indexCode === "string" ||
      typeof value.symbol === "string" ||
      typeof value.query === "string" ||
      (Array.isArray(value.indexCodes) && value.indexCodes.every((item) => typeof item === "string")) ||
      (Array.isArray(value.symbols) && value.symbols.every((item) => typeof item === "string"))
    )
);

const worldClockSetSchema = parseWith<WorldClockSetArgs>(
  (value): value is WorldClockSetArgs =>
    isRecord(value) &&
    Array.isArray(value.zones) &&
    value.zones.every((item) => typeof item === "string") &&
    (value.compact === undefined || typeof value.compact === "boolean")
);

const converterSetSchema = parseWith<ConverterSetArgs>(
  (value): value is ConverterSetArgs =>
    isRecord(value) &&
    hasStringOrNumber(value, "value") &&
    hasOptionalString(value, "category") &&
    hasOptionalString(value, "fromUnit") &&
    hasOptionalString(value, "toUnit")
);

const translateDraftSchema = parseWith<TranslateDraftArgs>(
  (value): value is TranslateDraftArgs =>
    isRecord(value) &&
    hasString(value, "sourceText") &&
    hasOptionalString(value, "sourceLang") &&
    hasOptionalString(value, "targetLang")
);

const clipboardAddSchema = parseWith<ClipboardAddArgs>(
  (value): value is ClipboardAddArgs =>
    isRecord(value) && hasString(value, "text") && (value.pinned === undefined || typeof value.pinned === "boolean")
);

const clipboardClearSchema = parseWith<ClipboardClearArgs>(
  (value): value is ClipboardClearArgs => isRecord(value) && (value.includePinned === undefined || typeof value.includePinned === "boolean")
);

function success(message: string, data?: unknown): AssistantToolResult {
  return { status: "success", message, data };
}

function failed(message: string, errorCode: string): AssistantToolResult {
  return { status: "failed", message, errorCode };
}

function defineAction<TArgs>(action: AssistantAction<TArgs>): AssistantAction<TArgs> {
  return action;
}

function getDefinition(store: WidgetStateActionStore, widget: WidgetInstance) {
  return store.getWidgetDefinitions().find((item) => item.id === widget.definitionId);
}

function getTarget(
  store: WidgetStateActionStore,
  context: AssistantActionContext,
  expectedType: string
): { widget: WidgetInstance; definition: WidgetDefinition } | AssistantToolResult {
  const targetId = context.target?.widgetId;
  if (!targetId) {
    return failed("需要先指定一个小工具", "TARGET_REQUIRED");
  }
  const widget = store.getWidgetInstances().find((item) => item.id === targetId);
  if (!widget) {
    return failed("没有找到这个小工具", "WIDGET_NOT_FOUND");
  }
  const definition = getDefinition(store, widget);
  if (!definition) {
    return failed("没有找到这个小工具定义", "WIDGET_DEFINITION_NOT_FOUND");
  }
  if (definition.type !== expectedType) {
    return failed(`这个操作只能用于${expectedType}小工具`, "WIDGET_TYPE_MISMATCH");
  }
  return { widget, definition };
}

function isToolResult(value: { widget: WidgetInstance; definition: WidgetDefinition } | AssistantToolResult): value is AssistantToolResult {
  return "status" in value;
}

async function patchWidgetState(
  store: WidgetStateActionStore,
  widget: WidgetInstance,
  patch: Record<string, unknown>,
  context: AssistantActionContext
) {
  const nextState = { ...widget.state, ...patch };
  await store.updateWidgetState(widget.id, nextState, { operationId: context.operationId });
  return nextState;
}

function clampSegment(value: number | undefined, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value ?? 0)));
}

function normalizeCountdownTotal(args: CountdownSetArgs) {
  if (Number.isFinite(args.totalSeconds)) {
    return Math.max(0, Math.floor(args.totalSeconds ?? 0));
  }
  return clampSegment(args.hours, 99) * 3600 + clampSegment(args.minutes, 59) * 60 + clampSegment(args.seconds, 59);
}

function parseCountdownStateSegment(value: unknown, max: number) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(max, Math.max(0, Math.floor(numeric)));
}

function getCountdownTotalFromState(state: Record<string, unknown>) {
  const storedTotal = Number(state.totalSeconds);
  if (Number.isFinite(storedTotal) && storedTotal > 0) return Math.floor(storedTotal);
  return (
    parseCountdownStateSegment(state.inputHours, 99) * 3600 +
    parseCountdownStateSegment(state.inputMinutes, 59) * 60 +
    parseCountdownStateSegment(state.inputSeconds, 59)
  );
}

function getCountdownRemainingFromState(state: Record<string, unknown>) {
  const storedRemaining = Number(state.remainingSeconds);
  if (Number.isFinite(storedRemaining) && storedRemaining > 0) return Math.floor(storedRemaining);
  return getCountdownTotalFromState(state);
}

function createRecordId(prefix: string, now: string) {
  const parsed = Date.parse(now);
  const stamp = Number.isFinite(parsed) ? parsed : Date.now();
  return `${prefix}_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTodoItems(raw: unknown): TodoStateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): TodoStateItem | null => {
      if (!isRecord(item) || typeof item.text !== "string" || !item.text.trim()) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : createRecordId("todo", new Date().toISOString()),
        text: item.text,
        ...(typeof item.dueAt === "string" ? { dueAt: item.dueAt } : {}),
        ...(item.completed === true ? { completed: true } : {})
      };
    })
    .filter((item): item is TodoStateItem => item !== null);
}

function findTodoItemByText(items: TodoStateItem[], text: string) {
  const normalizeTodoMatchText = (value: string) =>
    value
      .replace(/(今天|今日|明天|明早|明晚|今晚|早上|上午|中午|下午|晚上|一会儿|待会儿|等会儿)/g, "")
      .replace(/(这个|这项|这条|待办|任务|清单|事项)/g, "")
      .replace(/\s+/g, "")
      .trim();
  const query = text.trim();
  const normalizedQuery = normalizeTodoMatchText(query);
  if (!query) return null;
  const ordinal =
    /第?一条|第?1条|第一项|第?1项|第一个|第?1个/.test(query)
      ? 0
      : /第?二条|第?2条|第二项|第?2项|第二个|第?2个/.test(query)
        ? 1
        : /第?三条|第?3条|第三项|第?3项|第三个|第?3个/.test(query)
          ? 2
          : -1;
  if (ordinal >= 0) return items[ordinal] ?? null;
  return (
    items.find((item) => item.text.trim() === query) ??
    items.find((item) => item.text.includes(query) || query.includes(item.text)) ??
    items.find((item) => {
      const normalizedItem = normalizeTodoMatchText(item.text);
      return Boolean(normalizedQuery) && (normalizedItem.includes(normalizedQuery) || normalizedQuery.includes(normalizedItem));
    }) ??
    null
  );
}

function normalizeClipboardRecords(raw: unknown): ClipboardStateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ClipboardStateItem | null => {
      if (!isRecord(item) || typeof item.text !== "string" || !item.text.trim()) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : createRecordId("clip", new Date().toISOString()),
        text: item.text,
        pinned: item.pinned === true,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
      };
    })
    .filter((item): item is ClipboardStateItem => item !== null);
}

function normalizeCityQuery(raw: string): string {
  return raw
    .replace(/(帮我查一下|帮我查|查一下|查查|查询|搜索|打开|看看|看一下|看|天气|气温|温度|冷不冷|热不热|冷吗|热吗|下雨|雨|风大|出门|穿什么|时间|几点|今天|今日|明天|现在|当前|实时|当地|本地|世界时钟|世界时间|时区|的)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGeoSearchResult(value: unknown): GeoSearchResult | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.cityCode !== "string" ||
    typeof value.name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    typeof value.timezone !== "string" ||
    typeof value.worldClockZone !== "string"
  ) {
    return undefined;
  }
  return {
    cityCode: value.cityCode,
    name: value.name,
    label: value.label,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: value.timezone,
    worldClockZone: value.worldClockZone
  };
}

async function lookupCityOnline(raw: string): Promise<GeoSearchResult | undefined> {
  const query = normalizeCityQuery(raw);
  if (!query || typeof fetch === "undefined") return undefined;
  const response = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) return undefined;
  return parseGeoSearchResult(await response.json());
}

async function resolveWeatherCity(args: WeatherCityArgs): Promise<WeatherCityTarget | undefined> {
  const raw = (args.cityCode || args.city || "").trim();
  const localCityCode = WEATHER_CITY_ALIASES[raw] ?? WEATHER_CITY_ALIASES[raw.toLowerCase()];
  if (localCityCode) return { cityCode: localCityCode };
  const city = await lookupCityOnline(raw);
  return city ? { cityCode: city.cityCode, city } : undefined;
}

async function resolveWorldClockZonesOnline(rawZones: string[]) {
  const normalizeAlias = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = new Map(
    WORLD_CLOCK_ZONE_OPTIONS.flatMap((item) => [
      [normalizeAlias(item.value), item.value],
      [normalizeAlias(item.label), item.value],
      [normalizeAlias(item.shortLabel), item.value],
      [normalizeAlias(item.value.split("|")[0]?.split("/").at(-1) ?? ""), item.value]
    ])
  );
  const zones: string[] = [];
  const labels: Record<string, string> = {};
  for (const rawZone of rawZones) {
    const trimmed = rawZone.trim();
    if (!trimmed) continue;
    const alias = aliases.get(normalizeAlias(trimmed));
    if (alias) {
      zones.push(alias);
      continue;
    }
    const city = await lookupCityOnline(trimmed);
    if (city) {
      zones.push(city.worldClockZone);
      labels[city.worldClockZone] = city.name;
    } else {
      zones.push(trimmed);
    }
  }
  return { zones, labels };
}

function isSupportedMarketCode(code: string): boolean {
  return MARKET_INDEX_CODES.has(code) || /^(us[A-Z.]{1,8}|hk\d{5}|sh\d{6}|sz\d{6})$/.test(code);
}

function normalizeDirectMarketCode(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (isSupportedMarketCode(trimmed)) return trimmed;
  const compact = trimmed.toLowerCase().replace(/[\s_-]+/g, "");
  if (MARKET_CODE_ALIASES[compact]) return MARKET_CODE_ALIASES[compact];
  if (MARKET_CODE_ALIASES[trimmed]) return MARKET_CODE_ALIASES[trimmed];
  if (/^[A-Za-z]{1,6}$/.test(trimmed)) return `us${trimmed.toUpperCase()}`;
  if (/^6\d{5}$/.test(trimmed)) return `sh${trimmed}`;
  if (/^(0|3)\d{5}$/.test(trimmed)) return `sz${trimmed}`;
  if (/^\d{1,5}$/.test(trimmed)) return `hk${trimmed.padStart(5, "0")}`;
  return undefined;
}

async function lookupMarketCodeOnline(raw: string): Promise<MarketTargetCode | undefined> {
  const query = raw
    .replace(/(我要看|想看|看一下|看看|查看|查询|搜索|打开|看|股票|股价|走势图|走势|行情|价格|图像|图表|的)/g, " ")
    .replace(/(?:^|\s)(和|及|以及|并排|放好)(?:\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || typeof fetch === "undefined") return undefined;
  const response = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) return undefined;
  const result: unknown = await response.json();
  if (!isRecord(result) || typeof result.code !== "string") return undefined;
  return {
    code: result.code,
    label: typeof result.label === "string" ? result.label : undefined
  };
}

async function normalizeMarketCodes(args: MarketSetArgs) {
  const normalizeCode = (raw: string): string | undefined => {
    return normalizeDirectMarketCode(raw);
  };
  const extractFromQuery = (raw: string): string[] => {
    const matchedAliases = Object.entries(MARKET_CODE_ALIASES)
      .filter(([alias]) => alias.length > 1 && raw.toLowerCase().includes(alias.toLowerCase()))
      .map(([, code]) => code);
    const directCodes = [
      ...raw.matchAll(/\b(?:us[A-Z.]{1,8}|hk\d{5}|sh\d{6}|sz\d{6})\b/g),
      ...raw.matchAll(/\b[A-Z]{1,6}\b/g),
      ...raw.matchAll(/\b\d{5,6}\b/g)
    ].map((match) => normalizeCode(match[0])).filter((code): code is string => Boolean(code));
    return [...matchedAliases, ...directCodes];
  };
  const rawCodes = [
    ...(args.indexCodes ?? []),
    ...(args.symbols ?? []),
    ...(args.indexCode ? [args.indexCode] : []),
    ...(args.symbol ? [args.symbol] : []),
    ...(args.query ? extractFromQuery(args.query) : [])
  ];
  const normalizedTargets: MarketTargetCode[] = rawCodes
    .map(normalizeCode)
    .filter((code): code is string => Boolean(code))
    .map((code) => ({ code }));
  const rawLookups = [
    ...(args.indexCodes ?? []),
    ...(args.indexCode ? [args.indexCode] : []),
    ...(args.symbols ?? []),
    ...(args.symbol ? [args.symbol] : []),
    ...(args.query ? [args.query] : [])
  ].filter((item) => !normalizeDirectMarketCode(item));
  for (const rawLookup of rawLookups) {
    const found = await lookupMarketCodeOnline(rawLookup);
    if (found) normalizedTargets.push(found);
  }
  const cleaned = normalizedTargets.filter(
    (target, index, list) =>
      isSupportedMarketCode(target.code) && list.findIndex((item) => item.code === target.code) === index
  );
  return cleaned.slice(0, 4);
}

function normalizeConverterArgs(args: ConverterSetArgs) {
  const category = args.category && CONVERTER_UNITS[args.category] ? args.category : "length";
  const units = CONVERTER_UNITS[category];
  const fromUnit = args.fromUnit && units.includes(args.fromUnit) ? args.fromUnit : units[0];
  const toUnit = args.toUnit && units.includes(args.toUnit) ? args.toUnit : units[1] ?? units[0];
  return { category, fromUnit, toUnit, inputValue: String(args.value) };
}

function normalizeTranslateLang(value: string | undefined, fallback: string) {
  return value && TRANSLATE_LANGS.has(value) ? value : fallback;
}

function widgetStateActions(store: WidgetStateActionStore): Array<AssistantAction<any>> {
  return [
    defineAction<NoteWriteArgs>({
      spec: {
        name: "note.write",
        description: "Write or append text in a note widget.",
        parameters: noteWriteSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "note",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "note");
        if (isToolResult(target)) return target;
        const current = typeof target.widget.state.content === "string" ? target.widget.state.content : "";
        const nextContent = args.mode === "append" && current ? `${current}\n${args.content}` : args.content;
        await patchWidgetState(store, target.widget, { content: nextContent }, context);
        return success("已写入便签", { widgetId: target.widget.id, characters: nextContent.length });
      }
    }),
    defineAction<NoteClearArgs>({
      spec: {
        name: "note.clear",
        description: "Clear the content of a note widget.",
        parameters: noteClearSchema,
        risk: "destructive",
        scope: "widget-detail",
        widgetType: "note",
        requiresTarget: true
      },
      async execute(_args, context) {
        const target = getTarget(store, context, "note");
        if (isToolResult(target)) return target;
        await patchWidgetState(store, target.widget, { content: "" }, context);
        return success("已清空便签", { widgetId: target.widget.id });
      }
    }),
    defineAction<TodoAddArgs>({
      spec: {
        name: "todo.add_item",
        description: "Add a todo item to a todo widget.",
        parameters: todoAddSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "todo",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "todo");
        if (isToolResult(target)) return target;
        const items = normalizeTodoItems(target.widget.state.items);
        const nextItem = {
          id: createRecordId("todo", context.now()),
          text: args.text.trim(),
          dueAt: args.dueAt
        };
        await patchWidgetState(store, target.widget, {
          items: [...items, nextItem],
          input: "",
          inputDate: "",
          inputTime: ""
        }, context);
        return success("已新增待办", { widgetId: target.widget.id, item: nextItem });
      }
    }),
    defineAction<TodoCompleteArgs>({
      spec: {
        name: "todo.complete_item",
        description: "Complete and remove a matching todo item from a todo widget.",
        parameters: todoCompleteSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "todo",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "todo");
        if (isToolResult(target)) return target;
        const items = normalizeTodoItems(target.widget.state.items);
        const item = findTodoItemByText(items, args.text);
        if (!item) return failed("没有找到匹配的待办", "TODO_ITEM_NOT_FOUND");
        const nextItems = items.filter((candidate) => candidate.id !== item.id);
        await patchWidgetState(store, target.widget, { items: nextItems }, context);
        return success("已完成待办", { widgetId: target.widget.id, item });
      }
    }),
    defineAction<TodoClearCompletedArgs>({
      spec: {
        name: "todo.clear_completed",
        description: "Clear completed todo items from a todo widget.",
        parameters: todoClearCompletedSchema,
        risk: "destructive",
        scope: "widget-detail",
        widgetType: "todo",
        requiresTarget: true
      },
      async execute(_args, context) {
        const target = getTarget(store, context, "todo");
        if (isToolResult(target)) return target;
        const items = normalizeTodoItems(target.widget.state.items);
        const nextItems = items.filter((item) => item.completed !== true);
        await patchWidgetState(store, target.widget, { items: nextItems }, context);
        return success("已清理已完成待办", { widgetId: target.widget.id, removed: items.length - nextItems.length });
      }
    }),
    defineAction<CountdownSetArgs>({
      spec: {
        name: "countdown.set",
        description: "Set a countdown duration and optionally start it.",
        parameters: countdownSetSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "countdown",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "countdown");
        if (isToolResult(target)) return target;
        const totalSeconds = normalizeCountdownTotal(args);
        if (totalSeconds <= 0) {
          return failed("倒计时时长需要大于 0 秒", "INVALID_COUNTDOWN_DURATION");
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const start = args.start === true;
        const nowMs = Date.parse(context.now());
        await patchWidgetState(store, target.widget, {
          inputHours: String(hours),
          inputMinutes: String(minutes),
          inputSeconds: String(seconds),
          totalSeconds,
          remainingSeconds: totalSeconds,
          running: start,
          targetEndsAt: start ? (Number.isFinite(nowMs) ? nowMs : Date.now()) + totalSeconds * 1000 : 0,
          ...(typeof args.label === "string" && args.label.trim() ? { label: args.label.trim() } : {})
        }, context);
        return success(start ? "已设置并启动倒计时" : "已设置倒计时", { widgetId: target.widget.id, totalSeconds });
      }
    }),
    defineAction<CountdownControlArgs>({
      spec: {
        name: "countdown.pause",
        description: "Pause a running countdown widget without closing it.",
        parameters: countdownControlSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "countdown",
        requiresTarget: true
      },
      async execute(_args, context) {
        const target = getTarget(store, context, "countdown");
        if (isToolResult(target)) return target;
        await patchWidgetState(store, target.widget, {
          running: false,
          targetEndsAt: 0
        }, context);
        return success("已暂停倒计时", { widgetId: target.widget.id });
      }
    }),
    defineAction<CountdownControlArgs>({
      spec: {
        name: "countdown.resume",
        description: "Resume a countdown widget from its remaining time.",
        parameters: countdownControlSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "countdown",
        requiresTarget: true
      },
      async execute(_args, context) {
        const target = getTarget(store, context, "countdown");
        if (isToolResult(target)) return target;
        const remainingSeconds = getCountdownRemainingFromState(target.widget.state);
        if (remainingSeconds <= 0) {
          return failed("倒计时还没有可继续的时间", "COUNTDOWN_NOT_READY");
        }
        const nowMs = Date.parse(context.now());
        await patchWidgetState(store, target.widget, {
          remainingSeconds,
          running: true,
          targetEndsAt: (Number.isFinite(nowMs) ? nowMs : Date.now()) + remainingSeconds * 1000
        }, context);
        return success("已继续倒计时", { widgetId: target.widget.id, remainingSeconds });
      }
    }),
    defineAction<CountdownControlArgs>({
      spec: {
        name: "countdown.reset",
        description: "Reset a countdown widget to its configured duration without closing it.",
        parameters: countdownControlSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "countdown",
        requiresTarget: true
      },
      async execute(_args, context) {
        const target = getTarget(store, context, "countdown");
        if (isToolResult(target)) return target;
        const totalSeconds = getCountdownTotalFromState(target.widget.state);
        if (totalSeconds <= 0) {
          return failed("倒计时还没有设置时长", "COUNTDOWN_NOT_READY");
        }
        await patchWidgetState(store, target.widget, {
          totalSeconds,
          remainingSeconds: totalSeconds,
          running: false,
          targetEndsAt: 0
        }, context);
        return success("已重置倒计时", { widgetId: target.widget.id, totalSeconds });
      }
    }),
    defineAction<WeatherCityArgs>({
      spec: {
        name: "weather.set_city",
        description: "Set the city for a weather widget.",
        parameters: weatherCitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "weather",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "weather");
        if (isToolResult(target)) return target;
        const cityTarget = await resolveWeatherCity(args);
        if (!cityTarget) {
          return failed("暂不支持这个城市", "UNSUPPORTED_CITY");
        }
        await patchWidgetState(store, target.widget, {
          cityCode: cityTarget.cityCode,
          weatherCity: cityTarget.city,
          weatherError: "",
          weatherLoading: false
        }, context);
        return success("已切换天气城市", { widgetId: target.widget.id, cityCode: cityTarget.cityCode, city: cityTarget.city });
      }
    }),
    defineAction<CalculatorSetArgs>({
      spec: {
        name: "calculator.set_display",
        description: "Set the calculator display value.",
        parameters: calculatorSetSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "calculator",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "calculator");
        if (isToolResult(target)) return target;
        const currentDisplay = String(target.widget.state.calcDisplay ?? "");
        const display = typeof args.display === "string"
          ? inferCalculatorDisplay(args.display, currentDisplay) || args.display
          : String(args.display);
        await patchWidgetState(store, target.widget, {
          calcDisplay: display,
          calcAcc: null,
          calcOp: null,
          calcResetOnInput: true
        }, context);
        return success("已更新计算器", { widgetId: target.widget.id, display });
      }
    }),
    defineAction<HeadlineRefreshArgs>({
      spec: {
        name: "headline.request_refresh",
        description: "Request a headline widget refresh marker.",
        parameters: headlineRefreshSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "headline",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "headline");
        if (isToolResult(target)) return target;
        const requestedAt = args.requestedAt?.trim() || context.now();
        await patchWidgetState(store, target.widget, {
          headlineRefreshRequestedAt: requestedAt,
          headlineError: ""
        }, context);
        return success("已请求刷新新闻", { widgetId: target.widget.id, requestedAt });
      }
    }),
    defineAction<MarketSetArgs>({
      spec: {
        name: "market.set_indices",
        description: "Set selected market indices or stock symbols.",
        parameters: marketSetSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "market",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "market");
        if (isToolResult(target)) return target;
        const marketTargets = await normalizeMarketCodes(args);
        const indexCodes = marketTargets.map((item) => item.code);
        if (indexCodes.length === 0) {
          return failed("没有可用的行情代码", "UNSUPPORTED_MARKET_SYMBOL");
        }
        const previousLabels = stringRecord(target.widget.state.marketSymbolLabels);
        const marketSymbolLabels = Object.fromEntries(
          marketTargets
            .map((item) => [item.code, item.label ?? previousLabels[item.code] ?? ""] as const)
            .filter((entry) => entry[1])
        );
        await patchWidgetState(store, target.widget, {
          indexCode: indexCodes[0],
          indexCodes,
          marketSymbolLabels,
          marketError: "",
          marketLoading: false
        }, context);
        return success("已更新行情标的", { widgetId: target.widget.id, indexCodes });
      }
    }),
    defineAction<WorldClockSetArgs>({
      spec: {
        name: "worldClock.set_zones",
        description: "Set world clock zones.",
        parameters: worldClockSetSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "worldClock",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "worldClock");
        if (isToolResult(target)) return target;
        const compact = args.compact === true;
        const resolved = await resolveWorldClockZonesOnline(args.zones);
        const zones = normalizeWorldClockZones(resolved.zones, DEFAULT_WORLD_CLOCK_ZONES, { fill: !compact });
        const previousLabels = stringRecord(target.widget.state.worldClockZoneLabels);
        const worldClockZoneLabels = { ...previousLabels, ...resolved.labels };
        await patchWidgetState(store, target.widget, { zones, compact, worldClockZoneLabels }, context);
        return success("已更新世界时钟", { widgetId: target.widget.id, zones });
      }
    }),
    defineAction<ConverterSetArgs>({
      spec: {
        name: "converter.set",
        description: "Set converter input and units.",
        parameters: converterSetSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "converter",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "converter");
        if (isToolResult(target)) return target;
        const next = normalizeConverterArgs(args);
        await patchWidgetState(store, target.widget, next, context);
        return success("已更新换算器", { widgetId: target.widget.id, ...next });
      }
    }),
    defineAction<TranslateDraftArgs>({
      spec: {
        name: "translate.set_draft",
        description: "Set source text and languages for the translate widget without running long-form rewriting.",
        parameters: translateDraftSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "translate",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "translate");
        if (isToolResult(target)) return target;
        const sourceLang = normalizeTranslateLang(args.sourceLang, "auto");
        const targetLang = normalizeTranslateLang(args.targetLang, "zh-CN") === "auto" ? "zh-CN" : normalizeTranslateLang(args.targetLang, "zh-CN");
        await patchWidgetState(store, target.widget, {
          sourceText: args.sourceText,
          sourceLang,
          targetLang,
          translatedText: "",
          translateError: "",
          translating: false
        }, context);
        return success("已填入翻译内容", { widgetId: target.widget.id, targetLang });
      }
    }),
    defineAction<ClipboardAddArgs>({
      spec: {
        name: "clipboard.add_text",
        description: "Add a text record to clipboard history state.",
        parameters: clipboardAddSchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "clipboard",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "clipboard");
        if (isToolResult(target)) return target;
        const records = normalizeClipboardRecords(target.widget.state.items);
        const existing = records.find((item) => item.text === args.text.trim());
        const nextRecord = existing
          ? { ...existing, pinned: args.pinned ?? existing.pinned, createdAt: context.now() }
          : {
              id: createRecordId("clip", context.now()),
              text: args.text.trim(),
              pinned: args.pinned === true,
              createdAt: context.now()
            };
        const merged = [nextRecord, ...records.filter((item) => item.id !== nextRecord.id)];
        const pinned = merged.filter((item) => item.pinned);
        const unpinned = merged.filter((item) => !item.pinned).slice(0, 30);
        await patchWidgetState(store, target.widget, {
          items: [...pinned, ...unpinned],
          clipboardError: ""
        }, context);
        return success("已加入剪贴板历史", { widgetId: target.widget.id, text: nextRecord.text, pinned: nextRecord.pinned === true });
      }
    }),
    defineAction<ClipboardClearArgs>({
      spec: {
        name: "clipboard.clear",
        description: "Clear clipboard history, preserving pinned records unless requested.",
        parameters: clipboardClearSchema,
        risk: "destructive",
        scope: "widget-detail",
        widgetType: "clipboard",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "clipboard");
        if (isToolResult(target)) return target;
        const records = normalizeClipboardRecords(target.widget.state.items);
        const nextRecords = args.includePinned ? [] : records.filter((item) => item.pinned);
        await patchWidgetState(store, target.widget, {
          items: nextRecords,
          clipboardError: ""
        }, context);
        return success("已清理剪贴板历史", { widgetId: target.widget.id, remaining: nextRecords.length });
      }
    })
  ];
}

export function createWidgetStateActions(store: WidgetStateActionStore): Array<AssistantAction<any>> {
  const allowedTypes = new Set<string>(STAGE_ONE_WIDGET_TYPES);
  return widgetStateActions(store).filter((action) => {
    const type = action.spec.widgetType;
    return Boolean(type && allowedTypes.has(type));
  });
}
