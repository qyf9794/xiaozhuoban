import {
  REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
  type WidgetAssistantRegistry,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext,
  type RealtimeModuleCatalogItem,
  type RealtimeScopedModuleContext,
  inferTodoAdd,
  inferTodoCompleteText,
  parseCountdownDurationSeconds
} from "@xiaozhuoban/assistant-core";
import type { AssistantRealtimeAdapter } from "./AssistantHarness";
import type { AssistantDiagnosticEvent } from "./assistantDiagnostics";
import {
  createInitialRealtimeToolSpecs,
  createRealtimeCommandExecutionTool,
  createRealtimeSessionAudioConfig,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  decodeRealtimeToolName,
  encodeRealtimeToolName
} from "./realtimeSessionConfig";
import {
  REALTIME_ADD_WIDGET_TOOL_NAME,
  findRealtimeWidgetType,
  normalizeRealtimeIntentText,
  realtimeWidgetAliases
} from "./realtimeRoutingPolicy";
import {
  REALTIME_PLAN_SELECTION_TOOL_NAME,
  REALTIME_PLAN_SUBMISSION_TOOL_NAME,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  createRealtimeCommandPlanUpdate,
  createRealtimePlanSelectionInstructions,
  createRealtimePlanSelectionTool,
  createRealtimeCommandPlanRequestBody,
  createRealtimePlanSelectionRequestBody,
  createRealtimeScopedToolCallRequestBody,
  createRealtimeToolSelectionRequestBody,
  createRealtimeToolSelectionInstructions,
  createRealtimeToolSelectionTool,
  createScopedRealtimeContext,
  createScopedRealtimeContextForTools,
  createScopedRealtimeToolUpdate,
  serializeScopedAssistantToolForRealtime,
  parseRealtimeCommandPlanResponse,
  parseRealtimePlanSelectionArguments,
  parseRealtimeSubmittedCommandPlan,
  parseRealtimeTextToolCallResponse,
  parseRealtimeTextPlanSelectionResponse,
  parseRealtimeTextToolSelectionResponse,
  type RealtimeTextPlanSelectionStep,
  type RealtimeTextToolSelection
} from "./realtimeTextToolCall";
import { createRealtimeCapabilityCatalog } from "./capabilityCatalog";
import { buildRealtimeToolExposurePlan } from "./realtimeToolExposurePlanner";
import { estimateRealtimeResponseCost } from "./openaiCost";
import { formatAssistantResultMessage } from "./assistantResultPhrasing";

export type RealtimeConnectionStatus =
  | "disconnected"
  | "connecting"
  | "configuring"
  | "connected"
  | "failed"
  | "session_failed"
  | "microphone_denied"
  | "microphone_unavailable";

export interface OpenAIRealtimeWebRtcAdapterOptions {
  sessionEndpoint?: string;
  textToolCallEndpoint?: string;
  model?: string;
  getHighAccuracyMode?: () => boolean;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  getSafetyIdentifier?: () => string | undefined;
  onFunctionCall?: (call: AssistantToolCall) => void | Promise<void>;
  onCommand?: (
    input: string,
    options: { callId: string; commandTraceId?: string }
  ) => AssistantToolResult | Promise<AssistantToolResult>;
  onCommandPlan?: (
    input: string,
    plan: CommandPlan,
    options: { callId: string; commandTraceId?: string }
  ) => AssistantToolResult | Promise<AssistantToolResult>;
  onUserTranscript?: (
    input: string,
    options: { commandTraceId?: string; itemId?: string }
  ) => void | Promise<void>;
  onUnhandledUserTranscript?: (
    input: string,
    options: { commandTraceId?: string; itemId?: string }
  ) => void | Promise<void>;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onMicrophoneLevel?: (level: number) => void;
  onDiagnostic?: (event: AssistantDiagnosticEvent) => void;
  fetchImpl?: typeof fetch;
  sessionUpdateTimeoutMs?: number;
  connectTimeoutMs?: number;
}

type RealtimeEvent = Record<string, unknown>;
type MicrophonePermissionState = PermissionState | "unsupported" | "error";
type MicrophoneNavigator = {
  mediaDevices?: {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  };
  permissions?: {
    query?: (descriptor: { name: PermissionName }) => Promise<{ state: PermissionState }>;
  };
};
type RealtimeClosableResources = {
  dataChannel?: { close: () => void; onclose?: unknown } | null;
  peerConnection?: { close: () => void } | null;
  mediaStream?: { getTracks: () => Array<{ stop: () => void }> } | null;
};
type RealtimeConnectMode = "audio" | "text";
type PendingScopedToolSelectionResult = {
  call: AssistantToolCall;
  result: AssistantToolResult;
  commandTraceId?: string;
};
type PendingPlanSelectionResult = PendingScopedToolSelectionResult;
type ActiveRealtimePlanSelection = {
  selection: NonNullable<ReturnType<typeof parseRealtimePlanSelectionArguments>>;
  input: string;
  tools: AssistantToolSpec[];
};
type PendingTextCommandAfterSelectorUpdate = {
  events: RealtimeEvent[];
  commandTraceId: string;
  inputLength: number;
  selectorInstructions: string;
  selectorTools: unknown[];
  selectorToolChoice: RealtimeResponseToolChoice;
};
type PendingResponseCreateConflictRetry = {
  commandTraceId: string;
  responseMode: RealtimeResponseMode;
  retryCount: number;
  toolChoice?: RealtimeResponseToolChoice;
  instructions?: string;
  tools?: unknown[];
};
type PendingScopedToolResponseRetry = {
  responseMode: RealtimeResponseMode;
  instructions: string;
  tools: unknown[];
  toolChoice?: RealtimeResponseToolChoice;
  retryCount: number;
};
type PendingSelectorToolResponseRetry = {
  instructions: string;
  tools: unknown[];
  toolChoice: RealtimeResponseToolChoice;
  retryCount: number;
};
type RealtimeTargetHint = Pick<RealtimeTextToolSelection, "selectedModule" | "targetHint" | "candidateTools"> & {
  userCommand?: string;
  selectedToolName?: string;
};
type RealtimeDefinitionSummary = NonNullable<CompactAssistantContext["availableDefinitions"]>[number];
type MicrophoneLevelMonitor = {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  animationFrameId: number | null;
  kind: "microphone" | "remote";
};

const PLANNED_WIDGET_PREFIX = "planned_widget_";
const TARGET_REQUIRED_WINDOW_TOOLS = new Set([
  "widget.focus",
  "widget.fullscreen_focus",
  "widget.remove",
  "widget.move",
  "widget.resize",
  "widget.bring_to_front"
]);
const MICROPHONE_LEVEL_SILENCE_FLOOR = 0.01;
const MICROPHONE_LEVEL_GAIN = 5.2;
const MICROPHONE_LEVEL_EMIT_DELTA = 0.008;
const REMOTE_AUDIO_CLEAR_LEVEL = 0.03;
const REMOTE_AUDIO_ECHO_LEVEL = 0.035;
const MICROPHONE_ECHO_CEILING = 0.12;
const MAX_INTERRUPTED_TRACE_IDS = 32;
const MAX_RECENT_ASSISTANT_TRANSCRIPTS = 12;
const RECENT_ASSISTANT_TRANSCRIPT_TTL_MS = 12_000;
const RECENT_REALTIME_TOOL_COMPLETION_TTL_MS = 8_000;
const MAX_RECENT_REALTIME_TOOL_COMPLETIONS = 64;
const LEGACY_REALTIME_COMMAND_PLAN_TOOL_NAMES = new Set([
  "assistant.submit_plan",
  "assistant.submit_command_plan"
]);
const MAX_SCOPED_SELECTION_TOOLS = 8;
const GENERIC_SELECTION_MODULES = new Set(["app", "board", "widget", "window"]);
const MODULE_OPEN_INTENTS = new Set(["open", "add", "create", "play", "search", "set"]);
const INTENT_TOOL_PRIORITIES: Record<string, string[]> = {
  open: ["board.add_widget", "widget.focus", "app.settings.open", "app.command_palette.open", "app.ai_dialog.open"],
  close: ["widget.remove"],
  remove: ["widget.remove"],
  focus: ["widget.focus", "widget.bring_to_front"],
  fullscreen: ["widget.fullscreen_focus", "tv.fullscreen", "app.fullscreen.set"],
  move: ["widget.move"],
  resize: ["widget.resize"],
  bring_to_front: ["widget.bring_to_front"],
  search: ["music.search", "tv.select_channel", "tv.play", "market.set_indices", "weather.set_city", "headline.request_refresh"],
  play: ["music.play", "tv.play", "tv.select_channel", "recorder.play"],
  pause: ["music.pause", "tv.pause", "countdown.pause", "recorder.pause"],
  resume: ["music.resume", "countdown.resume"],
  set: ["tv.select_channel", "tv.play", "countdown.set", "weather.set_city", "market.set_indices", "worldClock.set_zones", "calculator.set_display", "converter.set", "translate.set_draft"],
  refresh: ["headline.request_refresh"],
  add: ["board.add_widget", "todo.add_item", "clipboard.add_text"],
  complete: ["todo.complete_item"],
  switch: ["board.switch", "tv.select_channel"],
  create: ["board.create", "board.add_widget"],
  rename: ["board.rename"],
  toggle: ["app.sidebar.set", "app.fullscreen.set", "dialClock.set_night_mode"],
  write: ["note.write", "clipboard.add_text", "todo.add_item", "messageBoard.send"],
  translate: ["translate.set_draft"],
  calculate: ["calculator.set_display"],
  convert: ["converter.set"]
};
const REALTIME_MAX_OUTPUT_TOKENS = 160;
const REALTIME_CONCISE_RESPONSE_INSTRUCTIONS =
  "如果是工具执行前，直接调用 function_call，不要先说话。工具执行后，只回复一句自然中文，直接说明结果，优先沿用 function_call_output 里的 message；不要说“好的”“我来”“稍等”“简单说”“概括”，不要解释过程，不要追加建议，不要重复调用工具。";
const REALTIME_CONFIRMATION_RESPONSE_INSTRUCTIONS =
  "只回复一句中文：请确认执行。不要说无法、不能、失败、没有成功；这是等待用户确认，不是执行失败。不要解释过程，不要重复调用工具。";
const REALTIME_RESPONSE_CREATE_CONFLICT_RETRY_MS = 180;
const REALTIME_RESPONSE_CREATE_CONFLICT_MAX_RETRIES = 3;
const REALTIME_SCOPED_TOOL_RESPONSE_MAX_RETRIES = 2;
const REALTIME_TRANSCRIPT_SELECTION_GRACE_MS = 1_000;
export const DEFAULT_REALTIME_SESSION_UPDATE_TIMEOUT_MS = 12_000;

type InitialRealtimeToolHint = {
  name: string;
  description: string;
};

type RealtimeSessionRequestOptions = {
  highAccuracy?: boolean;
  initialTools?: AssistantToolSpec[];
  moduleCatalog?: RealtimeModuleCatalogItem[];
};

function resolveRealtimeAdapterModel(options: Pick<OpenAIRealtimeWebRtcAdapterOptions, "model" | "getHighAccuracyMode">): string {
  return options.model ?? (options.getHighAccuracyMode?.() ? XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL : XIAOZHUOBAN_REALTIME_MODEL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  if (!value.trim()) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value };
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeTranscriptForEchoMatch(value: string): string {
  return value
    .replace(/[，。！？、,.!?;；:："'“”‘’\s]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveRealtimeMicrophoneLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumSquares += centered * centered;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return clampUnit(Math.max(0, rms - MICROPHONE_LEVEL_SILENCE_FLOOR) * MICROPHONE_LEVEL_GAIN);
}

function normalizeMusicToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  const nextArgs = { ...args };
  const keywordValues = Array.isArray(nextArgs.keywords) ? nextArgs.keywords : [nextArgs.keywords];
  const queryParts = [
    nextArgs.query,
    nextArgs.q,
    nextArgs.keyword,
    ...keywordValues,
    nextArgs.term,
    nextArgs.search,
    nextArgs.artist,
    nextArgs.artistName,
    nextArgs.singer,
    nextArgs.song,
    nextArgs.songName,
    nextArgs.songHint,
    nextArgs.title,
    nextArgs.track,
    nextArgs.trackName,
    nextArgs.musicHint,
    nextArgs.targetHint
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const query = Array.from(new Set(queryParts)).join(" ");
  if (query) {
    nextArgs.query = query;
  }
  delete nextArgs.keyword;
  delete nextArgs.keywords;
  delete nextArgs.q;
  delete nextArgs.term;
  delete nextArgs.search;
  delete nextArgs.artist;
  delete nextArgs.artistName;
  delete nextArgs.singer;
  delete nextArgs.song;
  delete nextArgs.songName;
  delete nextArgs.songHint;
  delete nextArgs.title;
  delete nextArgs.track;
  delete nextArgs.trackName;
  delete nextArgs.musicHint;
  delete nextArgs.targetHint;
  delete nextArgs.boardId;
  delete nextArgs.notAutoPlay;
  delete nextArgs.autoPlay;
  delete nextArgs.autoplay;
  return nextArgs;
}

function extractMusicQueryFromText(text: string): string {
  const normalized = normalizeRealtimeIntentText(text);
  const explicitActionMatches = [
    ...normalized.matchAll(/(?:最后听|我想听|想听|我要听|听点|播放(?!器)|放一下|放一首|来首|来一首|来个|来点|换成|换首|换一首|改成|切换成)\s*/g)
  ];
  const lastAction = explicitActionMatches.at(-1);
  const actionTarget =
    lastAction && typeof lastAction.index === "number"
      ? normalized.slice(lastAction.index + lastAction[0].length)
      : "";
  return (actionTarget || normalized)
    .replace(/^(帮我|麻烦你|麻烦|请你|请)/, "")
    .replace(/^(最后听|我想听|想听|我要听|听点|播放|放一下|放一首|来首|来一首|来个|来点|换成|换首|换一首|搜索|搜一下|搜一点|找一下|找一点|找)/, "")
    .replace(/不一定播放/g, "")
    .replace(/(但|但是)?(先|暂时)?(不|不要|别|不用)(马上)?播放/g, "")
    .replace(/((先|暂时)(别|不要|不用)?播|(别|不要|不用)播)/g, "")
    .replace(/(的歌|歌曲|音乐|歌单|不一定播放|先搜一下|先搜索一下)$/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAbsoluteMusicEntityQuery(query: string): boolean {
  const compact = query.replace(/[\s，。！？、,.!?;；:："'“”‘’]/g, "");
  if (!compact) return false;
  return !/^(?:这首|当前这首|现在这首|刚才那首|上一首|前一首|下一首|后一首|第一首|第[一二三四五六七八九十百\d]+首|搜索结果(?:里的)?第?[一二三四五六七八九十百\d]*首)$/.test(compact);
}

function comparableMusicEntityQuery(query: string): string {
  return normalizeRealtimeIntentText(query)
    .toLowerCase()
    .replace(/(?:歌曲|音乐|曲目|track|song)/gi, "")
    .replace(/的/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function isMusicNoPlayRequest(input: string): boolean {
  return /(不一定播放|暂时不播放|先不播放|先不要播放|不要播放|别播放|不用播放|不必播放|先别播|先不要播|先不播|暂时别播|不要马上播放)/.test(input);
}

function isMusicSearchRequest(input: string): boolean {
  return /(搜|搜索|查找|找一下|找一点|找些|找首|找歌|找音乐|找)/.test(input);
}

function isMusicSearchOnlyRequest(input: string): boolean {
  return isMusicNoPlayRequest(input) || /(先只找|只找|只搜索|只搜|先找|先搜索|先搜|找歌单|只找歌单|playlist)/i.test(input);
}

function isMusicExplicitPlayRequest(input: string): boolean {
  if (isMusicNoPlayRequest(input)) return false;
  return /(播放(?!器)|放一下|放一首|来首|来一首|来个|来点|换成|换首|换一首|最后听|我想听|想听|我要听|给我一首|听一下|听一首|听点)/.test(input);
}

function stripLeadingAssistantActionText(text: string): string {
  return text
    .replace(/^(帮我|麻烦你|麻烦|请你|请)/, "")
    .replace(/[，。！？、,.!?;；"'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNoteContentFromText(text: string): string {
  return stripLeadingAssistantActionText(text)
    .replace(/^打开便签(?:并|然后|后)?(?:写上|写下|记录|记下|追加)?/, "")
    .replace(/^在?便签(?:里|中)?(?:写上|写下|记录|记下|追加|新增|添加)?/, "")
    .replace(/^追加到便签[:：]?/, "")
    .replace(/^(记一下|记下|记录一下|记录|写一下|写下|写上)[:：]?/, "")
    .trim();
}

function extractTodoTextFromText(text: string): string {
  return stripLeadingAssistantActionText(text)
    .replace(/^打开待办(?:然后|并|后)?(?:添加|新增|加一条|加入)?/, "")
    .replace(/^待办(?:里|中)?(?:添加|新增|加一条|加入)?/, "")
    .replace(/^(添加|新增|加一条|加入)(?:一个|一条)?(?:待办|任务|事项)?[:：]?/, "")
    .replace(/^(提醒我|提醒|叫我|记得|别忘了)/, "")
    .trim();
}

function normalizeTvChannelNameForMatch(value: string): string {
  return value
    .toUpperCase()
    .replace(/BLOOMBERG\s*(?:TELEVISION|TV)?/g, "BLOOMBERG")
    .replace(/FRANCE\s*24/g, "FRANCE24")
    .replace(/NHK\s*WORLD\s*(?:JAPAN)?/g, "NHKWORLD")
    .replace(/高清|标清|频道|电视台|综合|新闻|财经|体育|电影|电视剧|少儿/g, "")
    .replace(/\b(?:CHANNEL|TELEVISION|TV|NEWS|LIVE|HD|WORLD|JAPAN)\b/g, "")
    .replace(/[\s_-]+/g, "")
    .trim();
}

function findContextTvChannelName(input: string, context: CompactAssistantContext | null): string {
  if (!context) return "";
  const moduleTvState = context.moduleStates?.tv as Record<string, unknown> | undefined;
  const names = [
    ...((moduleTvState?.assistantChannelNames as unknown[] | undefined) ?? []),
    ...((moduleTvState?.channelNames as unknown[] | undefined) ?? []),
    ...context.widgets
      .filter((widget) => widget.type === "tv")
      .flatMap((widget) => [
        ...((widget.assistantState?.assistantChannelNames as unknown[] | undefined) ?? []),
        ...((widget.assistantState?.channelNames as unknown[] | undefined) ?? [])
      ])
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (/电影/.test(input) && !/(央视|中央|CCTV)/i.test(input)) {
    const movieCandidates = names.filter((name) => /电影|MOVIE|CINEMA|FILM/i.test(name));
    const movie =
      movieCandidates.find((name) => /MovieSphere|Universal Movies|Top Movies|Action Movies|Comedy Movies|Drama Movies/i.test(name)) ??
      movieCandidates[0];
    if (movie) return movie;
  }
  const normalizedInput = normalizeTvChannelNameForMatch(input);
  return (
    names.find((name) => {
      const normalizedName = normalizeTvChannelNameForMatch(name);
      return Boolean(normalizedName) && (normalizedInput.includes(normalizedName) || normalizedName.includes(normalizedInput));
    }) ?? ""
  );
}

function completeTvChannelArgumentsFromContext(
  args: Record<string, unknown>,
  context: CompactAssistantContext | null,
  fallbackText: string
): Record<string, unknown> {
  if (!context || typeof args.channelUrl === "string") return args;
  const channelName = typeof args.channelName === "string" ? args.channelName.trim() : "";
  if (/电影/.test(fallbackText) && !/(央视|中央|CCTV)/i.test(fallbackText)) {
    const movieMatched = findContextTvChannelName(fallbackText, context);
    if (movieMatched && movieMatched !== channelName) return { ...args, channelName: movieMatched };
  }
  const matched = findContextTvChannelName([channelName, fallbackText].filter(Boolean).join(" "), context);
  if (!matched || matched === channelName) return args;
  return { ...args, channelName: matched };
}

function inferWidgetDefinitionTypeFromText(value: string): string {
  if (/tv|television|电视|直播|频道/i.test(value)) return "tv";
  if (/music|音乐|歌曲|播放器/i.test(value)) return "music";
  if (/todo|待办|任务|清单/i.test(value)) return "todo";
  if (/note|便签|笔记/i.test(value)) return "note";
  return "";
}

function shouldUseRealtimePlanSelectionCommand(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return false;
  if (/^(追加到?便签|在?便签|便签里|便签中|记一下|记下|记录一下|写下|写上)/.test(compact)) return false;
  if (/^(待办里|待办中|添加待办|新增任务|提醒我|提醒|叫我)/.test(compact)) return false;
  const moduleHits = [
    /电视|直播|频道|CCTV|BBC|NHK|Bloomberg|凤凰|CNA|France|DW/i,
    /音乐|歌曲|歌手|播放器|Adele|Taylor|Beyond|王菲|周杰伦|陈奕迅/i,
    /待办|任务|清单|提醒/,
    /便签|笔记|记下|写下/
  ].filter((pattern) => pattern.test(text)).length;
  if (moduleHits >= 2 && /(都打开|全部打开|全都打开|同时|一起|以及|和|、)/.test(compact)) return true;
  if (/全屏|fullscreen/i.test(compact) && /(播放|看|切到|换到|调到)/.test(compact) && /电视|直播|频道|CCTV|BBC|NHK|Bloomberg|凤凰|CNA|France|DW|AlJazeera/i.test(compact)) {
    return true;
  }
  const hasConnector = /(然后|再|并且|同时|以及|、|，|,)/.test(text);
  const actionCount = [
    /打开|新增|添加|加一条/.test(compact),
    /写下|写上|记下/.test(compact),
    /播放|切到|换到|全屏/.test(compact),
    /暂停|恢复|清空|完成/.test(compact)
  ].filter(Boolean).length;
  return hasConnector && actionCount >= 2;
}

function extractMarketIndexCodesFromText(text: string): string[] {
  const normalized = text.replace(/\s+/g, "");
  const pairs: Array<[RegExp, string]> = [
    [/(标普|标普500|S&P|sp500|spx|standard\s*&?\s*poor)/i, "usINX"],
    [/(纳指|纳斯达克|纳斯达克100|NDX|nasdaq|nasdaq\s*100)/i, "usNDX"],
    [/(道指|道琼斯|道琼斯工业|DJI|dow|dow\s*jones)/i, "usDJI"],
    [/(恒生|港股|HSI|hang\s*seng)/i, "hkHSI"],
    [/(上证|沪指|A股|a股|sh000001)/i, "sh000001"],
    [/(深成|深证|深证成指|sz399001)/i, "sz399001"]
  ];
  const codes = pairs.filter(([pattern]) => pattern.test(normalized)).map(([, code]) => code);
  if (codes.length) return Array.from(new Set(codes));
  if (/(美股|美国股市|美国市场)/.test(text)) return ["usINX", "usNDX", "usDJI"];
  if (/(港股|香港股市|香港市场)/.test(text)) return ["hkHSI"];
  return [];
}

function extractMarketQueryFromText(text: string): string {
  return text
    .replace(/(我要看|想看|看一下|看看|查看|查询|搜索|打开|看|股票|股价|走势图|走势|行情|价格|图像|图表|小工具|窗口|面板|的)/g, " ")
    .replace(/(?:^|\s)(和|及|以及|并排|放好)(?:\s|$)/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountdownToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const nextArgs = { ...args };
  const fallbackSeconds = fallbackText ? parseCountdownSecondsFromText(fallbackText) : undefined;
  if (typeof fallbackSeconds === "number" && Number.isFinite(fallbackSeconds) && fallbackSeconds > 0) {
    nextArgs.totalSeconds = fallbackSeconds;
  } else if (typeof nextArgs.totalSeconds !== "number") {
    if (typeof nextArgs.durationMs === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationMs / 1000));
    } else if (typeof nextArgs.durationSeconds === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationSeconds));
    } else if (typeof nextArgs.durationInMinutes === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationInMinutes * 60));
    } else if (typeof nextArgs.durationMinutes === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationMinutes * 60));
    } else if (typeof nextArgs.minutes === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.minutes * 60));
    } else if (typeof nextArgs.durationText === "string") {
      nextArgs.totalSeconds = parseCountdownSecondsFromText(nextArgs.durationText);
    } else if (typeof nextArgs.time === "string") {
      nextArgs.totalSeconds = parseCountdownSecondsFromText(nextArgs.time);
    } else if (fallbackText) {
      nextArgs.totalSeconds = parseCountdownSecondsFromText(fallbackText);
    }
  }
  if (typeof nextArgs.start !== "boolean" && typeof nextArgs.autoStart === "boolean") {
    nextArgs.start = nextArgs.autoStart;
  }
  if (typeof nextArgs.label !== "string" && fallbackText) {
    const label = extractCountdownLabelFromText(fallbackText);
    if (label) nextArgs.label = label;
  }
  delete nextArgs.durationMs;
  delete nextArgs.durationSeconds;
  delete nextArgs.durationInMinutes;
  delete nextArgs.durationMinutes;
  delete nextArgs.durationText;
  delete nextArgs.minutes;
  delete nextArgs.time;
  delete nextArgs.autoStart;
  return nextArgs;
}

function extractCountdownLabelFromText(text: string): string {
  const match = text.match(/(?:标题|名称|名字|标记|备注)(?:写|叫|设为|设置为|是|为)?[：:\s]*([^，。,.!?！？;；]+)/);
  return match?.[1]?.trim() ?? "";
}

function parseConverterArgsFromText(text: string): Record<string, unknown> {
  const compact = text.replace(/\s+/g, "");
  const amount = compact.match(/(\d+(?:\.\d+)?)/)?.[1];
  const unit = (patterns: Array<[RegExp, string]>) => patterns.find(([pattern]) => pattern.test(compact))?.[1];
  const fromUnit = unit([
    [/公斤|千克|kg/i, "kg"],
    [/克|g/i, "g"],
    [/斤/, "kg"],
    [/公里|千米|km/i, "km"],
    [/米|m/i, "m"]
  ]);
  const toUnit = unit([
    [/成克|到克|为克|換算成克|换算成克|转成克|to\s*g/i, "g"],
    [/成公斤|到公斤|为公斤|换算成公斤|轉成公斤|to\s*kg/i, "kg"],
    [/成公里|到公里|为公里|换算成公里|to\s*km/i, "km"],
    [/成米|到米|为米|换算成米|to\s*m/i, "m"]
  ]);
  const category = /(公斤|千克|克|斤|kg|g)/i.test(compact) ? "weight" : /(公里|千米|米|km|m)/i.test(compact) ? "length" : undefined;
  return {
    ...(amount ? { value: Number(amount) } : {}),
    ...(category ? { category } : {}),
    ...(fromUnit ? { fromUnit } : {}),
    ...(toUnit ? { toUnit } : {})
  };
}

function normalizeConverterToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const parsed = parseConverterArgsFromText(fallbackText);
  const nextArgs = { ...parsed, ...args };
  const value = nextArgs.value ?? nextArgs.amount ?? nextArgs.inputValue ?? nextArgs.sourceValue ?? nextArgs.quantity;
  if ((typeof value === "string" && value.trim()) || typeof value === "number") nextArgs.value = value;
  const fromUnit = nextArgs.fromUnit ?? nextArgs.from ?? nextArgs.sourceUnit ?? nextArgs.inputUnit;
  if (typeof fromUnit === "string" && fromUnit.trim()) nextArgs.fromUnit = fromUnit.trim();
  const toUnit = nextArgs.toUnit ?? nextArgs.to ?? nextArgs.targetUnit ?? nextArgs.outputUnit;
  if (typeof toUnit === "string" && toUnit.trim()) nextArgs.toUnit = toUnit.trim();
  if (typeof nextArgs.category !== "string") {
    const unitText = `${nextArgs.fromUnit ?? ""} ${nextArgs.toUnit ?? ""}`;
    if (/\b(kg|g)\b|公斤|千克|克|斤/i.test(unitText)) nextArgs.category = "weight";
    else if (/\b(km|m)\b|公里|千米|米/i.test(unitText)) nextArgs.category = "length";
  }
  delete nextArgs.amount;
  delete nextArgs.inputValue;
  delete nextArgs.sourceValue;
  delete nextArgs.quantity;
  delete nextArgs.from;
  delete nextArgs.sourceUnit;
  delete nextArgs.inputUnit;
  delete nextArgs.to;
  delete nextArgs.targetUnit;
  delete nextArgs.outputUnit;
  return nextArgs;
}

function extractTranslateArgsFromText(text: string): Record<string, unknown> {
  const targetLang = /(英文|英语|English|into English|to English)/i.test(text)
    ? "en"
    : /(中文|汉语|Chinese|into Chinese|to Chinese)/i.test(text)
      ? "zh-CN"
      : /(日文|日语|日本語|Japanese|into Japanese|to Japanese)/i.test(text)
        ? "ja"
        : /(西班牙语|西班牙文|Spanish|into Spanish|to Spanish)/i.test(text)
        ? "es"
      : undefined;
  const commandText = text.replace(
    /[，,；;。]\s*(?:(?:不要|别|請勿|请勿|不需要)(?:真的)?(?:执行|執行|操作|调用|調用|播放|暂停|暫停|打开|打開)(?:这|這)?(?:句|句话|句話|个命令|個命令)?).*/i,
    ""
  );
  const sourceText = commandText
    .replace(/^把/, "")
    .replace(/翻译成(?:中文|英文|英语|汉语|日文|日语|日本語|西班牙语|西班牙文)/gi, "")
    .replace(/翻译(?:为|到)(?:中文|英文|英语|汉语|日文|日语|日本語|西班牙语|西班牙文)/gi, "")
    .replace(/(?:翻译一下|翻译|是什么意思|什么意思)/gi, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    ...(sourceText ? { sourceText } : {}),
    ...(targetLang ? { targetLang } : {})
  };
}

function parseCountdownSecondsFromText(text: string): number | undefined {
  const compact = text.replace(/\s+/g, "");
  const parsed = parseCountdownDurationSeconds(compact);
  if (parsed && Number.isFinite(parsed) && parsed > 0) return parsed;
  if (/一(?:小时|小時)/.test(compact) || /1(?:小时|小時)/.test(compact)) return 3600;
  if (/五(?:分钟|分鐘|分)/.test(compact) || /5(?:分钟|分鐘|分)/.test(compact)) return 300;
  if (/十(?:分钟|分鐘|分)/.test(compact) || /10(?:分钟|分鐘|分)/.test(compact)) return 600;
  if (/十五(?:分钟|分鐘|分)/.test(compact) || /15(?:分钟|分鐘|分)/.test(compact)) return 900;
  if (/三(?:分钟|分鐘|分)/.test(compact) || /3(?:分钟|分鐘|分)/.test(compact)) return 180;
  if (/半小时|半小時/.test(compact)) return 1800;
  return undefined;
}

function isPureOpenWidgetText(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return false;
  if (!/^(打开|打開|开启|開啟|唤出|喚出|调出|調出|新建|添加|加一个|加一個)/.test(compact)) return false;
  return !/(然后|然後|再|同时|同時|并且|並且|全屏|切到|播放(?!器)|暂停|暫停|搜索|查|设置|設置|设为|設為|倒计时|倒計時|分钟|分鐘|秒|小时|小時|提醒|记一下|記一下|写|寫|翻译|翻譯)/.test(compact);
}

function hasWidgetOpenVerb(text: string): boolean {
  return /(打开|打開|开启|開啟|启动|啟動|唤出|喚出|调出|調出|新建|添加|加一个|加一個|加个|加個|来个|來個|来一个|來一個)/.test(
    text.replace(/\s+/g, "")
  );
}

function canOpenMissingWidgetForSelectedTool(
  input: string,
  selectedModule: string | undefined,
  selectedToolName: string | undefined,
  intent: string | undefined
): boolean {
  if (!selectedModule || !selectedToolName) return false;
  if (isPureOpenWidgetText(input)) return true;
  if (hasWidgetOpenVerb(input) && MODULE_OPEN_INTENTS.has(intent ?? "")) return true;
  if (selectedModule === "tv") {
    if (/^tv\.(play|select_channel)$/.test(selectedToolName)) return true;
    return false;
  }
  if (selectedModule === "music") {
    return /^music\.(play|search)$/.test(selectedToolName);
  }
  if (selectedModule === "weather") {
    return selectedToolName === "weather.set_city";
  }
  if (selectedModule === "countdown") {
    return selectedToolName === "countdown.set";
  }
  if (selectedModule === "note") {
    return selectedToolName === "note.write";
  }
  if (selectedModule === "todo") {
    return selectedToolName === "todo.add_item";
  }
  if (selectedModule === "market") {
    return selectedToolName === "market.set_indices";
  }
  if (selectedModule === "converter") {
    return selectedToolName === "converter.set";
  }
  if (selectedModule === "translate") {
    return selectedToolName === "translate.set_draft";
  }
  if (selectedModule === "recorder") {
    return selectedToolName === "recorder.start";
  }
  return false;
}

function normalizeNoteToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  const nextArgs = { ...args };
  if (typeof nextArgs.content !== "string" && typeof nextArgs.text === "string") {
    nextArgs.content = nextArgs.text;
  }
  delete nextArgs.text;
  return nextArgs;
}

function normalizeTodoToolArguments(toolName: string, args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const nextArgs = { ...args };
  const now = new Date();
  if (typeof nextArgs.text !== "string") {
    const text =
      nextArgs.itemRef ??
      nextArgs.item ??
      nextArgs.task ??
      nextArgs.title ??
      nextArgs.content ??
      nextArgs.query ??
      fallbackText;
    if (typeof text === "string" && text.trim()) {
      nextArgs.text = text.trim();
    }
  }
  if (toolName === "todo.add_item" && typeof nextArgs.text === "string") {
    let nextText = nextArgs.text;
    const inferred = fallbackText ? inferTodoAdd(fallbackText, now) : undefined;
    if (typeof nextArgs.dueAt !== "string" && inferred?.dueAt) {
      nextArgs.dueAt = inferred.dueAt;
    }
    nextText = nextText
      .replace(/^(给?待办(?:里|中)?(?:加|添加)?一条|在?待办(?:里|中)?(?:加|添加)?一条|添加待办|加一条待办|待办[:：]?)/, "")
      .trim() || nextText;
    if (inferred?.text && (/([今明后]天|今晚|明早|明晚|下周|星期|礼拜|\d{1,2}[:：]\d{2}|[零〇一二两三四五六七八九十\d]+点|提醒我|提醒|叫我|记得|别忘了)/.test(nextText) || nextText.length > inferred.text.length + 4)) {
      nextText = inferred.text;
    }
    nextArgs.text = nextText;
  }
  if (toolName === "todo.complete_item" && typeof nextArgs.text === "string") {
    let nextText = nextArgs.text;
    const inferred = fallbackText ? inferTodoCompleteText(fallbackText) : "";
    if (inferred) nextText = inferred;
    nextText = nextText.replace(/^(把|将)?/, "").replace(/(标记为完成|标记完成|完成|勾掉|做完)$/, "").trim() || nextText;
    nextText = nextText.replace(/(?:这个|这项|该)(待办|任务|事项|清单)$/, "").replace(/^完成/, "").trim() || nextText;
    nextArgs.text = nextText;
  }
  delete nextArgs.itemRef;
  delete nextArgs.item;
  delete nextArgs.task;
  delete nextArgs.title;
  delete nextArgs.content;
  delete nextArgs.query;
  return nextArgs;
}

function normalizeMarketToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const nextArgs = { ...args };
  if (Array.isArray(nextArgs.indexCodeHints) && !Array.isArray(nextArgs.indexCodes)) nextArgs.indexCodes = nextArgs.indexCodeHints;
  if (typeof nextArgs.indexCodeHints === "string" && !Array.isArray(nextArgs.indexCodes)) nextArgs.indexCodes = [nextArgs.indexCodeHints];
  if (typeof nextArgs.query !== "string") {
    const query = nextArgs.companyName ?? nextArgs.company ?? nextArgs.name ?? nextArgs.stockName ?? nextArgs.stockLookupHint ?? nextArgs.ticker ?? fallbackText;
    if (typeof query === "string" && query.trim()) {
      nextArgs.query = query.trim();
    }
  }
  if (typeof nextArgs.symbols === "string") nextArgs.symbols = [nextArgs.symbols];
  if (typeof nextArgs.indexCodes === "string") nextArgs.indexCodes = [nextArgs.indexCodes];
  delete nextArgs.companyName;
  delete nextArgs.company;
  delete nextArgs.name;
  delete nextArgs.stockName;
  delete nextArgs.stockLookupHint;
  delete nextArgs.indexCodeHints;
  delete nextArgs.ticker;
  return nextArgs;
}

function extractWorldClockZonesFromText(input: string): string[] {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const stripped = text
    .replace(/(世界时钟|世界时间|本地时间|当地时间|现在几点|几点|时间|时区|显示|添加|查一下|查询|查|看一下|看|我想|比较|当地|现在)/g, " ")
    .replace(/\b(current|local|time|times|timezone|time zone|show|add|compare|check|what time|now|in)\b/gi, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1,$2")
    .replace(/[?？。.!！]/g, " ");
  const zones = stripped
    .split(/[、,，/|;；]+|(?:\s*(?:和|与|以及|还有|and|with)\s*)|\s{2,}/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !/^(的|了|一下|please)$/i.test(item));
  return [...new Set(zones)].slice(0, 6);
}

function normalizeWorldClockToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const zones = args.zones ?? args.cities ?? args.city ?? args.timezones ?? args.timezone ?? args.locations ?? args.target ?? args.targetHint;
  const nextArgs = { ...args };
  if (typeof zones === "string" && zones.trim()) nextArgs.zones = [zones.trim()];
  if (Array.isArray(zones)) nextArgs.zones = zones.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if ((!Array.isArray(nextArgs.zones) || nextArgs.zones.length === 0) && fallbackText) {
    const fallbackZones = extractWorldClockZonesFromText(fallbackText);
    if (fallbackZones.length > 0) nextArgs.zones = fallbackZones;
  }
  delete nextArgs.cities;
  delete nextArgs.city;
  delete nextArgs.timezones;
  delete nextArgs.timezone;
  delete nextArgs.locations;
  delete nextArgs.target;
  delete nextArgs.targetHint;
  return nextArgs;
}

function shouldPinClipboardTextFromCommand(input: string): boolean {
  return /(固定|置顶|置頂|钉住|釘住|\bpin(?:ned)?\b)/i.test(input);
}

function isReminderTodoCommand(input: string): boolean {
  const normalized = input.replace(/\s+/g, "");
  if (!/(提醒我|提醒|叫我|记得|别忘了)/.test(normalized)) return false;
  if (/^(倒计时|倒計時|计时器|計時器|定时器|定時器|定时|定時)/.test(normalized)) return false;
  return /提醒我.+|叫我.+|记得.+|别忘了.+/.test(normalized);
}

function isExplicitNoteWriteCommand(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  if (/^(?:在?便签(?:里|中)?|追加到?便签|便签里|便签中|笔记里|笔记中).*(?:写|记|记录|追加|添加)/.test(normalized)) {
    return true;
  }
  return /^(?:记一下|记下|记录一下|写下|写上|帮我记一下|帮我记下|帮我记录一下)[：:\s，,]/.test(normalized);
}

function isClipboardClearCommand(input: string): boolean {
  const normalized = input.replace(/\s+/g, "");
  return /(剪贴板|剪貼板|复制板|clipboard)/i.test(normalized) && /(清空|清理|清一下|清掉|清除|删除历史|清历史)/.test(normalized);
}

function looksLikeTvDefinitionId(value: unknown): boolean {
  return typeof value === "string" && /(^|[_-])tv([_-]|$)/i.test(value);
}

function hasExplicitTvChannelText(value: string): boolean {
  return /(BBC|CNN|CCTV|CGTN|Bloomberg|彭博|央视|频道|台|电影|新闻|体育|财经|少儿|卫视|\d+)/i.test(value);
}

function extractTvChannelNameFromText(value: string): string {
  if (/BBC/i.test(value)) return "BBC";
  if (/CNN/i.test(value)) return "CNN";
  if (/CGTN/i.test(value)) return "CGTN";
  if (/CNA/i.test(value)) return "CNA";
  if (/NHK\s*World(?:-Japan)?|NHK/i.test(value)) return "NHK World-Japan";
  if (/Al\s*Jazeera/i.test(value)) return "Al Jazeera English";
  if (/France\s*24/i.test(value)) return "France 24 English";
  if (/DW\s*English|Deutsche\s*Welle/i.test(value)) return "DW English";
  if (/凤凰中文|Phoenix\s*Chinese/i.test(value)) return "凤凰中文";
  if (/Bloomberg|彭博/i.test(value)) return "Bloomberg";
  const cctv = value.match(/CCTV\s*[-_]?\s*(\d{1,2})/i);
  if (cctv) return `CCTV${cctv[1]}`;
  if (/央视.*新闻|新闻.*央视|CCTV\s*13/i.test(value)) return "CCTV13";
  if (/体育|五套|5套/.test(value)) return "CCTV5";
  return "";
}

function normalizeTvToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  const nextArgs = { ...args };
  const rawChannel =
    typeof nextArgs.channelName === "string"
      ? nextArgs.channelName
      : typeof nextArgs.channel === "string"
        ? nextArgs.channel
        : typeof nextArgs.station === "string"
          ? nextArgs.station
          : "";
  const channelName = extractTvChannelNameFromText([rawChannel, fallbackText].filter(Boolean).join(" "));
  if (channelName) {
    nextArgs.channelName = channelName;
  }
  delete nextArgs.channel;
  delete nextArgs.station;
  delete nextArgs.action;
  return nextArgs;
}

function normalizeWeatherToolArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  if (
    (typeof args.city === "string" && args.city.trim()) ||
    (typeof args.cityCode === "string" && args.cityCode.trim())
  ) {
    return { ...args };
  }
  const nextArgs = { ...args };
  const aliasedCity = [nextArgs.city, nextArgs.cityName, nextArgs.location, nextArgs.place, nextArgs.query]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const commonCity = fallbackText.match(
    /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|重庆|天津|西安|长沙|青岛|厦门|香港|澳门|台北|东京|大阪|首尔|新加坡|伦敦|巴黎|纽约|洛杉矶|波士顿|悉尼|墨尔本)/
  )?.[1];
  const contextualCity = fallbackText.match(
    /(?:看看|查询|查一下|显示|切到|设置|设为)?\s*([\p{Script=Han}A-Za-z .'-]{2,24}?)(?:今天|现在|当前)?(?:的|什么|怎么样|如何)?(?:天气|气温)/u
  )?.[1]
    ?.replace(/^(?:打开|看看|查询|查一下|显示|天气)/, "")
    .trim();
  const city = aliasedCity?.trim() || commonCity || contextualCity;
  if (city) nextArgs.city = city;
  delete nextArgs.cityName;
  delete nextArgs.location;
  delete nextArgs.place;
  delete nextArgs.query;
  return nextArgs;
}

function normalizeRealtimeToolArguments(toolName: string, args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  let nextArgs = args;
  if (toolName === "music.search" || toolName === "music.play") {
    nextArgs = normalizeMusicToolArguments(nextArgs);
    const transcriptQuery = fallbackText ? extractMusicQueryFromText(fallbackText) : "";
    const shouldTrustTranscriptEntity =
      toolName === "music.play" &&
      isMusicExplicitPlayRequest(normalizeRealtimeIntentText(fallbackText)) &&
      !isMusicNoPlayRequest(normalizeRealtimeIntentText(fallbackText)) &&
      isAbsoluteMusicEntityQuery(transcriptQuery) &&
      typeof nextArgs.resultIndex !== "number" &&
      comparableMusicEntityQuery(transcriptQuery) !== comparableMusicEntityQuery(String(nextArgs.query ?? ""));
    if (shouldTrustTranscriptEntity) {
      nextArgs = { ...nextArgs, query: transcriptQuery };
    } else if (
      (typeof nextArgs.query !== "string" || !nextArgs.query.trim()) &&
      transcriptQuery &&
      (toolName !== "music.play" || (typeof nextArgs.resultIndex !== "number" && isAbsoluteMusicEntityQuery(transcriptQuery)))
    ) {
      nextArgs = { ...nextArgs, query: transcriptQuery };
    }
  }
  if (toolName === "todo.add_item" || toolName === "todo.complete_item") {
    nextArgs = normalizeTodoToolArguments(toolName, nextArgs, fallbackText);
  }
  if (toolName === "countdown.set") {
    nextArgs = normalizeCountdownToolArguments(nextArgs, fallbackText);
  }
  if (toolName === "note.write") {
    nextArgs = normalizeNoteToolArguments(nextArgs);
  }
  if (toolName === "market.set_indices") {
    nextArgs = normalizeMarketToolArguments(nextArgs, fallbackText);
  }
  if (toolName === "tv.play" || toolName === "tv.select_channel") {
    nextArgs = normalizeTvToolArguments(nextArgs, fallbackText);
  }
  if (toolName === "weather.set_city") {
    nextArgs = normalizeWeatherToolArguments(nextArgs, fallbackText);
  }
  if (toolName === "board.add_widget") {
    nextArgs = normalizeBoardAddWidgetArguments(nextArgs, fallbackText);
  }
  if (toolName === "worldClock.set_zones") {
    nextArgs = normalizeWorldClockToolArguments(nextArgs, fallbackText);
  }
  if (toolName === "translate.set_draft") {
    nextArgs = { ...nextArgs };
    const parsed = fallbackText ? extractTranslateArgsFromText(fallbackText) : {};
    const sourceText = nextArgs.sourceText ?? nextArgs.text ?? nextArgs.content ?? nextArgs.query ?? fallbackText;
    if (typeof sourceText === "string" && sourceText.trim()) nextArgs.sourceText = sourceText.trim();
    if (
      typeof parsed.sourceText === "string" &&
      parsed.sourceText.trim() &&
      (typeof nextArgs.sourceText !== "string" ||
        !nextArgs.sourceText.trim() ||
        nextArgs.sourceText.trim() === fallbackText.trim() ||
        /翻译|翻譯|是什么意思|什么意思/.test(nextArgs.sourceText))
    ) {
      nextArgs.sourceText = parsed.sourceText.trim();
    }
    if (typeof nextArgs.sourceLanguage === "string" && typeof nextArgs.sourceLang !== "string") nextArgs.sourceLang = nextArgs.sourceLanguage;
    if (typeof nextArgs.targetLanguage === "string" && typeof nextArgs.targetLang !== "string") nextArgs.targetLang = nextArgs.targetLanguage;
    if (typeof nextArgs.srcLang === "string" && typeof nextArgs.sourceLang !== "string") nextArgs.sourceLang = nextArgs.srcLang;
    if (typeof nextArgs.tgtLang === "string" && typeof nextArgs.targetLang !== "string") nextArgs.targetLang = nextArgs.tgtLang;
    if (typeof nextArgs.targetLang !== "string" && typeof parsed.targetLang === "string") nextArgs.targetLang = parsed.targetLang;
    delete nextArgs.text;
    delete nextArgs.content;
    delete nextArgs.query;
    delete nextArgs.sourceLanguage;
    delete nextArgs.targetLanguage;
    delete nextArgs.srcLang;
    delete nextArgs.tgtLang;
  }
  if (toolName === "clipboard.add_text") {
    nextArgs = { ...nextArgs };
    const text = nextArgs.text ?? nextArgs.content ?? nextArgs.value ?? nextArgs.clipText ?? nextArgs.clipboardText ?? nextArgs.query ?? fallbackText;
    if (typeof text === "string" && text.trim()) nextArgs.text = text.trim();
    if (typeof nextArgs.pinned !== "boolean" && shouldPinClipboardTextFromCommand(fallbackText)) nextArgs.pinned = true;
    delete nextArgs.content;
    delete nextArgs.value;
    delete nextArgs.clipText;
    delete nextArgs.clipboardText;
    delete nextArgs.query;
  }
  if (toolName === "messageBoard.send") {
    nextArgs = { ...nextArgs };
    const fallbackMessage = fallbackText
      .replace(/^.*?(?:留言板)?(?:发一句|发送(?:一条|一句)?(?:消息)?|留言(?:一句|一条)?)[：:\s，,]*/i, "")
      .replace(/^[“\"']|[”\"'。]$/g, "")
      .trim();
    const text =
      nextArgs.text ??
      nextArgs.content ??
      nextArgs.message ??
      nextArgs.value ??
      nextArgs.query ??
      fallbackMessage;
    if (typeof text === "string" && text.trim()) nextArgs.text = text.trim();
    delete nextArgs.content;
    delete nextArgs.message;
    delete nextArgs.value;
    delete nextArgs.query;
  }
  if (toolName === "calculator.set_display") {
    nextArgs = { ...nextArgs };
    const display = nextArgs.display ?? nextArgs.expression ?? nextArgs.result ?? nextArgs.value ?? fallbackText;
    if ((typeof display === "string" && display.trim()) || typeof display === "number") nextArgs.display = display;
    delete nextArgs.expression;
    delete nextArgs.result;
    delete nextArgs.value;
  }
  if (toolName === "converter.set") {
    nextArgs = normalizeConverterToolArguments(nextArgs, fallbackText);
  }
  return nextArgs;
}

function normalizeBoardAddWidgetArguments(args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  let nextArgs = { ...args };
  const topLevelFollowUpName =
    typeof nextArgs.followUpName === "string"
      ? nextArgs.followUpName
      : typeof nextArgs.followUpTool === "string"
        ? nextArgs.followUpTool
        : "";
  if (topLevelFollowUpName && !isRecord(nextArgs.followUp)) {
    const followUpArgs = { ...nextArgs };
    delete followUpArgs.definitionId;
    delete followUpArgs.mobileMode;
    delete followUpArgs.followUp;
    delete followUpArgs.followUpName;
    delete followUpArgs.followUpTool;
    nextArgs.followUp = {
      name: topLevelFollowUpName,
      arguments: normalizeRealtimeToolArguments(topLevelFollowUpName, followUpArgs, fallbackText)
    };
  }
  if (typeof nextArgs.raw === "string") {
    const raw = nextArgs.raw;
    const definitionId = /"definitionId"\s*:\s*"([^"]+)"/.exec(raw)?.[1];
    if (definitionId && /countdown/.test(raw)) {
      nextArgs = {
        definitionId,
        followUp: {
          name: "countdown.set",
          arguments: { totalSeconds: parseCountdownSecondsFromText(fallbackText) ?? 600, start: true }
        }
      };
    }
  }
  if (isRecord(nextArgs.followUp)) {
    const followUp = nextArgs.followUp;
    const followUpName =
      typeof followUp.name === "string" ? followUp.name : typeof followUp.tool === "string" ? followUp.tool : "";
    const followUpArgs = isRecord(followUp.arguments)
      ? followUp.arguments
      : isRecord(followUp.args)
        ? followUp.args
        : {};
    if (followUpName === "countdown.set") {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeCountdownToolArguments(followUpArgs, fallbackText)
        }
      };
    }
    if (followUpName === "note.write") {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeNoteToolArguments(followUpArgs)
        }
      };
    }
    if (followUpName === "todo.add_item" || followUpName === "todo.complete_item") {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeTodoToolArguments(followUpName, followUpArgs, fallbackText)
        }
      };
    }
    if (followUpName === "market.set_indices") {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeMarketToolArguments(followUpArgs, fallbackText)
        }
      };
    }
    if (followUpName === "worldClock.set_zones") {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeWorldClockToolArguments(followUpArgs, fallbackText)
        }
      };
    }
    if ((followUpName === "tv.play" || followUpName === "tv.select_channel") && looksLikeTvDefinitionId(nextArgs.definitionId)) {
      nextArgs = {
        ...nextArgs,
        followUp: {
          ...followUp,
          name: followUpName,
          arguments: normalizeTvToolArguments(followUpArgs, fallbackText)
        }
      };
    }
    if (
      followUpName === "tv.play" &&
      looksLikeTvDefinitionId(nextArgs.definitionId) &&
      /全屏|fullscreen/i.test(fallbackText) &&
      !hasExplicitTvChannelText(fallbackText)
    ) {
      nextArgs = {
        ...nextArgs,
        followUp: {
          name: "tv.fullscreen",
          arguments: {}
        }
      };
    }
  }
  if (
    !isRecord(nextArgs.followUp) &&
    looksLikeTvDefinitionId(nextArgs.definitionId) &&
    /全屏|fullscreen/i.test(fallbackText) &&
    !hasExplicitTvChannelText(fallbackText)
  ) {
    nextArgs = {
      ...nextArgs,
      followUp: {
        name: "tv.fullscreen",
        arguments: {}
      }
    };
  }
  delete nextArgs.followUpName;
  delete nextArgs.followUpTool;
  return nextArgs;
}

function createRealtimeMicrophoneConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };
}

function compactTargetText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
}

function scoreDefinitionTarget(targetText: string, definition: RealtimeDefinitionSummary): number {
  if (!targetText) return 0;
  const compactName = compactTargetText(definition.name);
  const compactType = compactTargetText(definition.type);
  let score = 0;
  if (compactType && targetText.includes(compactType)) score = Math.max(score, 100 + compactType.length);
  if (compactName && targetText.includes(compactName)) score = Math.max(score, 90 + compactName.length);
  for (const alias of realtimeWidgetAliases[definition.type] ?? []) {
    const compactAlias = compactTargetText(alias);
    if (compactAlias && targetText.includes(compactAlias)) {
      score = Math.max(score, 60 + compactAlias.length);
    }
  }
  return score;
}

function scoreWindowToolTarget(targetText: string, widget: CompactAssistantContext["widgets"][number]) {
  if (!targetText) return 0;
  const compactName = compactTargetText(widget.name);
  let score = 0;
  if (compactName && targetText.includes(compactName)) score = Math.max(score, 100 + compactName.length);
  if (targetText.includes(widget.type)) score = Math.max(score, 80 + widget.type.length);
  for (const alias of realtimeWidgetAliases[widget.type] ?? []) {
    const compactAlias = compactTargetText(alias);
    if (compactAlias && targetText.includes(compactAlias)) {
      score = Math.max(score, 40 + compactAlias.length);
    }
  }
  return score;
}

function inferWindowToolTargetType(
  command: CommandPlan["commands"][number],
  plan: CommandPlan,
  context: CompactAssistantContext,
  hint?: RealtimeTargetHint
) {
  const args = isRecord(command.args) ? command.args : {};
  const explicitModule = hint?.selectedModule || (command.module && !["widget", "board", "app", "app-shell"].includes(command.module) ? command.module : "");
  if (explicitModule && context.widgets.some((widget) => widget.type === explicitModule)) {
    return explicitModule;
  }
  const targetText = [
    compactTargetText(args.targetText),
    compactTargetText(args.target),
    compactTargetText(args.widgetRef),
    compactTargetText(hint?.targetHint),
    compactTargetText(hint?.userCommand),
    compactTargetText(plan.sourceText),
    compactTargetText(plan.normalizedText)
  ].join(" ");
  if (/(当前|這個|这个|目前|现在|當前)/.test(targetText) && context.focusedWidget?.type) {
    return context.focusedWidget.type;
  }
  const scored = context.widgets
    .map((widget) => ({ widget, score: scoreWindowToolTarget(targetText, widget) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.widget.order - b.widget.order);
  if (scored[0]?.widget.type) return scored[0].widget.type;
  return context.widgets.length === 1 ? context.widgets[0]?.type ?? "" : "";
}

function bindWindowToolTargetForCall(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  tools: AssistantToolSpec[],
  hint?: RealtimeTargetHint
): AssistantToolCall {
  if (!context || !isRecord(call.arguments)) {
    return call;
  }
  const suppliedWidgetId = typeof call.arguments.widgetId === "string" ? call.arguments.widgetId : "";
  if (suppliedWidgetId && context.widgets.some((widget) => widget.widgetId === suppliedWidgetId)) return call;
  const tool = tools.find((item) => item.name === call.name);
  if (!tool?.requiresTarget) {
    return call;
  }
  const command: CommandPlan["commands"][number] = {
    id: call.id,
    module: hint?.selectedModule ?? call.name.split(".")[0] ?? "widget",
    tool: call.name,
    args: call.arguments,
    risk: tool.risk ?? "safe",
    confidence: 0.9,
    source: call.source,
    requiresHarnessValidation: true
  };
  const targetType = inferWindowToolTargetType(
    command,
    {
      id: `single_${call.id}`,
      sourceText: call.transcript ?? hint?.userCommand ?? hint?.targetHint ?? call.name,
      normalizedText: call.transcript ?? hint?.userCommand ?? hint?.targetHint ?? call.name,
      commands: [command],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: [call.id] }],
      dependencies: [],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: call.source === "learned" ? "learned" : call.source === "text" ? "text-llm" : call.source === "realtime" ? "realtime-2" : "local",
      requiresHarnessValidation: true
    },
    context,
    hint
  );
  const widget = targetType ? context.widgets.find((item) => item.type === targetType) : undefined;
  return widget ? { ...call, arguments: { ...call.arguments, widgetId: widget.widgetId } } : call;
}

function inferRealtimeResizeArgs(
  args: Record<string, unknown>,
  widget: CompactAssistantContext["widgets"][number] | undefined,
  fallbackText: string
): Record<string, unknown> {
  if (!widget) return args;
  const currentW = widget.size?.w ?? 240;
  const currentH = widget.size?.h ?? 180;
  const text = fallbackText.replace(/\s+/g, "");
  const explicitW = typeof args.w === "number" && Number.isFinite(args.w);
  const explicitH = typeof args.h === "number" && Number.isFinite(args.h);
  if (explicitW && explicitH) return args;

  let nextW = explicitW ? Math.round(args.w as number) : currentW;
  let nextH = explicitH ? Math.round(args.h as number) : currentH;
  const widthDelta =
    typeof args.widthDelta === "number"
      ? args.widthDelta
      : typeof args.deltaW === "number"
        ? args.deltaW
        : undefined;
  const heightDelta =
    typeof args.heightDelta === "number"
      ? args.heightDelta
      : typeof args.deltaH === "number"
        ? args.deltaH
        : undefined;

  if (!explicitW) {
    if (typeof widthDelta === "number" && Number.isFinite(widthDelta)) {
      nextW = currentW + widthDelta;
    } else if (/调宽|寬|宽一点|加宽|更宽/.test(text)) {
      nextW = currentW + 96;
    } else if (/窄|缩窄/.test(text)) {
      nextW = currentW - 80;
    } else if (/调大|放大|大一点|更大/.test(text)) {
      nextW = currentW + 80;
    } else if (/调小|缩小|小一点|更小/.test(text)) {
      nextW = currentW - 64;
    }
  }
  if (!explicitH) {
    if (typeof heightDelta === "number" && Number.isFinite(heightDelta)) {
      nextH = currentH + heightDelta;
    } else if (/调高|高一点|更高/.test(text)) {
      nextH = currentH + 80;
    } else if (/矮|低一点|更矮/.test(text)) {
      nextH = currentH - 64;
    } else if (/调大|放大|大一点|更大/.test(text) && !/调宽|寬|宽一点|加宽|更宽/.test(text)) {
      nextH = currentH + 64;
    } else if (/调小|缩小|小一点|更小/.test(text) && !/窄|缩窄/.test(text)) {
      nextH = currentH - 48;
    }
  }
  return { ...args, w: Math.round(nextW), h: Math.round(nextH) };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inferRealtimeMoveArgs(
  args: Record<string, unknown>,
  widget: CompactAssistantContext["widgets"][number] | undefined,
  context: CompactAssistantContext,
  fallbackText: string
): Record<string, unknown> {
  if (!widget || context.viewport?.mode === "mobile") return args;
  const viewport = context.viewport;
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return args;

  const text = fallbackText.replace(/\s+/g, "");
  const explicitX = finiteNumber(args.x);
  const explicitY = finiteNumber(args.y);
  const currentX = explicitX ?? widget.position?.x ?? 20;
  const currentY = explicitY ?? widget.position?.y ?? 20;
  const widgetW = Math.max(120, widget.size?.w ?? 240);
  const widgetH = Math.max(90, widget.size?.h ?? 180);
  const margin = 20;
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, viewport.width - widgetW - margin);
  const maxY = Math.max(minY, viewport.height - widgetH - margin);
  const centerX = Math.max(minX, Math.round((viewport.width - widgetW) / 2));
  const centerY = Math.max(minY, Math.round((viewport.height - widgetH) / 2));

  let nextX = currentX;
  let nextY = currentY;
  let inferred = false;

  if (/右上|右上角|右上方/.test(text)) {
    nextX = maxX;
    nextY = minY;
    inferred = true;
  } else if (/右下|右下角|右下方/.test(text)) {
    nextX = maxX;
    nextY = maxY;
    inferred = true;
  } else if (/左下|左下角|左下方/.test(text)) {
    nextX = minX;
    nextY = maxY;
    inferred = true;
  } else if (/左上|左上角|左上方/.test(text)) {
    nextX = minX;
    nextY = minY;
    inferred = true;
  } else if (/居中|中间|中央/.test(text)) {
    nextX = centerX;
    nextY = centerY;
    inferred = true;
  } else {
    if (/右侧|靠右|最右|右边/.test(text)) {
      nextX = maxX;
      inferred = true;
    } else if (/左侧|靠左|最左|左边/.test(text)) {
      nextX = minX;
      inferred = true;
    }
    if (/底部|下方|靠下|最下/.test(text)) {
      nextY = maxY;
      inferred = true;
    } else if (/顶部|上方|靠上|最上/.test(text)) {
      nextY = minY;
      inferred = true;
    }
  }

  if (!inferred && explicitX === undefined && explicitY === undefined) return args;
  return {
    ...args,
    x: Math.round(Math.max(minX, nextX)),
    y: Math.round(Math.max(minY, nextY))
  };
}

function completeRealtimeToolArguments(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  fallbackText: string
): AssistantToolCall {
  if (!context || !isRecord(call.arguments)) return call;
  const widgetId = typeof call.arguments.widgetId === "string" ? call.arguments.widgetId : "";
  const widget = widgetId ? context.widgets.find((item) => item.widgetId === widgetId) : undefined;
  if (call.name === "widget.resize") {
    return { ...call, arguments: inferRealtimeResizeArgs(call.arguments, widget, fallbackText) };
  }
  if (call.name === "widget.move") {
    return { ...call, arguments: inferRealtimeMoveArgs(call.arguments, widget, context, fallbackText) };
  }
  if (call.name === "tv.play" || call.name === "tv.select_channel") {
    return { ...call, arguments: completeTvChannelArgumentsFromContext(call.arguments, context, fallbackText) };
  }
  return call;
}

function inferAddWidgetDefinitionForCall(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  tools: AssistantToolSpec[],
  hint: RealtimeTargetHint | undefined,
  fallbackText: string
): AssistantToolCall {
  if (!context || call.name !== "board.add_widget" || !isRecord(call.arguments) || typeof call.arguments.definitionId === "string") {
    return call;
  }
  const selectedTool = hint?.selectedToolName
    ? tools.find((tool) => tool.name === hint.selectedToolName)
    : undefined;
  const targetType =
    (hint?.selectedModule && context.availableDefinitions?.some((definition) => definition.type === hint.selectedModule)
      ? hint.selectedModule
      : "") ||
    selectedTool?.widgetType ||
    "";
  const definition = targetType ? context.availableDefinitions?.find((item) => item.type === targetType) : undefined;
  if (!definition) return call;
  const nextArgs: Record<string, unknown> = { ...call.arguments, definitionId: definition.definitionId };
  const followUpName = selectedTool?.scope === "widget-detail" ? selectedTool.name : "";
  const input = Array.from(new Set([fallbackText, hint?.userCommand, hint?.targetHint].filter(Boolean))).join(" ");
  if (followUpName) {
    nextArgs.followUp = {
      name: followUpName,
      arguments: createFollowUpArgumentsFromText(followUpName, {}, input, context)
    };
  }
  return { ...call, arguments: nextArgs };
}

function createFollowUpArgumentsFromText(
  toolName: string,
  args: Record<string, unknown>,
  fallbackText: string,
  context?: CompactAssistantContext | null
): Record<string, unknown> {
  let nextArgs = normalizeRealtimeToolArguments(toolName, args, fallbackText);
  if (toolName === "tv.play" || toolName === "tv.select_channel") {
    nextArgs = completeTvChannelArgumentsFromContext(nextArgs, context ?? null, fallbackText);
  }
  if (toolName === "note.write" && (typeof nextArgs.content !== "string" || !nextArgs.content.trim())) {
    const content = extractNoteContentFromText(fallbackText) || fallbackText.trim();
    if (content) nextArgs = { ...nextArgs, content };
  }
  return nextArgs;
}

function repairBoardAddWidgetFollowUp(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  tools: AssistantToolSpec[],
  hint: RealtimeTargetHint | undefined,
  fallbackText: string
): AssistantToolCall {
  if (!context || call.name !== REALTIME_ADD_WIDGET_TOOL_NAME || !isRecord(call.arguments)) return call;
  const args = call.arguments;
  const followUp = isRecord(args.followUp) ? args.followUp : {};
  const followUpName =
    typeof followUp.name === "string"
      ? followUp.name
      : typeof followUp.tool === "string"
        ? followUp.tool
        : "";
  if (followUpName === "tv.fullscreen" && extractTvChannelNameFromText(fallbackText)) {
    return {
      ...call,
      arguments: {
        ...args,
        followUp: {
          name: "tv.play",
          arguments: createFollowUpArgumentsFromText("tv.play", {}, fallbackText, context)
        }
      }
    };
  }
  const followUpArgs = isRecord(followUp.arguments)
    ? followUp.arguments
    : isRecord(followUp.args)
      ? followUp.args
      : {};
  if (followUpName && tools.some((tool) => tool.name === followUpName)) {
    return {
      ...call,
      arguments: {
        ...args,
        followUp: {
          name: followUpName,
          arguments: createFollowUpArgumentsFromText(followUpName, followUpArgs, fallbackText, context)
        }
      }
    };
  }

  const definitionId = typeof args.definitionId === "string" ? args.definitionId : "";
  const definitionType = definitionId ? context.availableDefinitions?.find((definition) => definition.definitionId === definitionId)?.type : undefined;
  const candidateTool = hint?.candidateTools
    ?.map((toolName) => tools.find((tool) => tool.name === toolName))
    .find((tool): tool is AssistantToolSpec =>
      Boolean(tool && tool.scope === "widget-detail" && (!definitionType || tool.widgetType === definitionType))
    );
  if (!candidateTool) return call;

  const nextArgs = { ...args };
  delete nextArgs.followUpName;
  delete nextArgs.followUpTool;
  nextArgs.followUp = {
    name: candidateTool.name,
    arguments: createFollowUpArgumentsFromText(candidateTool.name, followUpArgs, fallbackText, context)
  };
  return { ...call, arguments: nextArgs };
}

function wrapMissingWidgetDetailCallWithAddWidget(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  tool: AssistantToolSpec | undefined,
  fallbackText: string
): AssistantToolCall {
  if (!context || !tool || tool.scope !== "widget-detail" || !tool.requiresTarget || !tool.widgetType) return call;
  if (context.widgets.some((widget) => widget.type === tool.widgetType)) return call;
  const definition = context.availableDefinitions?.find((item) => item.type === tool.widgetType);
  if (!definition) return call;
  const shouldSkipFollowUp = tool.widgetType === "music" && isPureOpenWidgetText(fallbackText);
  const followUpArgs = isRecord(call.arguments) ? call.arguments : {};
  return {
    ...call,
    name: REALTIME_ADD_WIDGET_TOOL_NAME,
    arguments: {
      definitionId: definition.definitionId,
      ...(shouldSkipFollowUp
        ? {}
        : {
            followUp: {
              name: call.name,
              arguments: normalizeRealtimeToolArguments(call.name, followUpArgs, fallbackText)
            }
          })
    },
    transcript: fallbackText || call.transcript
  };
}

function shouldAppendTvFullscreenAfterCall(call: AssistantToolCall, fallbackText: string): boolean {
  if (!/全屏|fullscreen/i.test(fallbackText)) return false;
  if (call.name === "tv.play" || call.name === "tv.select_channel") return true;
  if (call.name !== REALTIME_ADD_WIDGET_TOOL_NAME || !isRecord(call.arguments) || !isRecord(call.arguments.followUp)) return false;
  const followUpName = typeof call.arguments.followUp.name === "string" ? call.arguments.followUp.name : "";
  return followUpName === "tv.play" || followUpName === "tv.select_channel";
}

function normalizeRealtimePlanArguments(
  plan: CommandPlan,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  planSelection?: RealtimeTextPlanSelectionStep[]
): CommandPlan {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const definitionsByType = new Map((context.availableDefinitions ?? []).map((definition) => [definition.type, definition]));
  const firstWidgetByType = new Map<string, string>();
  for (const widget of context.widgets) {
    if (!firstWidgetByType.has(widget.type)) {
      firstWidgetByType.set(widget.type, widget.widgetId);
    }
  }
  const plannedWidgetTypeByCommandId = new Map<string, string>();

  const commands = plan.commands.map((command) => {
    const tool = toolsByName.get(command.tool);
    const args = isRecord(command.args) ? { ...command.args } : {};

    if (command.tool === "board.add_widget") {
      const requestedType = typeof args.type === "string" ? args.type : typeof args.widgetType === "string" ? args.widgetType : "";
      const requestedModuleType = definitionsByType.has(command.module) ? command.module : "";
      const requestedIdType = inferWidgetDefinitionTypeFromText(`${command.id} ${command.module}`);
      const targetText = [
        requestedType,
        requestedModuleType,
        requestedIdType,
        command.module,
        typeof args.definitionType === "string" ? args.definitionType : "",
        typeof args.name === "string" ? args.name : "",
        typeof args.widgetName === "string" ? args.widgetName : "",
        typeof args.target === "string" ? args.target : "",
        typeof args.targetHint === "string" ? args.targetHint : "",
        plan.sourceText
      ]
        .filter(Boolean)
        .join(" ");
      const scoredDefinition = (context.availableDefinitions ?? [])
        .map((definition) => ({ definition, score: scoreDefinitionTarget(targetText, definition) }))
        .sort((a, b) => b.score - a.score)[0];
      const definitionId =
        typeof args.definitionId === "string"
          ? args.definitionId
          : definitionsByType.get(requestedType)?.definitionId ??
            definitionsByType.get(requestedModuleType)?.definitionId ??
            definitionsByType.get(requestedIdType)?.definitionId ??
            (scoredDefinition && scoredDefinition.score > 0 ? scoredDefinition.definition.definitionId : undefined);
      delete args.type;
      delete args.widgetType;
      delete args.definitionType;
      delete args.name;
      delete args.widgetName;
      delete args.target;
      delete args.targetHint;
      delete args.boardId;
      if (definitionId) {
        args.definitionId = definitionId;
      }
      const definitionType = (context.availableDefinitions ?? []).find((definition) => definition.definitionId === definitionId)?.type;
      if (definitionType) {
        plannedWidgetTypeByCommandId.set(command.id, definitionType);
      }
    }

    const normalizedArgs = normalizeRealtimeToolArguments(command.tool, args, plan.sourceText || plan.normalizedText || "");
    if (normalizedArgs !== args) {
      Object.keys(args).forEach((key) => delete args[key]);
      Object.assign(args, normalizedArgs);
    }
    if ((command.tool === "tv.play" || command.tool === "tv.select_channel") && typeof args.channelName !== "string") {
      const channelName = extractTvChannelNameFromText(plan.sourceText || plan.normalizedText || "");
      if (channelName) args.channelName = channelName;
    }

    if (tool?.scope === "widget-detail" && tool.widgetType && typeof args.widgetId !== "string") {
      const existingWidgetId = firstWidgetByType.get(tool.widgetType);
      args.widgetId = existingWidgetId ?? `${PLANNED_WIDGET_PREFIX}${tool.widgetType}`;
    }
    if (tool?.requiresTarget && TARGET_REQUIRED_WINDOW_TOOLS.has(command.tool) && typeof args.widgetId !== "string") {
      const selectionHint =
        planSelection?.find((step) => step.id && step.id === command.id) ??
        planSelection?.find((step) => step.name === command.tool && step.selectedModule === command.module) ??
        planSelection?.find((step) => step.name === command.tool);
      const targetType = inferWindowToolTargetType(command, plan, context, selectionHint);
      const existingWidgetId = targetType ? firstWidgetByType.get(targetType) : undefined;
      if (existingWidgetId) {
        args.widgetId = existingWidgetId;
      }
    }

    return { ...command, args };
  });

  const addCommandByType = new Map<string, string>();
  for (const command of commands) {
    const type = plannedWidgetTypeByCommandId.get(command.id);
    if (type) {
      addCommandByType.set(type, command.id);
    }
  }
  const hasAddWidgetTool = toolsByName.has("board.add_widget");
  const insertedAddBeforeCommand = new Map<string, string>();
  const commandsWithInsertedAdds: CommandPlan["commands"] = [];
  for (const command of commands) {
    const tool = toolsByName.get(command.tool);
    if (
      hasAddWidgetTool &&
      tool?.scope === "widget-detail" &&
      tool.widgetType &&
      !firstWidgetByType.has(tool.widgetType) &&
      !addCommandByType.has(tool.widgetType) &&
      definitionsByType.has(tool.widgetType)
    ) {
      const addCommandId = `cmd_add_${tool.widgetType}`;
      const definition = definitionsByType.get(tool.widgetType)!;
      commandsWithInsertedAdds.push({
        id: addCommandId,
        module: "board",
        tool: "board.add_widget",
        args: { definitionId: definition.definitionId },
        risk: "safe",
        confidence: command.confidence,
        source: command.source,
        requiresHarnessValidation: true
      });
      addCommandByType.set(tool.widgetType, addCommandId);
      insertedAddBeforeCommand.set(command.id, addCommandId);
    }
    commandsWithInsertedAdds.push(command);
  }

  let normalizedCommands = commandsWithInsertedAdds.map((command) => {
    const tool = toolsByName.get(command.tool);
    if (!tool?.widgetType || !addCommandByType.has(tool.widgetType) || command.tool === "board.add_widget") {
      return command;
    }
    const widgetId = isRecord(command.args) && typeof command.args.widgetId === "string" ? command.args.widgetId : "";
    if (widgetId && !widgetId.startsWith(PLANNED_WIDGET_PREFIX)) {
      return command;
    }
    const addCommandId = addCommandByType.get(tool.widgetType)!;
    return {
      ...command,
      dependsOn: Array.from(new Set([...(command.dependsOn ?? []), addCommandId]))
    };
  });
  if (
    /全屏|fullscreen/i.test(plan.sourceText || plan.normalizedText || "") &&
    !normalizedCommands.some((command) => command.tool === "tv.fullscreen") &&
    normalizedCommands.some((command) => command.tool === "tv.play" || command.tool === "tv.select_channel") &&
    toolsByName.has("tv.fullscreen")
  ) {
    const previousTvCommand = [...normalizedCommands].reverse().find((command) => command.tool === "tv.play" || command.tool === "tv.select_channel");
    const fullscreenCommand: CommandPlan["commands"][number] = {
      id: "cmd_tv_fullscreen",
      module: "tv",
      tool: "tv.fullscreen",
      args: previousTvCommand?.args && isRecord(previousTvCommand.args) && typeof previousTvCommand.args.widgetId === "string"
        ? { widgetId: previousTvCommand.args.widgetId }
        : {},
      risk: "safe",
      confidence: previousTvCommand?.confidence ?? plan.confidence,
      source: previousTvCommand?.source ?? "text",
      dependsOn: previousTvCommand ? [previousTvCommand.id] : undefined,
      requiresHarnessValidation: true
    };
    normalizedCommands = [...normalizedCommands, fullscreenCommand];
  }
  const groups = plan.executionGroups.map((group) => {
    const commandIds = group.commandIds.flatMap((id) => {
      const addCommandId = insertedAddBeforeCommand.get(id);
      return addCommandId ? [addCommandId, id] : [id];
    });
    const appendedFullscreen = normalizedCommands.find((command) => command.id === "cmd_tv_fullscreen");
    const commandIdsWithFullscreen =
      appendedFullscreen && !commandIds.includes(appendedFullscreen.id)
        ? [...commandIds, appendedFullscreen.id]
        : commandIds;
    const containsAddDependency = group.commandIds.some((id) => {
      const command = normalizedCommands.find((item) => item.id === id);
      return (command?.dependsOn ?? []).some((dependsOn) => commandIdsWithFullscreen.includes(dependsOn));
    });
    return containsAddDependency || appendedFullscreen
      ? { ...group, commandIds: commandIdsWithFullscreen, mode: "sequential" as const }
      : { ...group, commandIds: commandIdsWithFullscreen };
  });

  return {
    ...plan,
    commands: normalizedCommands,
    executionGroups: groups
  };
}

function createFallbackCommandPlanFromSelection(
  input: string,
  selection: NonNullable<ReturnType<typeof parseRealtimePlanSelectionArguments>>,
  tools: AssistantToolSpec[]
): CommandPlan | null {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const commands: CommandPlan["commands"] = [];
  selection.steps.forEach((step, index) => {
    const spec = toolsByName.get(step.name);
    if (!spec) return;
    commands.push({
      id: step.id || `cmd_${index + 1}`,
      module: step.selectedModule ?? spec.widgetType ?? spec.name.split(".")[0],
      tool: spec.name,
      args: {},
      risk: spec.risk === "destructive" || spec.risk === "confirm" ? spec.risk : "safe",
      confidence: step.confidence ?? 0.75,
      dependsOn: step.connector === "parallel" || index === 0 ? undefined : [selection.steps[index - 1]?.id || `cmd_${index}`],
      source: "text",
      requiresHarnessValidation: true
    });
  });
  if (!commands.length) return null;
  return {
    id: `realtime_selection_plan_${Date.now()}`,
    sourceText: input,
    normalizedText: input.trim().toLowerCase(),
    commands,
    dependencies: commands.flatMap((command) => (command.dependsOn ?? []).map((from) => ({ from, to: command.id }))),
    executionGroups: [{ id: "group_1", mode: "sequential", commandIds: commands.map((command) => command.id) }],
    confidence: Math.min(...commands.map((command) => command.confidence)),
    needsConfirmation: commands.some((command) => command.risk !== "safe"),
    createdBy: "realtime-2",
    requiresHarnessValidation: true
  };
}

function parseToolSelectionArguments(value: unknown): {
  name: string;
  candidateTools?: string[];
  selectedModule?: string;
  intent?: string;
  targetHint?: string;
  userCommand?: string;
  confidence?: number;
} | null {
  const parsed = parseArguments(value);
  if (!isRecord(parsed)) return null;
  const candidateTools = Array.isArray(parsed.candidateTools)
    ? parsed.candidateTools.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).slice(0, 4)
    : [];
  const name = typeof parsed.name === "string" ? parsed.name : candidateTools[0];
  const selectedModule = typeof parsed.selectedModule === "string" ? parsed.selectedModule : undefined;
  const intent = typeof parsed.intent === "string" ? parsed.intent : undefined;
  const targetHint = typeof parsed.targetHint === "string" ? parsed.targetHint : undefined;
  const userCommand = typeof parsed.userCommand === "string" ? parsed.userCommand : undefined;
  const fallbackName = selectedModule || intent || targetHint || userCommand;
  if (!name && !fallbackName) return null;
  const resolvedName = name || fallbackName;
  if (!resolvedName) return null;
  return {
    name: resolvedName,
    ...(candidateTools.length ? { candidateTools } : {}),
    selectedModule,
    intent,
    targetHint,
    userCommand,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined
  };
}

function parseRealtimeCommandExecutionArguments(value: unknown): { command: string } | null {
  const parsed = parseArguments(value);
  if (!isRecord(parsed)) return null;
  const command =
    typeof parsed.command === "string"
      ? parsed.command
      : typeof parsed.userCommand === "string"
        ? parsed.userCommand
        : typeof parsed.transcript === "string"
          ? parsed.transcript
          : "";
  const trimmed = command.trim();
  return trimmed ? { command: trimmed } : null;
}

const SAFE_REALTIME_DIAGNOSTIC_ARG_KEYS = new Set([
  "query",
  "text",
  "content",
  "sourceText",
  "kind",
  "resultIndex",
  "cityCode",
  "cityName",
  "zones",
  "channelName",
  "indexCode",
  "indexCodes",
  "symbol",
  "symbols",
  "definitionId",
  "boardId",
  "enabled",
  "targetLang",
  "display",
  "expression",
  "value",
  "category",
  "fromUnit",
  "toUnit",
  "sourceText",
  "content",
  "text",
  "dueAt",
  "pinned",
  "label",
  "minutes",
  "durationMinutes",
  "durationInMinutes",
  "durationMs",
  "totalSeconds",
  "start",
  "durationSeconds"
]);

function createSafeRealtimeToolCallDiagnosticData(call: AssistantToolCall): Record<string, unknown> | undefined {
  const args = isRecord(call.arguments) ? call.arguments : {};
  const data: Record<string, unknown> = {};
  for (const key of SAFE_REALTIME_DIAGNOSTIC_ARG_KEYS) {
    const value = args[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number"))
    ) {
      data[key] = value;
    }
  }
  if (call.name === "board.add_widget" && isRecord(args.followUp)) {
    const followUpName = typeof args.followUp.name === "string" ? args.followUp.name : "";
    const followUpArgs = isRecord(args.followUp.arguments) ? args.followUp.arguments : {};
    if (followUpName) data.followUpName = followUpName;
    for (const key of SAFE_REALTIME_DIAGNOSTIC_ARG_KEYS) {
      const value = followUpArgs[key];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number"))
      ) {
        data[key] = value;
      }
    }
  }
  return Object.keys(data).length ? data : undefined;
}

function shouldSendRealtimeToolResult(call: AssistantToolCall): boolean {
  return call.source === "realtime";
}

function shouldSkipInterruptedRealtimeFunctionCall(callName: string): boolean {
  return callName !== REALTIME_TOOL_SELECTION_TOOL_NAME && callName !== REALTIME_PLAN_SELECTION_TOOL_NAME;
}

function isLegacyRealtimeCommandPlanTool(name: string): boolean {
  return LEGACY_REALTIME_COMMAND_PLAN_TOOL_NAMES.has(name);
}

function extractLegacyRealtimeCommandText(call: AssistantToolCall, fallbackText = ""): string {
  const args = isRecord(call.arguments) ? call.arguments : {};
  const candidates = [
    args.command,
    args.userCommand,
    args.sourceText,
    args.normalizedText,
    args.input,
    fallbackText,
    call.transcript
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function createUserFacingRealtimeToolResult(call: AssistantToolCall, result: AssistantToolResult): AssistantToolResult {
  const isFinalSelectionShortcut =
    call.name === REALTIME_TOOL_SELECTION_TOOL_NAME &&
    isRecord(result.data) &&
    result.data.execution === "local_add_widget_shortcut";
  if ((call.name === REALTIME_TOOL_SELECTION_TOOL_NAME && !isFinalSelectionShortcut) || result.status !== "success") {
    return result;
  }
  const data = isRecord(result.data) ? { ...result.data } : {};
  return {
    ...result,
    data: {
      ...data,
      finalToolResult: true,
      assistantInstruction: REALTIME_CONCISE_RESPONSE_INSTRUCTIONS
    },
    message: formatAssistantResultMessage({
      status: result.status,
      message: result.message,
      toolName: call.name,
      data: result.data,
      seed: `${call.id}|${call.name}|${result.message}`
    })
  };
}

function normalizeRealtimeCompletionValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-:：#＃]+/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function createRealtimeToolCompletionKey(call: AssistantToolCall): string | null {
  if (call.name === "assistant.get_desktop_state") return "assistant.get_desktop_state";
  if (call.name.startsWith("assistant.")) return null;
  const args = isRecord(call.arguments) ? call.arguments : {};
  if (call.name === "tv.play" || call.name === "tv.select_channel") {
    const channel = normalizeRealtimeCompletionValue(args.channelName ?? args.channelUrl);
    return channel ? `tv.channel:${channel}` : null;
  }
  if (call.name === "tv.pause") return "tv.pause";
  if (call.name === "tv.fullscreen") return "tv.fullscreen";
  const stableArgs = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return `${call.name}:${JSON.stringify(stableArgs)}`;
}

function getRealtimeExclusiveMediaModule(callName: string): "music" | "tv" | "recorder" | "" {
  if (callName === "tv.play" || callName === "tv.select_channel") return "tv";
  if (callName === "music.play" || callName === "music.search" || callName === "music.resume" || callName === "music.next" || callName === "music.previous") {
    return "music";
  }
  if (callName === "recorder.play") return "recorder";
  return "";
}

function allowsCrossMediaRealtimeCommand(input: string): boolean {
  const text = input.replace(/\s+/g, "");
  if (!text) return false;
  const asksTv = /(电视|直播|频道|BBC|CNN|CCTV|NHK|Bloomberg|彭博|France24|CNA|HBO)/i.test(text);
  const asksMusic = /(音乐|歌|歌曲|歌手|播放列表|周杰伦|王菲|网易云|AppleMusic|轻松|放松)/i.test(text);
  const asksRecorder = /(录音|录音机|录制|录下来|播放录音)/i.test(text);
  return [asksTv, asksMusic, asksRecorder].filter(Boolean).length > 1 && /(同时|一起|都|和|并且|然后|再)/.test(text);
}

function allowsMultipleRealtimeMediaActions(input: string): boolean {
  return /(同时|一起|都|和|并且|然后|接着|顺便|再)/.test(input.replace(/\s+/g, ""));
}

function isBulkWindowSelectionText(...values: Array<string | undefined>): boolean {
  const normalized = values.filter(Boolean).join(" ").replace(/\s+/g, "");
  if (!normalized || /(保留|除了|除开|只关闭|只留下|留下|确认|先问|先确认|临时)/.test(normalized)) {
    return false;
  }
  return /(所有|全部|全都|全部的|所有的)/.test(normalized) && /(窗口|小工具|组件|面板)/.test(normalized);
}

function shouldAcceptLowConfidenceToolSelection(toolName: string, input: string, targetHint?: string): boolean {
  const text = `${input} ${targetHint ?? ""}`.replace(/\s+/g, "");
  if (!text) return false;
  if (toolName === "countdown.pause") return /暂停.*(计时|倒计时|定时器)|先别计时/.test(text);
  if (toolName === "countdown.resume") return /继续.*(计时|倒计时|定时器)|恢复计时/.test(text);
  if (toolName === "countdown.reset") return /重置.*(计时|倒计时|定时器)|重新开始计时/.test(text);
  if (toolName === "todo.complete_item") return /(完成|勾掉|做完|标记).*?(待办|任务|清单|咖啡豆|牛奶)/.test(text);
  return false;
}

function getDeclaredToolParameterKeys(tool: AssistantToolSpec | undefined): Set<string> | null {
  if (Array.isArray(tool?.argumentKeys) && tool.argumentKeys.every((key) => typeof key === "string")) {
    return new Set(tool.argumentKeys);
  }
  const parameters = isRecord(tool?.parameters) ? tool.parameters : null;
  if (Array.isArray(parameters?.argumentKeys) && parameters.argumentKeys.every((key) => typeof key === "string")) {
    return new Set(parameters.argumentKeys);
  }
  const jsonSchema = isRecord(parameters?.jsonSchema) ? parameters.jsonSchema : parameters;
  const properties = isRecord(jsonSchema?.properties) ? jsonSchema.properties : null;
  if (!jsonSchema || !properties || jsonSchema.additionalProperties !== false) return null;
  return new Set(Object.keys(properties));
}

function sanitizeRealtimeToolCallArguments(
  call: AssistantToolCall,
  tool: AssistantToolSpec | undefined,
  fallbackText = ""
): { call: AssistantToolCall; removedKeys: string[] } {
  const originalArgs = isRecord(call.arguments) ? call.arguments : {};
  const args = isRecord(call.arguments) ? normalizeRealtimeToolArguments(call.name, call.arguments, fallbackText) : {};
  const normalized = args !== originalArgs;
  const declaredKeys = getDeclaredToolParameterKeys(tool);
  if (!declaredKeys) {
    return normalized ? { call: { ...call, arguments: args }, removedKeys: [] } : { call, removedKeys: [] };
  }
  const nextArgs: Record<string, unknown> = {};
  const removedKeys: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (declaredKeys.has(key)) {
      nextArgs[key] = value;
    } else {
      removedKeys.push(key);
    }
  }
  if (!removedKeys.length && !normalized) return { call, removedKeys };
  return { call: { ...call, arguments: nextArgs }, removedKeys };
}

export function parseRealtimeFunctionCallEvent(value: unknown): AssistantToolCall | null {
  const event = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isRecord(event)) return null;

  if (event.type === "response.function_call_arguments.done") {
    const name = typeof event.name === "string" ? event.name : "";
    const callId = typeof event.call_id === "string" ? event.call_id : "";
    if (!name || !callId) return null;
    return {
      id: callId,
      name: decodeRealtimeToolName(name),
      arguments: parseArguments(event.arguments),
      source: "realtime"
    };
  }

  const item = isRecord(event.item) ? event.item : null;
  if (event.type === "response.output_item.done" && item?.type === "function_call") {
    const name = typeof item.name === "string" ? item.name : "";
    const callId = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "";
    if (!name || !callId) return null;
    return {
      id: callId,
      name: decodeRealtimeToolName(name),
      arguments: parseArguments(item.arguments),
      source: "realtime"
    };
  }

  return null;
}

export function shouldHandleRealtimeFunctionCall(
  call: AssistantToolCall | null,
  handledCallIds: Set<string>
): call is AssistantToolCall {
  if (!call) return false;
  if (handledCallIds.has(call.id)) return false;
  handledCallIds.add(call.id);
  return true;
}

export function handleRealtimeFunctionCallEvent(
  eventData: unknown,
  handledCallIds: Set<string>,
  onFunctionCall: ((call: AssistantToolCall) => void | Promise<void>) | undefined
): void {
  try {
    const call = parseRealtimeFunctionCallEvent(eventData);
    if (shouldHandleRealtimeFunctionCall(call, handledCallIds)) {
      void onFunctionCall?.(call);
    }
  } catch {
    // Ignore malformed Realtime data-channel messages.
  }
}

export function createRealtimeToolResultEvents(
  call: AssistantToolCall,
  result: AssistantToolResult,
  options: {
    activeResponseId?: string | null;
    responseMode?: RealtimeResponseMode;
    continueResponse?: boolean;
    toolChoice?: RealtimeResponseToolChoice;
    tools?: unknown[];
    instructions?: string;
  } = {}
): RealtimeEvent[] {
  const events: RealtimeEvent[] = [
    {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.id,
        output: JSON.stringify(result)
      }
    }
  ];
  const shouldContinueResponse = options.continueResponse ?? options.responseMode !== "voice";
  if (!options.activeResponseId && shouldContinueResponse) {
    events.push(
      createRealtimeResponseCreateEvent(options.responseMode ?? "text", {
        toolChoice: options.toolChoice,
        tools: options.tools,
        instructions: options.instructions
      })
    );
  }
  return events;
}

type RealtimeResponseMode = "text" | "voice";
type RealtimeResponseToolChoice = "auto" | "none" | "required" | { type: "function"; name: string };
type RealtimeResponseCreateOptions = {
  toolChoice?: RealtimeResponseToolChoice;
  tools?: unknown[];
  instructions?: string;
};

function createScopedToolCallResponseInstructions(result: AssistantToolResult): string {
  const data = isRecord(result.data) ? result.data : {};
  const scopedToolNames = Array.isArray(data.scopedTools)
    ? data.scopedTools.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  return [
    "继续执行候选工具阶段。根据当前 session.update 中的 Candidate Tool Stage、桌面上下文和真实工具 schema，直接调用一个最合适的真实工具。",
    "不要回复文字，不要再次调用 assistant.select_tool，不要调用未暴露的工具。",
    scopedToolNames.includes("music.play") && scopedToolNames.includes("music.search")
      ? "按用户要求的最终状态选择音乐动作：music.play 会解析实体并开始真实播放；只要最终状态应为播放，就调用 music.play。music.search 只用于仅展示搜索结果且不播放的请求，不能作为播放前的准备步骤。"
      : "",
    scopedToolNames.includes("tv.play") && scopedToolNames.includes("tv.select_channel")
      ? "按用户要求的最终状态选择电视动作：tv.play 会选择频道并开始播放；最终状态应为播放时调用 tv.play。tv.select_channel 只用于仅换台且不播放的请求。"
      : "",
    typeof data.userCommand === "string" && data.userCommand.trim() ? `原始用户命令：${data.userCommand.trim()}` : "",
    scopedToolNames.length
      ? `当前可调用工具：${scopedToolNames.join(", ")}`
      : "",
    typeof data.targetHint === "string" && data.targetHint.trim() ? `目标提示：${data.targetHint.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function createScopedToolCallResponseTools(
  result: AssistantToolResult,
  tools: AssistantToolSpec[],
  context: CompactAssistantContext | null
): unknown[] {
  if (!context) return [];
  const data = isRecord(result.data) ? result.data : {};
  const scopedToolNames = Array.isArray(data.scopedTools)
    ? data.scopedTools.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  if (!scopedToolNames.length) return [];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const selectedToolName = typeof data.selectedTool === "string" && data.selectedTool.trim() ? data.selectedTool.trim() : "";
  if (selectedToolName && scopedToolNames.includes(selectedToolName)) {
    const selectedTool = toolsByName.get(selectedToolName);
    return selectedTool ? [serializeScopedAssistantToolForRealtime(selectedTool, context)] : [];
  }
  return scopedToolNames
    .map((name) => toolsByName.get(name))
    .filter((tool): tool is AssistantToolSpec => Boolean(tool))
    .map((tool) => serializeScopedAssistantToolForRealtime(tool, context));
}

function getRealtimeToolSpecName(tool: unknown): string | undefined {
  if (!isRecord(tool) || typeof tool.name !== "string" || !tool.name.trim()) return undefined;
  return tool.name.trim();
}

function createScopedToolCallResponseToolChoice(
  result: AssistantToolResult,
  responseTools: unknown[]
): RealtimeResponseToolChoice | undefined {
  const data = isRecord(result.data) ? result.data : {};
  const responseToolNames = new Set(responseTools.map(getRealtimeToolSpecName).filter((name): name is string => Boolean(name)));
  const scopedTools = Array.isArray(data.scopedTools)
    ? data.scopedTools.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const selectedTool = typeof data.selectedTool === "string" && data.selectedTool.trim() ? data.selectedTool.trim() : "";
  const preferredTool = selectedTool && scopedTools.includes(selectedTool) ? selectedTool : "";
  if (!preferredTool) {
    const [onlyToolName] = Array.from(responseToolNames);
    return responseToolNames.size === 1 && onlyToolName ? { type: "function", name: onlyToolName } : undefined;
  }
  const encodedName = encodeRealtimeToolName(preferredTool);
  if (!responseToolNames.has(encodedName)) {
    const [onlyToolName] = Array.from(responseToolNames);
    return responseToolNames.size === 1 && onlyToolName ? { type: "function", name: onlyToolName } : undefined;
  }
  return { type: "function", name: encodedName };
}

function hasMountedWidgetType(context: CompactAssistantContext, widgetType: string): boolean {
  return (
    context.widgets.some((widget) => widget.type === widgetType) ||
    (context.widgetCountsByType?.[widgetType] ?? 0) > 0
  );
}

function shouldForceSelectedToolChoiceForScopedSelection(
  selectedTool: AssistantToolSpec,
  selectedModule: string | undefined,
  context: CompactAssistantContext | null,
  scopedTools: AssistantToolSpec[]
): boolean {
  if (!selectedModule || !context || selectedTool.scope !== "widget-detail") return true;
  const hasMountedModule = hasMountedWidgetType(context, selectedModule);
  const canAddMissingModule = scopedTools.some((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME);
  return hasMountedModule || !canAddMissingModule;
}

function resolveScopedToolChoiceName(
  selectedTool: AssistantToolSpec,
  selectedModule: string | undefined,
  context: CompactAssistantContext | null,
  scopedTools: AssistantToolSpec[],
  candidateMode: boolean
): string | undefined {
  const moduleContentTools = selectedModule
    ? scopedTools.filter(
        (tool) => tool.scope === "widget-detail" && tool.widgetType === selectedModule
      )
    : [];
  // assistant.select_tool produces ranked candidates, not a final decision.
  // When multiple actions remain inside the chosen module, keep tool_choice
  // required and let the scoped Realtime stage select the final action.
  if (candidateMode && moduleContentTools.length > 1) return undefined;
  if (!selectedModule || !context || selectedTool.scope !== "widget-detail") return selectedTool.name;
  const hasMountedModule = hasMountedWidgetType(context, selectedModule);
  const canAddMissingModule = scopedTools.some((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME);
  if (!hasMountedModule && canAddMissingModule) return REALTIME_ADD_WIDGET_TOOL_NAME;
  return shouldForceSelectedToolChoiceForScopedSelection(selectedTool, selectedModule, context, scopedTools) ? selectedTool.name : undefined;
}

function createRealtimeToolSelectionToolChoice(): RealtimeResponseToolChoice {
  return { type: "function", name: encodeRealtimeToolName(REALTIME_TOOL_SELECTION_TOOL_NAME) };
}

export function createRealtimeResponseCreateEvent(
  mode: RealtimeResponseMode = "text",
  options: RealtimeResponseCreateOptions = {}
): RealtimeEvent {
  return {
    type: "response.create",
    response: {
      output_modalities: mode === "voice" ? ["audio"] : ["text"],
      max_output_tokens: REALTIME_MAX_OUTPUT_TOKENS,
      instructions: options.instructions ?? REALTIME_CONCISE_RESPONSE_INSTRUCTIONS,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {})
    }
  };
}

function createRealtimeTextOnlyResponseCreateEvent(options: RealtimeResponseCreateOptions = {}): RealtimeEvent {
  return createRealtimeResponseCreateEvent("text", options);
}

export function createRealtimeTextCommandEvents(input: string, options: RealtimeResponseCreateOptions = {}): RealtimeEvent[] {
  return [
    {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: input
          }
        ]
      }
    },
    createRealtimeTextOnlyResponseCreateEvent(options)
  ];
}

function extractClientSecret(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.value === "string") return payload.value;
  const clientSecret = payload.client_secret;
  if (typeof clientSecret === "string") return clientSecret;
  if (isRecord(clientSecret) && typeof clientSecret.value === "string") return clientSecret.value;
  return "";
}

function getStringField(value: Record<string, unknown> | null | undefined, field: string): string {
  const item = value?.[field];
  return typeof item === "string" ? item : "";
}

function getNestedOpenAIError(payload: Record<string, unknown>): Record<string, unknown> | null {
  const direct = payload.error;
  if (isRecord(direct)) return direct;
  const nestedPayload = payload.payload;
  if (isRecord(nestedPayload) && isRecord(nestedPayload.error)) return nestedPayload.error;
  return null;
}

export function extractRealtimeSessionErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const direct = getStringField(payload, "error");
  if (direct) return direct;
  const openAIError = getNestedOpenAIError(payload);
  return getStringField(openAIError, "code") || getStringField(openAIError, "type");
}

export function extractRealtimeSessionErrorMessage(payload: unknown, fallback = "REALTIME_SESSION_FAILED"): string {
  if (!isRecord(payload)) return fallback;
  const code = extractRealtimeSessionErrorCode(payload);
  const status = typeof payload.status === "number" ? payload.status : undefined;
  const openAIError = getNestedOpenAIError(payload);
  const upstreamCode = getStringField(openAIError, "code") || getStringField(openAIError, "type");
  const upstreamMessage = getStringField(openAIError, "message");
  const upstreamParam = getStringField(openAIError, "param");
  const statusText = status ? `status ${status}` : "";
  const upstreamParts = [upstreamCode, upstreamParam ? `param ${upstreamParam}` : "", upstreamMessage].filter(Boolean);
  const detail = [statusText, upstreamParts.join(": ")].filter(Boolean).join(" · ");
  if (code && detail) return `${code} (${detail})`;
  return code || detail || fallback;
}

export function resolveRealtimeConnectFailureStatus(error: unknown): RealtimeConnectionStatus {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "OPENAI_API_KEY_MISSING" ||
    message === "AUTH_REQUIRED" ||
    message === "AUTH_INVALID" ||
    message === "REALTIME_CLIENT_SECRET_MISSING" ||
    message === "REALTIME_SESSION_FAILED" ||
    message === "REALTIME_SESSION_UPDATE_TIMEOUT" ||
    message.startsWith("OPENAI_REALTIME_SESSION_CREATE_FAILED") ||
    message.startsWith("OPENAI_REALTIME_SESSION_REQUEST_FAILED") ||
    message.startsWith("REALTIME_CONNECT_TIMEOUT") ||
    message.startsWith("REALTIME_SESSION_UPDATE_FAILED")
  ) {
    return "session_failed";
  }
  return "failed";
}

export function resolveRealtimeRemoteAudioStream(
  event: Pick<RTCTrackEvent, "streams" | "track">
): MediaStream | undefined {
  const remoteStream = event.streams?.[0];
  if (remoteStream) return remoteStream;
  if (!event.track || typeof MediaStream === "undefined") return undefined;
  return new MediaStream([event.track]);
}

export function extractRealtimeEventErrorMessage(event: unknown): string {
  if (!isRecord(event)) return "REALTIME_SESSION_UPDATE_FAILED";
  const error = isRecord(event.error) ? event.error : null;
  const code = getStringField(error, "code") || getStringField(error, "type");
  const message = getStringField(error, "message");
  const param = getStringField(error, "param");
  const eventId = getStringField(event, "event_id");
  const detail = [
    code,
    param ? `param ${param}` : "",
    message,
    eventId ? `event ${eventId}` : ""
  ].filter(Boolean).join(": ");
  return detail ? `REALTIME_SESSION_UPDATE_FAILED (${detail})` : "REALTIME_SESSION_UPDATE_FAILED";
}

function isIgnorableRealtimeCancelRace(message: string): boolean {
  return /response_cancel_not_active|Cancellation failed: no active response/i.test(message);
}

function isRealtimeActiveResponseConflict(message: string): boolean {
  return /conversation_already_has_active_response|already has an active response/i.test(message);
}

async function readRealtimeEndpointError(response: Response, fallback: string): Promise<Error> {
  try {
    return new Error(extractRealtimeSessionErrorMessage(await response.json(), fallback));
  } catch {
    return new Error(fallback);
  }
}

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
  onTimeout?: () => void
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout?.();
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createInitialRealtimeSessionHints(
  tools: AssistantToolSpec[] = [],
  moduleCatalog: RealtimeModuleCatalogItem[] = []
): { initialToolHints?: InitialRealtimeToolHint[]; initialModuleTypes?: string[] } {
  const initialToolHints = tools
    .filter((tool) => tool.scope === "desktop" || tool.scope === "widget-selection")
    .map((tool) => ({ name: tool.name, description: tool.description }))
    .filter((tool, index, items) => items.findIndex((candidate) => candidate.name === tool.name) === index)
    .slice(0, 24);
  const initialModuleTypes = moduleCatalog
    .map((item) => item.type)
    .filter((type, index, items) => Boolean(type) && items.indexOf(type) === index)
    .slice(0, 32);
  return {
    ...(initialToolHints.length ? { initialToolHints } : {}),
    ...(initialModuleTypes.length ? { initialModuleTypes } : {})
  };
}

export function createRealtimeSessionRequestBody(
  safetyIdentifier: string | undefined,
  options: RealtimeSessionRequestOptions = {}
): string {
  void safetyIdentifier;
  return JSON.stringify({
    ...(options.highAccuracy ? { highAccuracy: true } : {}),
    ...createInitialRealtimeSessionHints(options.initialTools, options.moduleCatalog)
  });
}

export function closeRealtimeConnectionResources(resources: RealtimeClosableResources): void {
  if (resources.dataChannel) {
    resources.dataChannel.onclose = null;
    resources.dataChannel.close();
  }
  resources.peerConnection?.close();
  resources.mediaStream?.getTracks().forEach((track) => track.stop());
}

export function resolveRealtimePeerStatus(state: string): RealtimeConnectionStatus | null {
  if (state === "failed") return "failed";
  if (state === "closed" || state === "disconnected") return "disconnected";
  return null;
}

export function shouldReuseRealtimeConnect(connecting: boolean, dataChannelState?: string): boolean {
  return connecting || dataChannelState === "connecting" || dataChannelState === "open";
}

export function isCurrentRealtimeConnectAttempt(activeAttemptId: number, attemptId: number): boolean {
  return activeAttemptId === attemptId;
}

export function shouldQueueRealtimeEventWhenClosed(event: RealtimeEvent): boolean {
  return event.type === "session.update";
}

function extractRealtimeResponseId(event: RealtimeEvent): string {
  const response = isRecord(event.response) ? event.response : null;
  return typeof response?.id === "string" ? response.id : typeof event.response_id === "string" ? event.response_id : "";
}

function extractRealtimeItemId(event: RealtimeEvent): string {
  const item = isRecord(event.item) ? event.item : null;
  return typeof event.item_id === "string" ? event.item_id : typeof item?.id === "string" ? item.id : "";
}

function extractRealtimeEventTranscript(event: RealtimeEvent): string {
  if (typeof event.transcript === "string") return event.transcript;
  if (typeof event.text === "string") return event.text;
  const item = isRecord(event.item) ? event.item : null;
  if (typeof item?.transcript === "string") return item.transcript;
  const content = Array.isArray(item?.content) ? item.content : [];
  const transcriptPart = content.find((part) => isRecord(part) && typeof part.transcript === "string");
  return isRecord(transcriptPart) && typeof transcriptPart.transcript === "string" ? transcriptPart.transcript : "";
}

function createRealtimeVoiceCommandTraceId(responseId: string): string {
  const responseSuffix = responseId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12) || Math.random().toString(36).slice(2, 8);
  return `voice_${Date.now()}_${responseSuffix}`;
}

function shouldLogRealtimeEventType(type: string): boolean {
  if (!type || type.endsWith(".delta")) return false;
  return (
    type === "error" ||
    type.startsWith("input_audio_buffer.") ||
    type.startsWith("session.") ||
    type.startsWith("response.") ||
    type.startsWith("conversation.") ||
    type.includes("transcription") ||
    type.includes("function_call")
  );
}

export function reduceRealtimeActiveResponseId(activeResponseId: string | null, event: RealtimeEvent): string | null {
  if (event.type === "response.created") {
    return extractRealtimeResponseId(event) || activeResponseId;
  }
  if (event.type === "response.done" || event.type === "response.cancelled" || event.type === "response.failed") {
    const responseId = extractRealtimeResponseId(event);
    return !responseId || responseId === activeResponseId ? null : activeResponseId;
  }
  return activeResponseId;
}

function createBearerHeaders(token: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  if (token?.trim()) {
    headers.authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function getMicrophonePermissionState(
  navigatorLike: MicrophoneNavigator | undefined
): Promise<MicrophonePermissionState> {
  const query = navigatorLike?.permissions?.query;
  if (!query) return "unsupported";
  try {
    const result = await query({ name: "microphone" as PermissionName });
    return result.state;
  } catch {
    return "error";
  }
}

export function resolveMicrophoneAccessErrorCode(error: unknown): "MICROPHONE_DENIED" | "MICROPHONE_UNAVAILABLE" {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "MICROPHONE_UNAVAILABLE";
  }
  return "MICROPHONE_DENIED";
}

export class OpenAIRealtimeWebRtcAdapter implements AssistantRealtimeAdapter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private queuedEvents: RealtimeEvent[] = [];
  private currentTools: AssistantToolSpec[] = [];
  private currentContext: CompactAssistantContext | null = null;
  private moduleRegistry: WidgetAssistantRegistry | null = null;
  private handledFunctionCallIds = new Set<string>();
  private connectPromise: Promise<void> | null = null;
  private connectionAttemptId = 0;
  private sessionReady = false;
  private sessionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private sessionReadyResolve: (() => void) | null = null;
  private sessionReadyReject: ((error: Error) => void) | null = null;
  private activeResponseId: string | null = null;
  private pendingResponseCreateAfterActiveToolResult = false;
  private pendingResponseCreateAfterActiveToolResultChoice: RealtimeResponseToolChoice | undefined;
  private pendingResponseCreateAfterActiveToolResultInstructions: string | undefined;
  private pendingResponseCreateAfterActiveToolResultTools: unknown[] | undefined;
  private pendingResponseCreateAfterActiveToolResultCommandTraceId: string | undefined;
  private activeCommandTraceId: string | null = null;
  private initialToolSelectionUpdateSent = false;
  private initialToolSelectionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeRealtimeResponseTraceId: string | null = null;
  private realtimeResponseTraceIds = new Map<string, string>();
  private realtimeItemTraceIds = new Map<string, string>();
  private functionCallTraceIds = new Map<string, string>();
  private realtimeTraceCommandToolCalls = new Set<string>();
  private realtimeTraceUserTranscripts = new Map<string, { input: string; itemId?: string }>();
  private pendingRealtimeToolSelections = new Map<
    string,
    { call: AssistantToolCall; timeout: ReturnType<typeof setTimeout> }
  >();
  private realtimeTraceCompletedToolKeys = new Map<string, Set<string>>();
  private realtimeTraceExclusiveMediaModules = new Map<string, "music" | "tv" | "recorder">();
  private realtimeTraceExclusiveMediaKeys = new Map<string, string>();
  private recentRealtimeToolCompletions = new Map<string, { createdAt: number; commandTraceId?: string; toolName: string }>();
  private interruptedRealtimeCommandTraceIds = new Set<string>();
  private suppressedEchoTraceIds = new Set<string>();
  private recentAssistantTranscripts: Array<{ transcript: string; createdAt: number }> = [];
  private activeRealtimeModel = XIAOZHUOBAN_REALTIME_MODEL;
  private microphoneLevelMonitor: MicrophoneLevelMonitor | null = null;
  private remoteAudioLevelMonitor: MicrophoneLevelMonitor | null = null;
  private microphoneLevel = 0;
  private remoteAudioLevel = 0;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private pendingScopedToolSelectionResult: PendingScopedToolSelectionResult | null = null;
  private pendingPlanSelectionResult: PendingPlanSelectionResult | null = null;
  private pendingTextCommandAfterActiveResponse: PendingTextCommandAfterSelectorUpdate | null = null;
  private pendingTextCommandAfterSelectorUpdate: PendingTextCommandAfterSelectorUpdate | null = null;
  private pendingResponseCreateConflictRetry: PendingResponseCreateConflictRetry | null = null;
  private responseCreateConflictRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  private responseCreateConflictRetryCounts = new Map<string, number>();
  private pendingToolSelectionResetAfterActiveResponse: { commandTraceId: string } | null = null;
  private activeScopedToolSelection: RealtimeTargetHint | null = null;
  private scopedToolSelectionResponseInstructions = new Map<string, string>();
  private pendingSelectorToolResponses = new Map<string, PendingSelectorToolResponseRetry>();
  private pendingScopedToolResponses = new Map<string, PendingScopedToolResponseRetry>();
  private activeRealtimePlanSelection: ActiveRealtimePlanSelection | null = null;
  private activeUserCommandTraceId: string | null = null;
  private connectMode: RealtimeConnectMode = "text";

  constructor(private readonly options: OpenAIRealtimeWebRtcAdapterOptions = {}) {}

  private emitDiagnostic(event: AssistantDiagnosticEvent): void {
    this.options.onDiagnostic?.({
      ...event,
      commandTraceId: event.commandTraceId ?? this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined
    });
  }

  private emitOpenAIUsageDiagnostics(payload: unknown, fallbackStage: string, commandTraceId?: string): void {
    if (!isRecord(payload) || !Array.isArray(payload.usageEvents)) return;
    payload.usageEvents.forEach((usageEvent) => {
      if (!isRecord(usageEvent)) return;
      this.emitDiagnostic({
        type: "openai.usage.cost_estimate",
        status: usageEvent.estimateAvailable === false ? "usage_only" : "estimated",
        commandTraceId,
        data: {
          ...usageEvent,
          stage: typeof usageEvent.stage === "string" ? usageEvent.stage : fallbackStage
        }
      });
    });
  }

  setActiveCommandTraceId(commandTraceId: string | null): void {
    this.activeCommandTraceId = commandTraceId;
  }

  connect(): Promise<void> {
    if (shouldReuseRealtimeConnect(Boolean(this.connectPromise), this.dataChannel?.readyState)) {
      return this.connectPromise ?? Promise.resolve();
    }
    if (this.dataChannel || this.peerConnection || this.mediaStream) {
      this.closeResources();
    }

    const attemptId = this.nextConnectionAttempt();
    const connectPromise = this.connectInternal(attemptId, "audio").finally(() => {
      if (this.connectPromise === connectPromise) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = connectPromise;
    return connectPromise;
  }

  connectTextOnly(): Promise<void> {
    if (shouldReuseRealtimeConnect(Boolean(this.connectPromise), this.dataChannel?.readyState)) {
      return this.connectPromise ?? Promise.resolve();
    }
    if (this.dataChannel || this.peerConnection || this.mediaStream) {
      this.closeResources();
    }

    const attemptId = this.nextConnectionAttempt();
    const connectPromise = this.connectInternal(attemptId, "text").finally(() => {
      if (this.connectPromise === connectPromise) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = connectPromise;
    return connectPromise;
  }

  private async connectInternal(attemptId: number, mode: RealtimeConnectMode): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    this.connectMode = mode;
    this.options.onStatusChange?.("connecting");
    this.emitDiagnostic({ type: "realtime.connect.start", status: "connecting", data: { mode } });
    this.handledFunctionCallIds.clear();
    this.sessionReady = false;
    this.activeResponseId = null;
    this.clearRealtimeTraceState();
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
    this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
    this.pendingResponseCreateAfterActiveToolResultTools = undefined;
    this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
    this.pendingSelectorToolResponses.clear();
    this.pendingScopedToolResponses.clear();
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingPlanSelectionResult = null;
    this.pendingTextCommandAfterActiveResponse = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.clearResponseCreateConflictRetry();
    this.pendingToolSelectionResetAfterActiveResponse = null;
    this.activeScopedToolSelection = null;
    this.activeRealtimePlanSelection = null;

    let stream: MediaStream | null = null;
    if (mode === "audio") {
      const permissionState = await getMicrophonePermissionState(navigator);
      this.emitDiagnostic({ type: "realtime.microphone.permission", status: permissionState });
      if (permissionState === "denied") {
        if (!this.isCurrentAttempt(attemptId)) {
          return;
        }
        this.options.onStatusChange?.("microphone_denied");
        this.emitDiagnostic({ type: "realtime.connect.failed", status: "microphone_denied", errorCode: "MICROPHONE_DENIED" });
        throw new Error("MICROPHONE_DENIED");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!this.isCurrentAttempt(attemptId)) {
          return;
        }
        this.options.onStatusChange?.("microphone_unavailable");
        this.emitDiagnostic({ type: "realtime.connect.failed", status: "microphone_unavailable", errorCode: "MICROPHONE_UNAVAILABLE" });
        throw new Error("MICROPHONE_UNAVAILABLE");
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(createRealtimeMicrophoneConstraints());
        this.emitDiagnostic({ type: "realtime.microphone.stream", status: "success", data: { audioTracks: stream.getAudioTracks().length } });
      } catch (error) {
        if (!this.isCurrentAttempt(attemptId)) {
          return;
        }
        const errorCode = resolveMicrophoneAccessErrorCode(error);
        this.options.onStatusChange?.(errorCode === "MICROPHONE_UNAVAILABLE" ? "microphone_unavailable" : "microphone_denied");
        this.emitDiagnostic({ type: "realtime.connect.failed", status: "microphone_error", errorCode });
        throw new Error(errorCode);
      }
      if (!this.isCurrentAttempt(attemptId)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.mediaStream = stream;
      this.startMicrophoneLevelMonitor(stream);
    } else {
      this.emitDiagnostic({ type: "realtime.microphone.permission", status: "skipped", data: { mode } });
    }

    try {
      const accessToken = await this.options.getAccessToken?.();
      const realtimeModel = resolveRealtimeAdapterModel(this.options);
      const highAccuracy = !this.options.model && Boolean(this.options.getHighAccuracyMode?.());
      const initialTools = this.getInitialSessionTools();
      const moduleCatalog = this.moduleRegistry?.getRealtimeCatalog() ?? [];
      this.activeRealtimeModel = realtimeModel;
      this.emitDiagnostic({
        type: "realtime.session.request",
        status: accessToken ? "authenticated" : "missing_auth",
        data: { model: realtimeModel, highAccuracy, initialToolCount: initialTools.length, initialModuleCount: moduleCatalog.length }
      });
      const connectTimeoutMs = this.options.connectTimeoutMs ?? 15_000;
      const sessionResponse = await withTimeout(
        fetchImpl(this.options.sessionEndpoint ?? "/api/realtime/session", {
          method: "POST",
          headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
          body: createRealtimeSessionRequestBody(this.options.getSafetyIdentifier?.(), { highAccuracy, initialTools, moduleCatalog })
        }),
        connectTimeoutMs,
        "REALTIME_CONNECT_TIMEOUT(session)",
        () => this.emitDiagnostic({ type: "realtime.session.timeout", status: "failed", errorCode: "REALTIME_CONNECT_TIMEOUT" })
      );
      if (!sessionResponse.ok) {
        let errorMessage = "";
        try {
          errorMessage = extractRealtimeSessionErrorMessage(await sessionResponse.json(), "REALTIME_SESSION_FAILED");
        } catch {
          // Keep the generic session failure if the endpoint returns a non-JSON error.
        }
        this.emitDiagnostic({
          type: "realtime.session.failed",
          status: String(sessionResponse.status),
          message: errorMessage || "REALTIME_SESSION_FAILED"
        });
        throw new Error(errorMessage || "REALTIME_SESSION_FAILED");
      }
      const secret = extractClientSecret(await sessionResponse.json());
      if (!secret) {
        this.emitDiagnostic({ type: "realtime.session.failed", status: "missing_client_secret", errorCode: "REALTIME_CLIENT_SECRET_MISSING" });
        throw new Error("REALTIME_CLIENT_SECRET_MISSING");
      }
      this.emitDiagnostic({ type: "realtime.session.created", status: "success" });
      if (!this.isCurrentAttempt(attemptId)) {
        return;
      }

      const peerConnection = new RTCPeerConnection();
      const dataChannel = peerConnection.createDataChannel("openai-realtime-data");
      this.peerConnection = peerConnection;
      this.dataChannel = dataChannel;
      const sessionReadyPromise = this.createSessionReadyPromise();

      stream?.getAudioTracks().forEach((track) => peerConnection.addTrack(track, stream as MediaStream));
      if (!stream && typeof peerConnection.addTransceiver === "function") {
        peerConnection.addTransceiver("audio", { direction: "recvonly" });
        this.emitDiagnostic({ type: "realtime.audio_transceiver.added", status: "recvonly", data: { mode } });
      }
      const handlePeerStateChange = (state: string) => {
        const status = resolveRealtimePeerStatus(state);
        if (!status) return;
        if (status === "failed") {
          this.closeResources();
        }
        this.emitDiagnostic({ type: "realtime.peer.status", status, data: { state } });
        this.options.onStatusChange?.(status);
      };
      peerConnection.onconnectionstatechange = () => handlePeerStateChange(peerConnection.connectionState);
      peerConnection.oniceconnectionstatechange = () => handlePeerStateChange(peerConnection.iceConnectionState);
      peerConnection.ontrack = (event) => {
        this.attachRemoteAudioStream(resolveRealtimeRemoteAudioStream(event));
      };

      dataChannel.onopen = () => {
        this.options.onStatusChange?.("configuring");
        this.emitDiagnostic({ type: "realtime.data_channel.open", status: "configuring" });
        this.armSessionUpdateTimeout();
        this.discardQueuedSessionUpdates("data_channel_open");
        this.sendInitialToolSelectionUpdateIfReady("data_channel_open");
      };
      dataChannel.onmessage = (event) => this.handleRealtimeEventData(event.data);
      dataChannel.onclose = () => {
        this.clearSessionUpdateTimeout();
        this.sessionReady = false;
        this.emitDiagnostic({ type: "realtime.data_channel.close", status: "disconnected" });
        this.options.onStatusChange?.("disconnected");
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const sdpResponse = await withTimeout(
        fetchImpl("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/sdp"
          },
          body: offer.sdp ?? ""
        }),
        connectTimeoutMs,
        "REALTIME_CONNECT_TIMEOUT(sdp)",
        () => this.emitDiagnostic({ type: "realtime.sdp.timeout", status: "failed", errorCode: "REALTIME_CONNECT_TIMEOUT" })
      );
      const sdpText = await sdpResponse.text();
      if (!sdpResponse.ok) {
        this.emitDiagnostic({
          type: "realtime.sdp.failed",
          status: String(sdpResponse.status),
          errorCode: "REALTIME_SDP_FAILED",
          message: sdpText.slice(0, 240)
        });
        throw new Error("REALTIME_SDP_FAILED");
      }
      if (!this.isCurrentAttempt(attemptId)) {
        peerConnection.close();
        return;
      }
      await peerConnection.setRemoteDescription({ type: "answer", sdp: sdpText });
      await sessionReadyPromise;
    } catch (error) {
      if (this.isCurrentAttempt(attemptId)) {
        this.closeResources();
        this.options.onStatusChange?.(resolveRealtimeConnectFailureStatus(error));
        this.emitDiagnostic({
          type: "realtime.connect.failed",
          status: resolveRealtimeConnectFailureStatus(error),
          message: error instanceof Error ? error.message : "Realtime connect failed"
        });
        throw error;
      }
    }
  }

  disconnect(): void {
    this.nextConnectionAttempt();
    this.connectPromise = null;
    this.closeResources();
    this.handledFunctionCallIds.clear();
    this.sessionReady = false;
    this.activeResponseId = null;
    this.clearRealtimeTraceState();
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
    this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
    this.pendingResponseCreateAfterActiveToolResultTools = undefined;
    this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
    this.pendingSelectorToolResponses.clear();
    this.pendingScopedToolResponses.clear();
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingPlanSelectionResult = null;
    this.pendingTextCommandAfterActiveResponse = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.clearResponseCreateConflictRetry();
    this.pendingToolSelectionResetAfterActiveResponse = null;
    this.activeScopedToolSelection = null;
    this.activeRealtimePlanSelection = null;
    this.options.onStatusChange?.("disconnected");
  }

  private nextConnectionAttempt(): number {
    this.connectionAttemptId += 1;
    return this.connectionAttemptId;
  }

  private isCurrentAttempt(attemptId: number): boolean {
    return isCurrentRealtimeConnectAttempt(this.connectionAttemptId, attemptId);
  }

  private closeResources(): void {
    this.stopMicrophoneLevelMonitor();
    this.releaseRemoteAudioElement();
    closeRealtimeConnectionResources({
      dataChannel: this.dataChannel,
      peerConnection: this.peerConnection,
      mediaStream: this.mediaStream
    });
    this.dataChannel = null;
    this.peerConnection = null;
    this.mediaStream = null;
    this.clearSessionUpdateTimeout();
    this.clearSessionReadyPromise();
    this.discardQueuedSessionUpdates("close_resources");
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
    this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
    this.pendingResponseCreateAfterActiveToolResultTools = undefined;
    this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
    this.pendingSelectorToolResponses.clear();
    this.pendingScopedToolResponses.clear();
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingPlanSelectionResult = null;
    this.pendingTextCommandAfterActiveResponse = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.pendingToolSelectionResetAfterActiveResponse = null;
    this.activeScopedToolSelection = null;
    this.activeRealtimePlanSelection = null;
    this.clearRealtimeTraceState();
  }

  private releaseRemoteAudioElement(): void {
    this.stopRemoteAudioLevelMonitor();
    const audio = this.remoteAudioElement;
    if (!audio) return;
    const stream =
      typeof MediaStream !== "undefined" && audio.srcObject instanceof MediaStream ? audio.srcObject : null;
    audio.muted = true;
    audio.volume = 0;
    audio.pause();
    audio.srcObject = null;
    stream?.getTracks().forEach((track) => track.stop());
    audio.remove?.();
    this.remoteAudioElement = null;
  }

  private markRealtimeTraceInterrupted(commandTraceId: string | null | undefined): void {
    if (!commandTraceId) return;
    this.interruptedRealtimeCommandTraceIds.add(commandTraceId);
    while (this.interruptedRealtimeCommandTraceIds.size > MAX_INTERRUPTED_TRACE_IDS) {
      const oldestKey = this.interruptedRealtimeCommandTraceIds.keys().next().value;
      if (typeof oldestKey === "string") {
        this.interruptedRealtimeCommandTraceIds.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private markActiveRealtimeTracesInterrupted(nextCommandTraceId: string): void {
    const traceIds = new Set<string>();
    if (this.activeCommandTraceId) traceIds.add(this.activeCommandTraceId);
    if (this.activeRealtimeResponseTraceId) traceIds.add(this.activeRealtimeResponseTraceId);
    for (const traceId of this.realtimeResponseTraceIds.values()) {
      traceIds.add(traceId);
    }
    for (const traceId of this.functionCallTraceIds.values()) {
      traceIds.add(traceId);
    }
    traceIds.delete(nextCommandTraceId);
    for (const traceId of traceIds) {
      this.markRealtimeTraceInterrupted(traceId);
    }
  }

  private isLikelyRemoteAudioEchoSpeechStart(): boolean {
    return this.connectMode === "audio" && this.remoteAudioLevel >= REMOTE_AUDIO_ECHO_LEVEL && this.microphoneLevel <= MICROPHONE_ECHO_CEILING;
  }

  private rememberAssistantTranscript(transcript: string): void {
    const normalized = normalizeTranscriptForEchoMatch(transcript);
    if (!normalized) return;
    const now = Date.now();
    this.recentAssistantTranscripts = [
      { transcript: normalized, createdAt: now },
      ...this.recentAssistantTranscripts.filter((item) => now - item.createdAt <= RECENT_ASSISTANT_TRANSCRIPT_TTL_MS)
    ].slice(0, MAX_RECENT_ASSISTANT_TRANSCRIPTS);
  }

  private isRecentAssistantEchoTranscript(input: string): boolean {
    const normalized = normalizeTranscriptForEchoMatch(input);
    if (!normalized) return false;
    const now = Date.now();
    this.recentAssistantTranscripts = this.recentAssistantTranscripts.filter(
      (item) => now - item.createdAt <= RECENT_ASSISTANT_TRANSCRIPT_TTL_MS
    );
    return this.recentAssistantTranscripts.some((item) => {
      if (normalized === item.transcript) return true;
      return normalized.length >= 4 && (item.transcript.includes(normalized) || normalized.includes(item.transcript));
    });
  }

  private pruneRecentRealtimeToolCompletions(now = Date.now()): void {
    for (const [key, item] of this.recentRealtimeToolCompletions) {
      if (now - item.createdAt > RECENT_REALTIME_TOOL_COMPLETION_TTL_MS) {
        this.recentRealtimeToolCompletions.delete(key);
      }
    }
    while (this.recentRealtimeToolCompletions.size > MAX_RECENT_REALTIME_TOOL_COMPLETIONS) {
      const oldestKey = this.recentRealtimeToolCompletions.keys().next().value;
      if (typeof oldestKey === "string") {
        this.recentRealtimeToolCompletions.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private rememberRealtimeToolCompletion(call: AssistantToolCall, commandTraceId?: string): void {
    const completionKey = createRealtimeToolCompletionKey(call);
    const now = Date.now();
    this.pruneRecentRealtimeToolCompletions(now);
    if (completionKey) {
      this.recentRealtimeToolCompletions.set(completionKey, { createdAt: now, commandTraceId, toolName: call.name });
      if (commandTraceId) {
        const completedKeys = this.realtimeTraceCompletedToolKeys.get(commandTraceId) ?? new Set<string>();
        completedKeys.add(completionKey);
        this.realtimeTraceCompletedToolKeys.set(commandTraceId, completedKeys);
      }
    }
    const mediaModule = getRealtimeExclusiveMediaModule(call.name);
    if (commandTraceId && mediaModule) {
      this.realtimeTraceExclusiveMediaModules.set(commandTraceId, mediaModule);
      if (completionKey) {
        this.realtimeTraceExclusiveMediaKeys.set(commandTraceId, completionKey);
      }
    }
  }

  private resolveRecentRealtimeToolSkipReason(
    call: AssistantToolCall,
    commandTraceId: string | undefined,
    fallbackText: string
  ): { reason: "duplicate_recent" | "duplicate_completed" | "media_conflict" | "media_stale"; completionKey?: string; previousMediaModule?: string } | null {
    const completionKey = createRealtimeToolCompletionKey(call) ?? undefined;
    const now = Date.now();
    this.pruneRecentRealtimeToolCompletions(now);
    if (commandTraceId && completionKey && this.realtimeTraceCompletedToolKeys.get(commandTraceId)?.has(completionKey)) {
      return { reason: "duplicate_completed", completionKey };
    }
    if (completionKey && this.recentRealtimeToolCompletions.has(completionKey)) {
      return { reason: "duplicate_recent", completionKey };
    }
    const mediaModule = getRealtimeExclusiveMediaModule(call.name);
    const previousMediaModule = commandTraceId ? this.realtimeTraceExclusiveMediaModules.get(commandTraceId) : undefined;
    const previousMediaKey = commandTraceId ? this.realtimeTraceExclusiveMediaKeys.get(commandTraceId) : undefined;
    if (mediaModule && previousMediaModule && previousMediaModule !== mediaModule && !allowsCrossMediaRealtimeCommand(fallbackText)) {
      return { reason: "media_conflict", completionKey, previousMediaModule };
    }
    if (
      mediaModule &&
      previousMediaModule === mediaModule &&
      previousMediaKey &&
      completionKey &&
      previousMediaKey !== completionKey &&
      !allowsMultipleRealtimeMediaActions(fallbackText)
    ) {
      return { reason: "media_stale", completionKey, previousMediaModule };
    }
    return null;
  }

  private shouldSkipUnscopedVoiceToolCall(callName: string, commandTraceId: string | undefined, hadPendingScopedToolResponse: boolean): boolean {
    if (this.connectMode !== "audio" || !commandTraceId) return false;
    if (!shouldSkipInterruptedRealtimeFunctionCall(callName) || isLegacyRealtimeCommandPlanTool(callName)) return false;
    return !hadPendingScopedToolResponse;
  }

  private markRealtimeTraceEchoSuppressed(commandTraceId: string): void {
    this.suppressedEchoTraceIds.add(commandTraceId);
    while (this.suppressedEchoTraceIds.size > MAX_INTERRUPTED_TRACE_IDS) {
      const oldestKey = this.suppressedEchoTraceIds.keys().next().value;
      if (typeof oldestKey === "string") {
        this.suppressedEchoTraceIds.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private beginRealtimeVoiceTurn(itemId: string): string {
    const commandTraceId = createRealtimeVoiceCommandTraceId(itemId || "speech");
    if (itemId) {
      this.realtimeItemTraceIds.set(itemId, commandTraceId);
    }
    if (this.isLikelyRemoteAudioEchoSpeechStart()) {
      this.markRealtimeTraceEchoSuppressed(commandTraceId);
      this.emitDiagnostic({
        type: "realtime.voice.echo_suppressed",
        status: "started",
        commandTraceId,
        data: {
          itemId,
          microphoneLevel: this.microphoneLevel,
          remoteAudioLevel: this.remoteAudioLevel,
          activeResponseId: this.activeResponseId
        }
      });
      return commandTraceId;
    }
    if (this.pendingTextCommandAfterSelectorUpdate) {
      this.markRealtimeTraceEchoSuppressed(commandTraceId);
      this.emitDiagnostic({
        type: "realtime.voice.pending_text_command_speech_suppressed",
        status: "started",
        commandTraceId,
        data: {
          itemId,
          pendingCommandTraceId: this.pendingTextCommandAfterSelectorUpdate.commandTraceId
        }
      });
      return commandTraceId;
    }
    this.markActiveRealtimeTracesInterrupted(commandTraceId);
    this.activeRealtimeResponseTraceId = commandTraceId;
    if (this.activeUserCommandTraceId && this.activeUserCommandTraceId !== commandTraceId) {
      this.realtimeTraceCompletedToolKeys.delete(this.activeUserCommandTraceId);
      this.realtimeTraceExclusiveMediaModules.delete(this.activeUserCommandTraceId);
      this.realtimeTraceExclusiveMediaKeys.delete(this.activeUserCommandTraceId);
      this.realtimeTraceUserTranscripts.delete(this.activeUserCommandTraceId);
      this.realtimeTraceCommandToolCalls.delete(this.activeUserCommandTraceId);
    }
    this.activeUserCommandTraceId = commandTraceId;
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
    this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
    this.pendingResponseCreateAfterActiveToolResultTools = undefined;
    this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
    this.pendingSelectorToolResponses.clear();
    this.pendingScopedToolResponses.clear();
    this.pendingScopedToolSelectionResult = null;
    this.pendingPlanSelectionResult = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.clearResponseCreateConflictRetry();
    this.pendingToolSelectionResetAfterActiveResponse = null;
    this.activeScopedToolSelection = null;
    this.activeRealtimePlanSelection = null;

    const activeResponseId = this.activeResponseId;
    const shouldClearOutputAudio = this.connectMode === "audio" && (Boolean(activeResponseId) || this.remoteAudioLevel > REMOTE_AUDIO_CLEAR_LEVEL);
    if (activeResponseId) {
      this.emitDiagnostic({
        type: "realtime.response.cancel_on_speech_started",
        status: "sent",
        operationId: activeResponseId,
        commandTraceId
      });
      this.sendEvent({ type: "response.cancel" }, { queueWhenClosed: false, commandTraceId });
    }
    if (shouldClearOutputAudio) {
      this.emitDiagnostic({
        type: "realtime.output_audio.clear_on_speech_started",
        status: "sent",
        commandTraceId
      });
      this.sendEvent({ type: "output_audio_buffer.clear" }, { queueWhenClosed: false, commandTraceId });
    }
    if (activeResponseId) {
      this.emitDiagnostic({
        type: "realtime.voice.selector_reset",
        status: "sent_after_interrupt",
        commandTraceId,
        data: { toolCount: this.getEffectiveSessionTools().length, activeResponseId }
      });
    }
    this.activeResponseId = null;
    this.sendToolSelectionReset(commandTraceId);
    return commandTraceId;
  }

  private sendToolSelectionReset(commandTraceId?: string): void {
    this.emitDiagnostic({
      type: "realtime.voice.selector_reset",
      status: "sent",
      commandTraceId,
      data: { toolCount: this.getEffectiveSessionTools().length }
    });
    this.sendEvent(this.createToolSelectionSessionUpdate(), { queueWhenClosed: false, commandTraceId });
  }

  private attachRemoteAudioStream(remoteStream: MediaStream | undefined): void {
    if (!remoteStream || typeof Audio === "undefined") return;
    this.releaseRemoteAudioElement();
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = false;
    audio.volume = 1;
    audio.setAttribute("playsinline", "true");
    if (audio.style) audio.style.display = "none";
    audio.srcObject = remoteStream;
    if (typeof Node !== "undefined" && audio instanceof Node) {
      document.body?.appendChild(audio);
    }
    this.remoteAudioElement = audio;
    this.startRemoteAudioLevelMonitor(remoteStream);
    void audio.play?.().catch((error) => {
      this.emitDiagnostic({
        type: "realtime.remote_audio.play",
        status: "failed",
        message: error instanceof Error ? error.message : "remote audio play failed"
      });
    });
  }

  private startMicrophoneLevelMonitor(stream: MediaStream): void {
    this.microphoneLevelMonitor = this.startAudioLevelMonitor(stream, "microphone", this.microphoneLevelMonitor);
  }

  private startRemoteAudioLevelMonitor(stream: MediaStream): void {
    this.remoteAudioLevelMonitor = this.startAudioLevelMonitor(stream, "remote", this.remoteAudioLevelMonitor);
  }

  private startAudioLevelMonitor(
    stream: MediaStream,
    kind: "microphone" | "remote",
    previousMonitor: MicrophoneLevelMonitor | null
  ): MicrophoneLevelMonitor | null {
    this.stopAudioLevelMonitor(previousMonitor);
    this.setRealtimeAudioLevel(kind, 0);
    if (!this.options.onMicrophoneLevel) return null;
    const AudioContextCtor =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.68;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      void audioContext.resume?.();

      const samples = new Uint8Array(analyser.fftSize);
      let smoothedLevel = 0;
      let lastEmittedLevel = -1;
      const monitor: MicrophoneLevelMonitor = { audioContext, analyser, source, animationFrameId: null, kind };
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        const rawLevel = resolveRealtimeMicrophoneLevel(samples);
        smoothedLevel = smoothedLevel * 0.62 + rawLevel * 0.38;
        if (Math.abs(smoothedLevel - lastEmittedLevel) >= MICROPHONE_LEVEL_EMIT_DELTA || smoothedLevel === 0) {
          lastEmittedLevel = smoothedLevel;
          this.setRealtimeAudioLevel(kind, smoothedLevel);
        }
        monitor.animationFrameId = requestAnimationFrame(tick);
      };

      tick();
      return monitor;
    } catch (error) {
      this.emitDiagnostic({
        type: kind === "microphone" ? "realtime.microphone.level_monitor" : "realtime.remote_audio.level_monitor",
        status: "failed",
        message: error instanceof Error ? error.message : `${kind} level monitor failed`
      });
      this.setRealtimeAudioLevel(kind, 0);
      return null;
    }
  }

  private stopMicrophoneLevelMonitor(): void {
    this.stopAudioLevelMonitor(this.microphoneLevelMonitor);
    this.microphoneLevelMonitor = null;
    this.setRealtimeAudioLevel("microphone", 0);
  }

  private stopRemoteAudioLevelMonitor(): void {
    this.stopAudioLevelMonitor(this.remoteAudioLevelMonitor);
    this.remoteAudioLevelMonitor = null;
    this.setRealtimeAudioLevel("remote", 0);
  }

  private stopAudioLevelMonitor(monitor: MicrophoneLevelMonitor | null): void {
    if (!monitor) return;
    if (monitor.animationFrameId !== null) {
      cancelAnimationFrame(monitor.animationFrameId);
    }
    void monitor.audioContext.close().catch(() => undefined);
  }

  private setRealtimeAudioLevel(kind: "microphone" | "remote", level: number): void {
    const nextLevel = Math.max(0, Math.min(1, level));
    if (kind === "microphone") {
      this.microphoneLevel = nextLevel;
    } else {
      this.remoteAudioLevel = nextLevel;
    }
    this.options.onMicrophoneLevel?.(Math.max(this.microphoneLevel, this.remoteAudioLevel));
  }

  updateTools(tools: AssistantToolSpec[]): void {
    this.currentTools = tools;
    const toolSelectionUpdate = this.createToolSelectionSessionUpdate(tools);
    const capabilityCatalog = this.createCapabilityCatalog(tools);
    const toolCatalogVersion = capabilityCatalog[0]?.catalogVersion;
    this.emitDiagnostic({
      type: "realtime.tools.update",
      status: "queued_or_sent",
      data: { toolCount: tools.length, tools: tools.map((tool) => tool.name), toolCatalogVersion }
    });
    this.sendEvent(toolSelectionUpdate);
  }

  private sendInitialToolSelectionUpdateIfReady(reason: string): void {
    if (this.initialToolSelectionUpdateSent || !this.sessionReady || this.dataChannel?.readyState !== "open") return;
    this.initialToolSelectionUpdateSent = true;
    this.emitDiagnostic({
      type: "realtime.initial_selector_update",
      status: "started",
      data: { reason, toolCount: this.getEffectiveSessionTools().length }
    });
    this.sendEvent(this.createToolSelectionSessionUpdate(this.getEffectiveSessionTools()), { queueWhenClosed: false });
    this.armInitialToolSelectionUpdateTimeout();
  }

  private createCommandExecutionSessionUpdate(): RealtimeEvent {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
        audio: createRealtimeSessionAudioConfig(),
        tools: [createRealtimeCommandExecutionTool()],
        tool_choice: "auto",
        parallel_tool_calls: false
      }
    };
  }

  private createToolSelectionSessionUpdate(tools: AssistantToolSpec[] = this.getEffectiveSessionTools()): RealtimeEvent {
    const capabilityCatalog = this.createCapabilityCatalog(tools);
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: createRealtimeToolSelectionInstructions(tools, capabilityCatalog),
        audio: createRealtimeSessionAudioConfig(),
        tools: [createRealtimeToolSelectionTool(tools, capabilityCatalog)],
        tool_choice: createRealtimeToolSelectionToolChoice(),
        parallel_tool_calls: false
      }
    };
  }

  private createPlanSelectionSessionUpdate(tools: AssistantToolSpec[] = this.getEffectiveSessionTools()): RealtimeEvent {
    const capabilityCatalog = this.createCapabilityCatalog(tools);
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: createRealtimePlanSelectionInstructions(tools, capabilityCatalog),
        audio: createRealtimeSessionAudioConfig(),
        tools: [createRealtimePlanSelectionTool(tools, capabilityCatalog)],
        tool_choice: "auto",
        parallel_tool_calls: false
      }
    };
  }

  private getEffectiveSessionTools(): AssistantToolSpec[] {
    return this.currentTools.length > 0 ? this.currentTools : createInitialRealtimeToolSpecs();
  }

  private getInitialSessionTools(): AssistantToolSpec[] {
    const initialTools = [
      ...this.getEffectiveSessionTools(),
      ...(this.moduleRegistry?.listTools() ?? [])
    ].filter((tool) => tool.scope === "desktop" || tool.scope === "widget-selection");
    const seen = new Set<string>();
    return initialTools.filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    });
  }

  updateModules(registry: WidgetAssistantRegistry): void {
    this.moduleRegistry = registry;
  }

  updateContext(context: CompactAssistantContext): void {
    this.currentContext = context;
    this.emitDiagnostic({
      type: "realtime.context.update",
      status: "stored",
      data: {
        contextVersion: context.contextVersion,
        toolCatalogVersion: context.toolCatalogVersion,
        widgetCount: context.widgets.length,
        widgetTypes: context.widgets.map((widget) => widget.type),
        widgetCountsByType: context.widgetCountsByType,
        boardId: context.boardId
      }
    });
  }

  private createCapabilityCatalog(tools: AssistantToolSpec[]) {
    return createRealtimeCapabilityCatalog(tools, this.moduleRegistry?.getRealtimeCatalog());
  }

  private createToolExposurePlan(input: string, context: CompactAssistantContext, tools: AssistantToolSpec[]) {
    const plan = buildRealtimeToolExposurePlan(input, context, tools, this.moduleRegistry ?? undefined);
    this.emitDiagnostic({
      type: "realtime.tool_exposure.plan",
      status: plan.exposedTools.length ? "success" : "empty",
      data: {
        input,
        semanticModules: plan.semanticModules,
        focusedModule: plan.focusedModule,
        candidateModules: plan.candidateModules,
        selectedModules: plan.selectedModules,
        exposedTools: plan.exposedTools.map((tool) => tool.name),
        confidence: plan.confidence,
        reasons: plan.reasons,
        excludedReasons: plan.excludedReasons
      }
    });
    return plan;
  }

  private resolveToolSelectionInput(
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>,
    commandTraceId?: string
  ): string {
    const tracedInput = commandTraceId ? this.realtimeTraceUserTranscripts.get(commandTraceId)?.input ?? "" : "";
    return normalizeRealtimeIntentText(
      tracedInput ||
        selection.userCommand ||
        selection.targetHint ||
        selection.selectedModule ||
        selection.intent ||
        selection.name ||
        selection.candidateTools?.[0] ||
        ""
    );
  }

  private resolveExplicitWindowActionTool(input: string, tools: AssistantToolSpec[]): AssistantToolSpec | undefined {
    const text = normalizeRealtimeIntentText(input).replace(/\s+/g, "");
    const preferredNames =
      /(关闭|关掉|收起|移除|删掉|删除)/.test(text)
        ? ["widget.remove"]
        : /(移动|移到|挪|右上|左上|右下|左下|放到|调到|拖到)/.test(text)
          ? ["widget.move"]
          : /(调大|调小|放大|缩小|调宽|宽一点|缩窄|大小|尺寸)/.test(text)
            ? ["widget.resize"]
            : /(最前|置顶|放前面|不要挡住|不要遮住)/.test(text)
              ? ["widget.bring_to_front"]
              : /(全屏|沉浸)/.test(text)
                ? (/电视/.test(text) ? ["tv.fullscreen", "widget.fullscreen_focus", "app.fullscreen.set"] : ["widget.fullscreen_focus", "app.fullscreen.set"])
                : /(聚焦|设为当前|设成当前|作为当前|切到|切回)/.test(text)
                  ? ["widget.focus"]
                  : [];
    return preferredNames.map((name) => tools.find((tool) => tool.name === name)).find(Boolean);
  }

  private findToolSpec(toolName: string): AssistantToolSpec | undefined {
    return (
      this.moduleRegistry?.findModuleForTool(toolName)?.tools.find((action) => action.spec.name === toolName)?.spec ??
      this.currentTools.find((tool) => tool.name === toolName)
    );
  }

  private isToolForSelectionModule(tool: AssistantToolSpec, selectedModule: string): boolean {
    if (tool.widgetType === selectedModule) return true;
    if (selectedModule === "window" || selectedModule === "widget") return tool.name.startsWith("widget.") || tool.name === REALTIME_ADD_WIDGET_TOOL_NAME;
    if (selectedModule === "board") return tool.name.startsWith("board.") || tool.name.startsWith("widget.");
    if (selectedModule === "app") return tool.name.startsWith("app.");
    return this.moduleRegistry?.findModuleForTool(tool.name)?.type === selectedModule;
  }

  private resolveSelectedModuleFromSelection(
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>,
    input: string,
    selectedTool?: AssistantToolSpec
  ): string | undefined {
    if (selection.selectedModule) return selection.selectedModule;
    if (selectedTool?.widgetType) return selectedTool.widgetType;
    const inferredWidgetType = findRealtimeWidgetType(input, selection.targetHint);
    if (inferredWidgetType) return inferredWidgetType;
    if (selection.name) {
      const tool = this.findToolSpec(selection.name);
      if (tool?.widgetType) return tool.widgetType;
      return this.moduleRegistry?.findModuleForTool(selection.name)?.type ?? selection.name.split(".")[0];
    }
    const firstCandidate = selection.candidateTools?.find(Boolean);
    if (firstCandidate) {
      const tool = this.findToolSpec(firstCandidate);
      if (tool?.widgetType) return tool.widgetType;
      return this.moduleRegistry?.findModuleForTool(firstCandidate)?.type ?? firstCandidate.split(".")[0];
    }
    return undefined;
  }

  private resolveCandidateToolSpecs(selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>, tools: AssistantToolSpec[]) {
    const requestedNames = [
      ...(Array.isArray(selection.candidateTools) ? selection.candidateTools : []),
      selection.name
    ].filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
    return this.uniqueTools(
      [...new Set(requestedNames)]
        .map((name) => tools.find((tool) => tool.name === name) ?? this.findToolSpec(name))
        .filter((tool): tool is AssistantToolSpec => Boolean(tool))
    );
  }

  private uniqueTools(tools: AssistantToolSpec[]): AssistantToolSpec[] {
    const seen = new Set<string>();
    return tools.filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    });
  }

  private sortToolsForSelectionIntent(
    tools: AssistantToolSpec[],
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>,
    selectedModule: string | undefined
  ): AssistantToolSpec[] {
    const priorities = selection.intent ? INTENT_TOOL_PRIORITIES[selection.intent] ?? [] : [];
    const priorityIndex = new Map(priorities.map((name, index) => [name, index]));
    return [...tools].sort((left, right) => {
      const leftPriority = priorityIndex.get(left.name) ?? 1000;
      const rightPriority = priorityIndex.get(right.name) ?? 1000;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftModuleMatch = selectedModule && this.isToolForSelectionModule(left, selectedModule) ? 0 : 1;
      const rightModuleMatch = selectedModule && this.isToolForSelectionModule(right, selectedModule) ? 0 : 1;
      if (leftModuleMatch !== rightModuleMatch) return leftModuleMatch - rightModuleMatch;
      return left.name.localeCompare(right.name);
    });
  }

  private resolveScopedToolsForSelection(
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[],
    commandTraceId?: string
  ):
    | {
        ok: true;
        input: string;
        selectedTool: AssistantToolSpec;
        selectedModule?: string;
        scopedTools: AssistantToolSpec[];
        candidateMode: boolean;
        selection: RealtimeTextToolSelection & { name: string; requestedToolName?: string; candidateTools?: string[] };
      }
    | {
        ok: false;
        input: string;
        exposedTools: string[];
        excludedReasons: Record<string, string>;
      } {
    const input = this.resolveToolSelectionInput(selection, commandTraceId);
    if (!input) {
      return { ok: false, input, exposedTools: [], excludedReasons: {} };
    }
    if (
      isReminderTodoCommand(input) &&
      (selection.name === "countdown.set" || selection.selectedModule === "countdown" || selection.candidateTools?.includes("countdown.set")) &&
      tools.some((tool) => tool.name === "todo.add_item")
    ) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.semantic_boundary_rewrite",
        status: "success",
        commandTraceId,
        toolName: "todo.add_item",
        data: {
          fromTool: selection.name,
          fromModule: selection.selectedModule,
          reason: "reminder_todo_not_countdown"
        }
      });
      selection = {
        ...selection,
        name: "todo.add_item",
        candidateTools: ["todo.add_item"],
        selectedModule: "todo",
        intent: selection.intent ?? "add",
        targetHint: selection.targetHint || input
      };
    }
    if (
      isExplicitNoteWriteCommand(input) &&
      selection.name !== "note.write" &&
      tools.some((tool) => tool.name === "note.write")
    ) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.semantic_boundary_rewrite",
        status: "success",
        commandTraceId,
        toolName: "note.write",
        data: {
          fromTool: selection.name,
          fromModule: selection.selectedModule,
          reason: "explicit_note_write_prefix"
        }
      });
      selection = {
        ...selection,
        name: "note.write",
        candidateTools: ["note.write"],
        selectedModule: "note",
        intent: selection.intent ?? "note_write",
        targetHint: selection.targetHint || input,
        userCommand: selection.userCommand || input
      };
    }
    if (
      isClipboardClearCommand(input) &&
      selection.name !== "clipboard.clear" &&
      tools.some((tool) => tool.name === "clipboard.clear")
    ) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.semantic_boundary_rewrite",
        status: "success",
        commandTraceId,
        toolName: "clipboard.clear",
        data: {
          fromTool: selection.name,
          fromModule: selection.selectedModule,
          reason: "explicit_clipboard_clear"
        }
      });
      selection = {
        ...selection,
        name: "clipboard.clear",
        candidateTools: ["clipboard.clear"],
        selectedModule: "clipboard",
        intent: selection.intent ?? "clear",
        targetHint: selection.targetHint || input,
        userCommand: selection.userCommand || input
      };
    }
    const candidateToolSpecs = this.resolveCandidateToolSpecs(selection, tools);
    const candidateMode = Boolean(selection.candidateTools?.length);
    const legacySelectedTool = selection.name
      ? tools.find((tool) => tool.name === selection.name) ?? this.findToolSpec(selection.name)
      : candidateToolSpecs[0];
    const pureOpenWidget = isPureOpenWidgetText(input);
    const explicitWindowAction = this.resolveExplicitWindowActionTool(input, tools);
    const inferredCommandWidgetType = pureOpenWidget || explicitWindowAction
      ? findRealtimeWidgetType(input, selection.targetHint)
      : undefined;
    const selectedModule = inferredCommandWidgetType ?? this.resolveSelectedModuleFromSelection(selection, input, legacySelectedTool);
    const exposurePlan = this.createToolExposurePlan(input, context, tools);
    const exposedTools = exposurePlan.exposedTools.map((tool) => tool.name);
    const addWidgetTool = tools.find((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME);
    const focusWidgetTool = tools.find((tool) => tool.name === "widget.focus");
    const moduleTools = selectedModule
      ? tools.filter((tool) => this.isToolForSelectionModule(tool, selectedModule))
      : [];
    const exposedToolNames = new Set(exposedTools);
    const intentPriorityNames = new Set([
      ...(selection.intent ? INTENT_TOOL_PRIORITIES[selection.intent] ?? [] : []),
      ...(selection.candidateTools ?? []),
      ...(selection.name ? [selection.name] : [])
    ]);
    const intentTools = tools.filter((tool) => intentPriorityNames.has(tool.name));
    const hasContentCandidateForSelectedModule = Boolean(
      selectedModule &&
        this.uniqueTools([...candidateToolSpecs, ...intentTools]).some(
          (tool) => tool.scope === "widget-detail" && this.isToolForSelectionModule(tool, selectedModule)
        )
    );
    const hasMountedSelectedModule = selectedModule ? hasMountedWidgetType(context, selectedModule) : false;
    const canOpenMissingSelectedModule = Boolean(
      selectedModule &&
        !hasMountedSelectedModule &&
        legacySelectedTool &&
        legacySelectedTool.scope === "widget-detail" &&
        this.isToolForSelectionModule(legacySelectedTool, selectedModule) &&
        context.availableDefinitions?.some((definition) => definition.type === selectedModule)
    );
    const exposedCandidateToolSpecs = candidateToolSpecs.filter(
      (tool) => {
        if (
          selectedModule &&
          tool.scope === "widget-detail" &&
          !this.isToolForSelectionModule(tool, selectedModule)
        ) {
          return false;
        }
        // In candidate mode, Realtime has already made the semantic choice.
        // Local text exposure is context/diagnostics, not an intent veto. A
        // registered candidate is accepted after module and policy checks so
        // unseen paraphrases do not require another local phrase rule.
        return true;
      }
    );
    const baseTools = candidateMode
      ? exposedCandidateToolSpecs.filter(
          (tool) =>
            tool.name !== REALTIME_ADD_WIDGET_TOOL_NAME ||
            (!hasMountedSelectedModule && (pureOpenWidget || !hasContentCandidateForSelectedModule))
        )
      : exposurePlan.exposedTools.length
        ? this.uniqueTools([
            ...exposurePlan.exposedTools.filter((tool) => !selectedModule || this.isToolForSelectionModule(tool, selectedModule)),
            ...exposurePlan.exposedTools.filter((tool) => intentPriorityNames.has(tool.name)),
            ...moduleTools.filter((tool) => exposedToolNames.has(tool.name))
          ])
        : this.uniqueTools([...moduleTools, ...intentTools]);

    const shouldIncludeAddWidget =
      Boolean(
        selectedModule &&
          !GENERIC_SELECTION_MODULES.has(selectedModule) &&
          addWidgetTool &&
          !hasMountedSelectedModule &&
          context.availableDefinitions?.some((definition) => definition.type === selectedModule) &&
          (pureOpenWidget ||
            canOpenMissingSelectedModule ||
            (!hasContentCandidateForSelectedModule &&
              (MODULE_OPEN_INTENTS.has(selection.intent ?? "") || !hasMountedSelectedModule)))
      );
    const explicitExposureActionTool = this.resolveExplicitWindowActionTool(input, exposurePlan.exposedTools);
    const scopedCandidates = this.uniqueTools([
      ...baseTools,
      ...(explicitExposureActionTool ? [explicitExposureActionTool] : []),
      ...(shouldIncludeAddWidget && addWidgetTool ? [addWidgetTool] : []),
      ...(pureOpenWidget && selectedModule && hasMountedSelectedModule && focusWidgetTool ? [focusWidgetTool] : [])
    ]);
    const sortedCandidates = (candidateMode && !selection.intent
      ? scopedCandidates
      : this.sortToolsForSelectionIntent(scopedCandidates, selection, selectedModule)
    ).slice(0, MAX_SCOPED_SELECTION_TOOLS);

    const canUseLocalAddWidgetFollowUp = Boolean(
      selectedModule &&
        addWidgetTool &&
        shouldIncludeAddWidget &&
        !hasMountedSelectedModule &&
        (isPureOpenWidgetText(input) ||
          canOpenMissingSelectedModule)
    );
    const pureOpenFocusWidget =
      pureOpenWidget && selectedModule && hasMountedSelectedModule && focusWidgetTool
        ? focusWidgetTool
        : undefined;
    const pureOpenAddWidget =
      selectedModule &&
      addWidgetTool &&
      !hasMountedSelectedModule &&
      sortedCandidates.some((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME) &&
      (selection.intent === "open" || isPureOpenWidgetText(input)) &&
      isPureOpenWidgetText(input)
        ? addWidgetTool
        : undefined;
    const legacyCandidate = !candidateMode && selection.name ? sortedCandidates.find((tool) => tool.name === selection.name) : undefined;
    const explicitWindowActionTool = this.resolveExplicitWindowActionTool(input, sortedCandidates);
    const selectedTool =
      explicitWindowActionTool ??
      pureOpenFocusWidget ??
      pureOpenAddWidget ??
      legacyCandidate ??
      sortedCandidates.find((tool) => tool.name !== REALTIME_ADD_WIDGET_TOOL_NAME) ??
      sortedCandidates[0];
    if (!selectedTool) {
      return {
        ok: false,
        input,
        exposedTools,
        excludedReasons: exposurePlan.excludedReasons
      };
    }

    const scopedTools = (
      pureOpenFocusWidget
        ? [pureOpenFocusWidget]
        : this.uniqueTools([
            selectedTool,
            ...sortedCandidates,
            ...(shouldIncludeAddWidget && addWidgetTool ? [addWidgetTool] : [])
          ])
    ).slice(0, MAX_SCOPED_SELECTION_TOOLS);

    return {
      ok: true,
      input,
      selectedTool,
      selectedModule,
      scopedTools,
      candidateMode,
      selection: {
        ...selection,
        name: selectedTool.name,
        candidateTools: candidateMode ? scopedTools.map((tool) => tool.name).slice(0, MAX_SCOPED_SELECTION_TOOLS) : selection.candidateTools,
        requestedToolName: selection.name !== selectedTool.name ? selection.name : undefined,
        selectedModule,
        userCommand: selection.userCommand || input
      }
    };
  }

  private validateSelectedToolExposure(
    selectedTool: AssistantToolSpec,
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>,
    commandTraceId?: string
  ): { ok: true; input: string; selectedModule?: string } | { ok: false; input: string; exposedTools: string[]; excludedReasons: Record<string, string> } {
    if (!this.currentContext) {
      return { ok: false, input: selection.userCommand || selection.targetHint || selection.name || "", exposedTools: [], excludedReasons: {} };
    }
    const resolved = this.resolveScopedToolsForSelection(selection, this.currentContext, this.currentTools, commandTraceId);
    if (resolved.ok && resolved.selectedTool.name === selectedTool.name) {
      return { ok: true, input: resolved.input, selectedModule: resolved.selectedModule };
    }
    if (resolved.ok) {
      return { ok: false, input: resolved.input, exposedTools: [resolved.selectedTool.name], excludedReasons: {} };
    }
    return {
      ok: false,
      input: resolved.input,
      exposedTools: resolved.exposedTools,
      excludedReasons: resolved.excludedReasons
    };
  }

  private attachContextVersions(context: CompactAssistantContext, tools: AssistantToolSpec[]): CompactAssistantContext {
    const toolCatalogVersion = this.createCapabilityCatalog(tools)[0]?.catalogVersion;
    return {
      ...context,
      toolCatalogVersion: context.toolCatalogVersion ?? toolCatalogVersion
    };
  }

  sendToolResult(call: AssistantToolCall, result: AssistantToolResult): void {
    const hadActiveResponse = Boolean(this.activeResponseId);
    const commandTraceId =
      this.functionCallTraceIds.get(call.id) ??
      this.activeCommandTraceId ??
      this.activeRealtimeResponseTraceId ??
      this.activeUserCommandTraceId ??
      undefined;
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId) && shouldSkipInterruptedRealtimeFunctionCall(call.name)) {
      this.emitDiagnostic({
        type: "realtime.tool_result.skip",
        status: "interrupted",
        operationId: call.id,
        toolName: call.name,
        message: result.message,
        errorCode: result.errorCode,
        commandTraceId,
        data: { source: call.source }
      });
      return;
    }
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId)) {
      this.emitDiagnostic({
        type: "realtime.tool_result.resume_interrupted_control_call",
        status: result.status,
        operationId: call.id,
        toolName: call.name,
        message: result.message,
        errorCode: result.errorCode,
        commandTraceId,
        data: { source: call.source }
      });
    }
    if (!shouldSendRealtimeToolResult(call)) {
      this.emitDiagnostic({
        type: "realtime.tool_result.skip",
        status: "skipped",
        operationId: call.id,
        toolName: call.name,
        message: result.message,
        errorCode: result.errorCode,
        commandTraceId,
        data: { source: call.source }
      });
      return;
    }
    if (commandTraceId && result.status === "success") {
      this.rememberRealtimeToolCompletion(call, commandTraceId);
    }
    this.emitDiagnostic({
      type: "realtime.tool_result.send",
      status: result.status,
      operationId: call.id,
      toolName: call.name,
      message: result.message,
      errorCode: result.errorCode,
      commandTraceId
    });
    const userFacingResult = createUserFacingRealtimeToolResult(call, result);
    const continueResponse =
      call.name === REALTIME_PLAN_SELECTION_TOOL_NAME ||
      call.name === REALTIME_TOOL_SELECTION_TOOL_NAME ||
      (call.source === "realtime" && !isLegacyRealtimeCommandPlanTool(call.name));
    const isSelectionResult =
      call.name === REALTIME_PLAN_SELECTION_TOOL_NAME || call.name === REALTIME_TOOL_SELECTION_TOOL_NAME;
    const nextResponseInstructions =
      call.name === REALTIME_TOOL_SELECTION_TOOL_NAME
        ? this.scopedToolSelectionResponseInstructions.get(call.id) ?? createScopedToolCallResponseInstructions(userFacingResult)
        : result.status === "needs_confirmation"
          ? REALTIME_CONFIRMATION_RESPONSE_INSTRUCTIONS
        : undefined;
    const nextResponseTools =
      call.name === REALTIME_TOOL_SELECTION_TOOL_NAME
        ? (() => {
            const scopedTools = createScopedToolCallResponseTools(userFacingResult, this.currentTools, this.currentContext);
            return scopedTools.length ? scopedTools : undefined;
          })()
        : call.source === "realtime" && !isLegacyRealtimeCommandPlanTool(call.name)
          ? []
          : undefined;
    const nextResponseToolChoice =
      isSelectionResult
        ? createScopedToolCallResponseToolChoice(userFacingResult, nextResponseTools ?? []) ?? "required"
        : call.source === "realtime" && !isLegacyRealtimeCommandPlanTool(call.name)
          ? "none"
          : undefined;
    const responseMode = this.connectMode === "audio" ? "voice" : "text";
    const shouldResetSelectorAfterToolResult =
      call.source === "realtime" &&
      result.status === "success" &&
      !isSelectionResult &&
      !isLegacyRealtimeCommandPlanTool(call.name);
    createRealtimeToolResultEvents(call, userFacingResult, {
      activeResponseId: this.activeResponseId,
      responseMode,
      continueResponse,
      toolChoice: nextResponseToolChoice,
      tools: nextResponseTools,
      instructions: nextResponseInstructions
    }).forEach((event) => this.sendEvent(event, { queueWhenClosed: false, commandTraceId }));
    if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME) {
      this.scopedToolSelectionResponseInstructions.delete(call.id);
    }
    if (shouldResetSelectorAfterToolResult && commandTraceId) {
      this.pendingToolSelectionResetAfterActiveResponse = { commandTraceId };
    }
    if (hadActiveResponse && continueResponse) {
      this.pendingResponseCreateAfterActiveToolResult = true;
      this.pendingResponseCreateAfterActiveToolResultChoice = nextResponseToolChoice;
      this.pendingResponseCreateAfterActiveToolResultInstructions = nextResponseInstructions;
      this.pendingResponseCreateAfterActiveToolResultTools = nextResponseTools;
      this.pendingResponseCreateAfterActiveToolResultCommandTraceId = commandTraceId;
    } else if (isSelectionResult && commandTraceId && nextResponseInstructions && nextResponseTools?.length) {
      this.registerPendingScopedToolResponse(commandTraceId, {
        responseMode,
        instructions: nextResponseInstructions,
        tools: nextResponseTools,
        toolChoice: nextResponseToolChoice
      });
    }
  }

  private registerPendingScopedToolResponse(
    commandTraceId: string,
    pending: Pick<PendingScopedToolResponseRetry, "responseMode" | "instructions" | "tools" | "toolChoice">
  ): void {
    if (!pending.tools.length) return;
    this.pendingScopedToolResponses.set(commandTraceId, {
      ...pending,
      retryCount: 0
    });
    this.emitDiagnostic({
      type: "realtime.scoped_tool_response.await_function_call",
      status: "started",
      commandTraceId,
      data: {
        toolCount: pending.tools.length,
        toolChoice:
          typeof pending.toolChoice === "string"
            ? pending.toolChoice
            : isRecord(pending.toolChoice)
              ? pending.toolChoice.name
              : undefined
      }
    });
  }

  private clearPendingScopedToolResponse(commandTraceId?: string): void {
    if (!commandTraceId) return;
    this.pendingScopedToolResponses.delete(commandTraceId);
  }

  private retryPendingScopedToolResponseIfNeeded(commandTraceId?: string): boolean {
    if (!commandTraceId || this.activeResponseId) return false;
    const pending = this.pendingScopedToolResponses.get(commandTraceId);
    if (!pending) return false;
    if (pending.retryCount >= REALTIME_SCOPED_TOOL_RESPONSE_MAX_RETRIES) {
      this.pendingScopedToolResponses.delete(commandTraceId);
      this.emitDiagnostic({
        type: "realtime.scoped_tool_response.retry",
        status: "failed",
        commandTraceId,
        errorCode: "REALTIME_SCOPED_TOOL_RESPONSE_NO_FUNCTION_CALL",
        data: { retryCount: pending.retryCount }
      });
      return false;
    }
    const retry: PendingScopedToolResponseRetry = {
      ...pending,
      retryCount: pending.retryCount + 1
    };
    this.pendingScopedToolResponses.set(commandTraceId, retry);
    this.emitDiagnostic({
      type: "realtime.scoped_tool_response.retry",
      status: "sent",
      commandTraceId,
      data: { retryCount: retry.retryCount, toolCount: retry.tools.length }
    });
    this.sendEvent(
      createRealtimeResponseCreateEvent(retry.responseMode, {
        toolChoice: retry.toolChoice ?? "required",
        instructions: [
          "必须立即调用当前候选工具中的一个 function_call。不要回复文字，不要空响应，不要再次调用 assistant.select_tool。",
          retry.instructions
        ].join("\n"),
        tools: retry.tools
      }),
      { queueWhenClosed: false, commandTraceId }
    );
    return true;
  }

  private registerPendingSelectorToolResponse(
    commandTraceId: string,
    pending: Pick<PendingSelectorToolResponseRetry, "instructions" | "tools" | "toolChoice">
  ): void {
    if (!pending.tools.length) return;
    this.pendingSelectorToolResponses.set(commandTraceId, {
      ...pending,
      retryCount: 0
    });
    this.emitDiagnostic({
      type: "realtime.selector_tool_response.await_function_call",
      status: "started",
      commandTraceId,
      data: { toolCount: pending.tools.length }
    });
  }

  private clearPendingSelectorToolResponse(commandTraceId?: string): void {
    if (!commandTraceId) return;
    this.pendingSelectorToolResponses.delete(commandTraceId);
  }

  private retryPendingSelectorToolResponseIfNeeded(commandTraceId?: string): boolean {
    if (!commandTraceId || this.activeResponseId || this.realtimeTraceCommandToolCalls.has(commandTraceId)) return false;
    const pending = this.pendingSelectorToolResponses.get(commandTraceId);
    if (!pending) return false;
    if (pending.retryCount >= 1) {
      this.pendingSelectorToolResponses.delete(commandTraceId);
      this.emitDiagnostic({
        type: "realtime.selector_tool_response.retry",
        status: "failed",
        commandTraceId,
        errorCode: "REALTIME_SELECTOR_TOOL_RESPONSE_NO_FUNCTION_CALL",
        data: { retryCount: pending.retryCount }
      });
      return false;
    }
    const retry: PendingSelectorToolResponseRetry = {
      ...pending,
      retryCount: pending.retryCount + 1
    };
    this.pendingSelectorToolResponses.set(commandTraceId, retry);
    this.emitDiagnostic({
      type: "realtime.selector_tool_response.retry",
      status: "sent",
      commandTraceId,
      data: { retryCount: retry.retryCount, toolCount: retry.tools.length }
    });
    this.sendEvent(
      createRealtimeResponseCreateEvent("text", {
        toolChoice: retry.toolChoice,
        instructions: retry.instructions,
        tools: retry.tools
      }),
      { queueWhenClosed: false, commandTraceId }
    );
    return true;
  }

  private sendTextCommandSelectorUpdate(pendingTextCommand: PendingTextCommandAfterSelectorUpdate): void {
    this.emitDiagnostic({
      type: "realtime.text_command.reset_selector_tool",
      status: "sent",
      commandTraceId: pendingTextCommand.commandTraceId,
      data: { toolCount: this.getEffectiveSessionTools().length, selectionMode: "tool" }
    });
    this.sendEvent(this.createToolSelectionSessionUpdate(), {
      queueWhenClosed: false,
      commandTraceId: pendingTextCommand.commandTraceId
    });
    this.pendingTextCommandAfterSelectorUpdate = pendingTextCommand;
    this.emitDiagnostic({
      type: "realtime.text_command.send",
      status: "pending_session_update",
      commandTraceId: pendingTextCommand.commandTraceId,
      data: { inputLength: pendingTextCommand.inputLength, selectionMode: "tool" }
    });
  }

  private flushPendingTextCommandAfterActiveResponse(): void {
    const pendingTextCommand = this.pendingTextCommandAfterActiveResponse;
    if (!pendingTextCommand) return;
    this.pendingTextCommandAfterActiveResponse = null;
    this.sendTextCommandSelectorUpdate(pendingTextCommand);
  }

  private clearResponseCreateConflictRetry(commandTraceId?: string): void {
    if (
      !commandTraceId ||
      !this.pendingResponseCreateConflictRetry ||
      this.pendingResponseCreateConflictRetry.commandTraceId === commandTraceId
    ) {
      if (this.responseCreateConflictRetryTimeout) {
        clearTimeout(this.responseCreateConflictRetryTimeout);
        this.responseCreateConflictRetryTimeout = null;
      }
      this.pendingResponseCreateConflictRetry = null;
    }
    if (commandTraceId) {
      this.responseCreateConflictRetryCounts.delete(commandTraceId);
    } else {
      this.responseCreateConflictRetryCounts.clear();
    }
  }

  private scheduleResponseCreateConflictRetry(commandTraceId?: string): void {
    const traceId = commandTraceId ?? this.activeUserCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined;
    if (!traceId) return;
    const retryCount = (this.responseCreateConflictRetryCounts.get(traceId) ?? 0) + 1;
    this.responseCreateConflictRetryCounts.set(traceId, retryCount);
    if (retryCount > REALTIME_RESPONSE_CREATE_CONFLICT_MAX_RETRIES) {
      this.emitDiagnostic({
        type: "realtime.response.create_conflict_retry",
        status: "failed",
        commandTraceId: traceId,
        errorCode: "REALTIME_RESPONSE_CREATE_ACTIVE_CONFLICT",
        data: { retryCount }
      });
      return;
    }
    if (this.responseCreateConflictRetryTimeout) {
      clearTimeout(this.responseCreateConflictRetryTimeout);
      this.responseCreateConflictRetryTimeout = null;
    }
    const pending: PendingResponseCreateConflictRetry = {
      commandTraceId: traceId,
      responseMode: this.connectMode === "audio" ? "voice" : "text",
      retryCount,
      toolChoice: this.pendingResponseCreateAfterActiveToolResultChoice,
      instructions: this.pendingResponseCreateAfterActiveToolResultInstructions,
      tools: this.pendingResponseCreateAfterActiveToolResultTools
    };
    this.pendingResponseCreateConflictRetry = pending;
    this.emitDiagnostic({
      type: "realtime.response.create_conflict_retry",
      status: "scheduled",
      commandTraceId: traceId,
      data: { retryCount, delayMs: REALTIME_RESPONSE_CREATE_CONFLICT_RETRY_MS }
    });
    this.responseCreateConflictRetryTimeout = setTimeout(() => {
      if (this.pendingResponseCreateConflictRetry !== pending) return;
      this.pendingResponseCreateConflictRetry = null;
      this.responseCreateConflictRetryTimeout = null;
      this.emitDiagnostic({
        type: "realtime.response.create_conflict_retry",
        status: "sent",
        commandTraceId: pending.commandTraceId,
        data: { retryCount: pending.retryCount }
      });
      this.sendEvent(
        createRealtimeResponseCreateEvent(pending.responseMode, {
          toolChoice: pending.toolChoice,
          instructions: pending.instructions,
          tools: pending.tools
        }),
        {
        queueWhenClosed: false,
        commandTraceId: pending.commandTraceId
        }
      );
    }, REALTIME_RESPONSE_CREATE_CONFLICT_RETRY_MS);
  }

  sendTextCommand(input: string, options: { commandTraceId?: string } = {}): void {
    const text = input.trim();
    if (!text) {
      this.emitDiagnostic({
        type: "realtime.text_command.send",
        status: "failed",
        errorCode: "REALTIME_TEXT_COMMAND_EMPTY",
        commandTraceId: options.commandTraceId
      });
      throw new Error("REALTIME_TEXT_COMMAND_EMPTY");
    }
    if (this.dataChannel?.readyState !== "open" || !this.sessionReady) {
      this.emitDiagnostic({
        type: "realtime.text_command.send",
        status: "failed",
        errorCode: "REALTIME_TEXT_CHANNEL_NOT_READY",
        commandTraceId: options.commandTraceId
      });
      throw new Error("REALTIME_TEXT_CHANNEL_NOT_READY");
    }
    const commandTraceId = options.commandTraceId ?? createRealtimeVoiceCommandTraceId(`text_${Date.now()}`);
    this.activeRealtimeResponseTraceId = commandTraceId;
    if (this.activeUserCommandTraceId && this.activeUserCommandTraceId !== commandTraceId) {
      this.realtimeTraceCompletedToolKeys.delete(this.activeUserCommandTraceId);
      this.realtimeTraceExclusiveMediaModules.delete(this.activeUserCommandTraceId);
      this.realtimeTraceExclusiveMediaKeys.delete(this.activeUserCommandTraceId);
      this.realtimeTraceUserTranscripts.delete(this.activeUserCommandTraceId);
      this.realtimeTraceCommandToolCalls.delete(this.activeUserCommandTraceId);
    }
    this.activeUserCommandTraceId = commandTraceId;
    this.realtimeTraceUserTranscripts.set(commandTraceId, { input: text });
    const selectorTools = this.getEffectiveSessionTools();
    const selectorCatalog = this.createCapabilityCatalog(selectorTools);
    const selectorInstructions = [
      createRealtimeToolSelectionInstructions(selectorTools, selectorCatalog),
      "",
      "# Current User Command",
      text,
      "必须基于 Current User Command 调用 assistant.select_tool。即使不确定最终工具，也要给出 selectedModule、targetHint，并从工具目录选择最相关的候选工具。"
    ].join("\n");
    const selectorRealtimeTools = [createRealtimeToolSelectionTool(selectorTools, selectorCatalog)];
    const selectorToolChoice = createRealtimeToolSelectionToolChoice();
    const pendingTextCommand: PendingTextCommandAfterSelectorUpdate = {
      events: createRealtimeTextCommandEvents(text, {
        toolChoice: selectorToolChoice,
        tools: selectorRealtimeTools,
        instructions: selectorInstructions
      }),
      commandTraceId,
      inputLength: text.length,
      selectorInstructions,
      selectorTools: selectorRealtimeTools,
      selectorToolChoice
    };
    this.clearResponseCreateConflictRetry();
    if (this.connectMode === "audio") {
      this.emitDiagnostic({
        type: "realtime.text_command.clear_audio_buffer",
        status: "sent",
        commandTraceId
      });
      this.sendEvent({ type: "input_audio_buffer.clear" }, { queueWhenClosed: false, commandTraceId });
    }
    this.emitDiagnostic({
      type: "realtime.response.cancel_before_text_command",
      status: "sent",
      operationId: this.activeResponseId ?? undefined,
      commandTraceId,
      data: { reason: this.activeResponseId ? "tracked_active_response" : "preemptive" }
    });
    const activeResponseId = this.activeResponseId;
    this.sendEvent({ type: "response.cancel" }, { queueWhenClosed: false, commandTraceId });
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
    this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
    this.pendingResponseCreateAfterActiveToolResultTools = undefined;
    this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
    this.pendingSelectorToolResponses.clear();
    this.pendingScopedToolResponses.clear();
    this.pendingScopedToolSelectionResult = null;
    this.pendingPlanSelectionResult = null;
    this.pendingTextCommandAfterActiveResponse = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.activeScopedToolSelection = null;
    this.activeRealtimePlanSelection = null;
    if (activeResponseId) {
      if (this.connectMode === "audio") {
        this.emitDiagnostic({
          type: "realtime.output_audio.clear_before_text_command",
          status: "sent",
          operationId: activeResponseId,
          commandTraceId
        });
        this.sendEvent({ type: "output_audio_buffer.clear" }, { queueWhenClosed: false, commandTraceId });
      }
      this.emitDiagnostic({
        type: "realtime.text_command.send",
        status: "interrupted_active_response",
        operationId: activeResponseId,
        commandTraceId,
        data: { inputLength: text.length, selectionMode: "tool" }
      });
    }
    this.activeResponseId = null;
    this.sendTextCommandSelectorUpdate(pendingTextCommand);
  }

  async requestCommandPlan(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<CommandPlan | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.textToolCallEndpoint ?? "/api/realtime/tool-call";
    const accessToken = await this.options.getAccessToken?.();
    const baseContext = this.attachContextVersions(context, tools);
    const exposurePlan = this.createToolExposurePlan(input, baseContext, tools);
    const effectiveTools = exposurePlan.exposedTools.length ? exposurePlan.exposedTools : tools;
    const capabilityCatalog = this.createCapabilityCatalog(effectiveTools);
    const contextWithVersions = {
      ...baseContext,
      toolCatalogVersion: capabilityCatalog[0]?.catalogVersion ?? baseContext.toolCatalogVersion
    };
    this.emitDiagnostic({
      type: "realtime.text_plan.select.request",
      status: "started",
      data: { input, contextVersion: contextWithVersions.contextVersion, toolCatalogVersion: capabilityCatalog[0]?.catalogVersion }
    });
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimePlanSelectionRequestBody(input, effectiveTools, capabilityCatalog)
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_PLAN_SELECTION_FAILED");
    }
    const planSelectionPayload = await selectionResponse.json();
    this.emitOpenAIUsageDiagnostics(planSelectionPayload, "text_plan.select");
    const planSelection = parseRealtimeTextPlanSelectionResponse(planSelectionPayload);
    this.emitDiagnostic({
      type: "realtime.text_plan.select.result",
      status: planSelection?.steps.length ? "success" : "empty",
      data: { input, stepCount: planSelection?.steps.length ?? 0, steps: planSelection?.steps.map((step) => step.name) ?? [] }
    });
    if (!planSelection?.steps.length) return null;
    const moduleContexts = planSelection.steps
      .map((step) => {
        const selectedTool = effectiveTools.find((tool) => tool.name === step.name);
        const selectedModule =
          step.selectedModule ??
          selectedTool?.widgetType ??
          (selectedTool ? this.moduleRegistry?.findModuleForTool(selectedTool.name)?.type : undefined) ??
          selectedTool?.name.split(".")[0];
	        return selectedModule
	          ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
	              userText: input,
	              selectedToolHint: selectedTool?.name,
	              compactContext: contextWithVersions,
	              tools: effectiveTools
	            })
	          : undefined;
      })
      .filter((moduleContext): moduleContext is NonNullable<typeof moduleContext> => Boolean(moduleContext));
    const planResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeCommandPlanRequestBody(input, contextWithVersions, effectiveTools, planSelection, moduleContexts)
    });
    if (!planResponse.ok) {
      throw await readRealtimeEndpointError(planResponse, "REALTIME_PLAN_EXECUTION_FAILED");
    }
    const planPayload = await planResponse.json();
    this.emitOpenAIUsageDiagnostics(planPayload, "text_plan.execute");
    const parsedPlan = parseRealtimeCommandPlanResponse(planPayload);
    const plan = parsedPlan ? normalizeRealtimePlanArguments(parsedPlan, contextWithVersions, effectiveTools, planSelection.steps) : null;
    this.emitDiagnostic({
      type: "realtime.text_plan.execute.result",
      status: plan ? "success" : "empty",
      data: {
        input,
        contextVersion: contextWithVersions.contextVersion,
        toolCatalogVersion: contextWithVersions.toolCatalogVersion,
        commandCount: plan?.commands.length ?? 0,
        tools: plan?.commands.map((command) => command.tool) ?? []
      }
    });
    return plan;
  }

  async requestToolCall(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<AssistantToolCall | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.textToolCallEndpoint ?? "/api/realtime/tool-call";
    const accessToken = await this.options.getAccessToken?.();
    const baseContext = this.attachContextVersions(context, tools);
    const exposurePlan = this.createToolExposurePlan(input, baseContext, tools);
    const effectiveTools = exposurePlan.exposedTools.length ? exposurePlan.exposedTools : tools;
    const capabilityCatalog = this.createCapabilityCatalog(effectiveTools);
    const contextWithVersions = {
      ...baseContext,
      toolCatalogVersion: capabilityCatalog[0]?.catalogVersion ?? baseContext.toolCatalogVersion
    };
    this.emitDiagnostic({
      type: "realtime.text_tool.select.request",
      status: "started",
      data: { input, contextVersion: contextWithVersions.contextVersion, toolCatalogVersion: capabilityCatalog[0]?.catalogVersion }
    });
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeToolSelectionRequestBody(input, effectiveTools, capabilityCatalog)
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_TOOL_SELECTION_FAILED");
    }
    const selectionPayload = await selectionResponse.json();
    this.emitOpenAIUsageDiagnostics(selectionPayload, "text_tool.select");
    const selection = parseRealtimeTextToolSelectionResponse(selectionPayload);
    const resolvedSelection = selection
      ? this.resolveScopedToolsForSelection(selection, contextWithVersions, effectiveTools)
      : null;
    this.emitDiagnostic({
      type: "realtime.text_tool.select.result",
      status: selection && resolvedSelection?.ok ? "success" : "empty",
      toolName: resolvedSelection?.ok ? resolvedSelection.selectedTool.name : selection?.name,
      data: {
        input,
        confidence: selection?.confidence,
        selectedModule: selection?.selectedModule,
        intent: selection?.intent,
        targetHint: selection?.targetHint,
        candidateTools: selection?.candidateTools,
        scopedTools: resolvedSelection?.ok ? resolvedSelection.scopedTools.map((tool) => tool.name) : undefined
      }
    });
    if (!selection || !resolvedSelection?.ok) return null;
    if (
      typeof selection.confidence === "number" &&
      selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD &&
      !resolvedSelection.candidateMode &&
      !shouldAcceptLowConfidenceToolSelection(resolvedSelection.selectedTool.name, resolvedSelection.input, resolvedSelection.selection.targetHint)
    ) {
      this.emitDiagnostic({
        type: "realtime.text_tool.select.low_confidence",
        status: "needs_clarification",
        toolName: resolvedSelection.selectedTool.name,
        data: { input, confidence: selection.confidence }
      });
      return null;
    }

    const scopedContext = createScopedRealtimeContextForTools(contextWithVersions, resolvedSelection.scopedTools, resolvedSelection.selection, input);
    const selectedModule = resolvedSelection.selectedModule;
    const moduleContext = selectedModule
      ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
          userText: input,
          selectedToolHint: resolvedSelection.scopedTools.map((tool) => tool.name).join(","),
          compactContext: contextWithVersions,
          tools: resolvedSelection.scopedTools
        })
      : undefined;
    const toolCallResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeScopedToolCallRequestBody(input, scopedContext, resolvedSelection.scopedTools, resolvedSelection.selection, moduleContext ?? undefined)
    });
    if (!toolCallResponse.ok) {
      throw await readRealtimeEndpointError(toolCallResponse, "REALTIME_TOOL_CALL_FAILED");
    }
    const toolCallPayload = await toolCallResponse.json();
    this.emitOpenAIUsageDiagnostics(toolCallPayload, "text_tool.execute");
    const parsedCall = parseRealtimeTextToolCallResponse(toolCallPayload);
    const call = parsedCall
      ? bindWindowToolTargetForCall(parsedCall, contextWithVersions, resolvedSelection.scopedTools, { ...resolvedSelection.selection, userCommand: input })
      : null;
    this.emitDiagnostic({
      type: "realtime.text_tool.execute.result",
      status: call ? "success" : "empty",
      operationId: call?.id,
      toolName: call?.name,
      data: { input }
    });
    return call;
  }

  private handleFunctionCall(call: AssistantToolCall, eventCommandTraceId?: string): void {
    if (!this.sessionReady) {
      return;
    }
    const commandTraceId = eventCommandTraceId ?? this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? this.activeUserCommandTraceId ?? undefined;
    const resumedTraceHasTranscript = Boolean(
      commandTraceId &&
        this.interruptedRealtimeCommandTraceIds.has(commandTraceId) &&
        this.realtimeTraceUserTranscripts.has(commandTraceId)
    );
    const userTurnTraceId = resumedTraceHasTranscript
      ? commandTraceId
      : this.activeCommandTraceId ?? this.activeUserCommandTraceId ?? commandTraceId;
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId) && shouldSkipInterruptedRealtimeFunctionCall(call.name)) {
      this.emitDiagnostic({
        type: "realtime.function_call.skip",
        status: "interrupted",
        operationId: call.id,
        toolName: call.name,
        commandTraceId,
        data: { source: call.source }
      });
      return;
    }
    if (userTurnTraceId) {
      this.functionCallTraceIds.set(call.id, userTurnTraceId);
    }
    if (userTurnTraceId && userTurnTraceId !== commandTraceId && this.interruptedRealtimeCommandTraceIds.has(userTurnTraceId) && shouldSkipInterruptedRealtimeFunctionCall(call.name)) {
      this.emitDiagnostic({
        type: "realtime.function_call.skip",
        status: "interrupted",
        operationId: call.id,
        toolName: call.name,
        commandTraceId: userTurnTraceId,
        data: { source: call.source }
      });
      return;
    }
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId)) {
      this.emitDiagnostic({
        type: "realtime.function_call.resume_interrupted_control_call",
        status: "received",
        operationId: call.id,
        toolName: call.name,
        commandTraceId,
        data: { source: call.source }
      });
    }
    const executionTraceId = userTurnTraceId ?? commandTraceId;
    if (call.name === REALTIME_COMMAND_EXECUTION_TOOL_NAME) {
      this.handleRealtimeCommandExecution(call, executionTraceId);
      return;
    }
    if (call.name === REALTIME_PLAN_SELECTION_TOOL_NAME) {
      this.handlePlanSelection(call, executionTraceId);
      return;
    }
    if (call.name === REALTIME_PLAN_SUBMISSION_TOOL_NAME) {
      this.handlePlanSubmission(call, executionTraceId);
      return;
    }
    if (isLegacyRealtimeCommandPlanTool(call.name)) {
      this.handleLegacyRealtimeCommandPlan(call, executionTraceId);
      return;
    }
    if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME) {
      if (executionTraceId) {
        this.realtimeTraceCommandToolCalls.add(executionTraceId);
        this.clearPendingSelectorToolResponse(executionTraceId);
      }
      this.emitDiagnostic({
        type: "realtime.function_call.selection",
        status: "received",
        operationId: call.id,
        toolName: call.name,
        commandTraceId: executionTraceId
      });
      this.handleToolSelection(call);
      return;
    }
    const hadPendingScopedToolResponse = executionTraceId ? this.pendingScopedToolResponses.has(executionTraceId) : false;
    this.clearPendingScopedToolResponse(executionTraceId);
    this.clearPendingSelectorToolResponse(executionTraceId);
    const fallbackText =
      (executionTraceId ? this.realtimeTraceUserTranscripts.get(executionTraceId)?.input ?? "" : "") ||
      this.activeScopedToolSelection?.userCommand ||
      call.transcript ||
      "";
    if (call.name === "tv.fullscreen" && /(退出|取消|关闭|關閉|離開|离开).{0,6}(全屏|fullscreen)|^(退出|取消|关闭|關閉)(电视)?全屏$/i.test(fallbackText)) {
      const exitFullscreenCall: AssistantToolCall = {
        ...call,
        name: "app.fullscreen.set",
        arguments: { enabled: false },
        transcript: fallbackText
      };
      this.emitDiagnostic({
        type: "realtime.function_call.fullscreen_exit_rewrite",
        status: "success",
        operationId: call.id,
        toolName: exitFullscreenCall.name,
        commandTraceId: executionTraceId,
        data: { input: fallbackText }
      });
      void this.options.onFunctionCall?.(exitFullscreenCall);
      return;
    }
    const realtimeTargetHint = this.activeScopedToolSelection ?? (fallbackText ? { userCommand: fallbackText, targetHint: fallbackText } : undefined);
    const sanitized = sanitizeRealtimeToolCallArguments(call, this.findToolSpec(call.name), fallbackText);
    const addWidgetBoundCall = inferAddWidgetDefinitionForCall(
      sanitized.call,
      this.currentContext,
      this.currentTools,
      realtimeTargetHint,
      fallbackText
    );
    const repairedAddWidgetCall = repairBoardAddWidgetFollowUp(
      addWidgetBoundCall,
      this.currentContext,
      this.currentTools,
      realtimeTargetHint,
      fallbackText
    );
    if (
      repairedAddWidgetCall.name === REALTIME_ADD_WIDGET_TOOL_NAME &&
      JSON.stringify(repairedAddWidgetCall.arguments) !== JSON.stringify(addWidgetBoundCall.arguments)
    ) {
      this.emitDiagnostic({
        type: "realtime.function_call.add_widget_follow_up_repaired",
        status: "success",
        operationId: call.id,
        toolName: repairedAddWidgetCall.name,
        commandTraceId: executionTraceId,
        data: createSafeRealtimeToolCallDiagnosticData(repairedAddWidgetCall)
      });
    }
    const missingWidgetBoundCall = wrapMissingWidgetDetailCallWithAddWidget(
      repairedAddWidgetCall,
      this.currentContext,
      this.findToolSpec(repairedAddWidgetCall.name),
      fallbackText
    );
    if (missingWidgetBoundCall.name !== repairedAddWidgetCall.name) {
      this.emitDiagnostic({
        type: "realtime.function_call.missing_widget_wrapped",
        status: "success",
        operationId: call.id,
        toolName: missingWidgetBoundCall.name,
        commandTraceId: executionTraceId,
        data: createSafeRealtimeToolCallDiagnosticData(missingWidgetBoundCall)
      });
    }
    const completedToolCall = completeRealtimeToolArguments(
      bindWindowToolTargetForCall(missingWidgetBoundCall, this.currentContext, this.currentTools, realtimeTargetHint),
      this.currentContext,
      fallbackText
    );
    const toolCall: AssistantToolCall = {
      ...completedToolCall,
      transcript: completedToolCall.transcript || fallbackText || undefined,
      commandTraceId: executionTraceId
    };
    this.activeScopedToolSelection = null;
    if (sanitized.removedKeys.length) {
      this.emitDiagnostic({
        type: "realtime.function_call.arguments_sanitized",
        status: "success",
        operationId: call.id,
        toolName: call.name,
        commandTraceId: executionTraceId,
        data: { removedKeys: sanitized.removedKeys }
      });
    }
    const completionKey = createRealtimeToolCompletionKey(toolCall);
    const skipReason = this.resolveRecentRealtimeToolSkipReason(toolCall, executionTraceId, fallbackText);
    if (skipReason) {
      this.emitDiagnostic({
        type: `realtime.function_call.${skipReason.reason}`,
        status: "skipped",
        operationId: toolCall.id,
        toolName: toolCall.name,
        commandTraceId: executionTraceId,
        data: {
          completionKey: skipReason.completionKey ?? completionKey,
          previousMediaModule: skipReason.previousMediaModule
        }
      });
      createRealtimeToolResultEvents(
        toolCall,
        {
          status: "success",
          message:
            skipReason.reason === "media_conflict" || skipReason.reason === "media_stale"
              ? "已忽略冲突的旧媒体操作。"
              : "该操作已经完成，无需重复执行。",
          data: {
            duplicateCompleted: skipReason.reason !== "media_conflict" && skipReason.reason !== "media_stale",
            mediaConflictSkipped: skipReason.reason === "media_conflict" || skipReason.reason === "media_stale",
            finalToolResult: true,
            assistantInstruction: REALTIME_CONCISE_RESPONSE_INSTRUCTIONS
          }
        },
        {
          activeResponseId: this.activeResponseId,
          responseMode: this.connectMode === "audio" ? "voice" : "text",
          continueResponse: false
        }
      ).forEach((event) => this.sendEvent(event, { queueWhenClosed: false, commandTraceId: executionTraceId }));
      return;
    }
    if (this.shouldSkipUnscopedVoiceToolCall(toolCall.name, executionTraceId, hadPendingScopedToolResponse)) {
      this.emitDiagnostic({
        type: "realtime.function_call.unscoped_voice_tool",
        status: "skipped",
        operationId: toolCall.id,
        toolName: toolCall.name,
        commandTraceId: executionTraceId,
        data: { source: toolCall.source }
      });
      createRealtimeToolResultEvents(
        toolCall,
        {
          status: "needs_clarification",
          message: "请先选择候选工具。",
          errorCode: "REALTIME_VOICE_TOOL_NOT_SCOPED"
        },
        {
          activeResponseId: this.activeResponseId,
          responseMode: this.connectMode === "audio" ? "voice" : "text",
          continueResponse: false
        }
      ).forEach((event) => this.sendEvent(event, { queueWhenClosed: false, commandTraceId: executionTraceId }));
      this.sendToolSelectionReset(executionTraceId);
      return;
    }
    const safeToolCallDiagnosticData = createSafeRealtimeToolCallDiagnosticData(toolCall);
    this.emitDiagnostic({
      type: "realtime.function_call.tool",
      status: "received",
      operationId: toolCall.id,
      toolName: toolCall.name,
      commandTraceId: executionTraceId,
      data: safeToolCallDiagnosticData
    });
    if (
      toolCall.name === REALTIME_ADD_WIDGET_TOOL_NAME &&
      safeToolCallDiagnosticData &&
      typeof safeToolCallDiagnosticData.followUpName === "string" &&
      safeToolCallDiagnosticData.followUpName
    ) {
      this.emitDiagnostic({
        type: "realtime.function_call.add_widget_follow_up",
        status: "received",
        operationId: toolCall.id,
        toolName: safeToolCallDiagnosticData.followUpName,
        commandTraceId: executionTraceId,
        data: safeToolCallDiagnosticData
      });
    }
    if (executionTraceId) {
      this.realtimeTraceCommandToolCalls.add(executionTraceId);
    }
    const execution = Promise.resolve(this.options.onFunctionCall?.(toolCall));
    if (shouldAppendTvFullscreenAfterCall(toolCall, fallbackText)) {
      void execution.then(() => {
        const fullscreenCall: AssistantToolCall = {
          id: `${toolCall.id}_tv_fullscreen_followup`,
          name: "tv.fullscreen",
          arguments: {},
          source: "shortcut",
          transcript: fallbackText
        };
        this.emitDiagnostic({
          type: "realtime.function_call.tv_fullscreen_followup",
          status: "started",
          operationId: fullscreenCall.id,
          toolName: fullscreenCall.name,
          commandTraceId: executionTraceId,
          data: { input: fallbackText }
        });
        return this.options.onFunctionCall?.(fullscreenCall);
      });
    } else {
      void execution;
    }
  }

  private handleLegacyRealtimeCommandPlan(call: AssistantToolCall, commandTraceId?: string): void {
    const fallbackText =
      (commandTraceId ? this.realtimeTraceUserTranscripts.get(commandTraceId)?.input ?? "" : "") ||
      this.activeScopedToolSelection?.userCommand ||
      "";
    const command = extractLegacyRealtimeCommandText(call, fallbackText);
    if (!command) {
      this.emitDiagnostic({
        type: "realtime.function_call.legacy_plan",
        status: "needs_clarification",
        operationId: call.id,
        toolName: call.name,
        commandTraceId,
        errorCode: "REALTIME_COMMAND_PLAN_MISSING"
      });
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要听到要执行的具体指令。",
        errorCode: "REALTIME_COMMAND_PLAN_MISSING"
      });
      return;
    }
    if (commandTraceId) {
      this.realtimeTraceCommandToolCalls.add(commandTraceId);
      this.realtimeTraceUserTranscripts.delete(commandTraceId);
    }
    this.emitDiagnostic({
      type: "realtime.function_call.legacy_plan",
      status: "fallback_command_started",
      operationId: call.id,
      toolName: call.name,
      commandTraceId,
      data: { input: command }
    });
    void Promise.resolve(this.options.onCommand?.(command, { callId: call.id, commandTraceId }))
      .then((result) => {
        const finalResult = result ?? {
          status: "failed",
          message: "本地命令执行器不可用。",
          errorCode: "REALTIME_COMMAND_HANDLER_MISSING"
        };
        this.emitDiagnostic({
          type: "realtime.function_call.legacy_plan_result",
          status: finalResult.status,
          operationId: call.id,
          toolName: call.name,
          commandTraceId,
          message: finalResult.message,
          errorCode: finalResult.errorCode,
          data: { input: command }
        });
        this.sendToolResult(call, finalResult);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "命令执行失败";
        this.emitDiagnostic({
          type: "realtime.function_call.legacy_plan_result",
          status: "failed",
          operationId: call.id,
          toolName: call.name,
          commandTraceId,
          message,
          errorCode: "REALTIME_COMMAND_HANDLER_FAILED",
          data: { input: command }
        });
        this.sendToolResult(call, {
          status: "failed",
          message,
          errorCode: "REALTIME_COMMAND_HANDLER_FAILED"
        });
      });
  }

  private handleRealtimeCommandExecution(call: AssistantToolCall, commandTraceId?: string): void {
    const parsed = parseRealtimeCommandExecutionArguments(call.arguments);
    if (!parsed) {
      this.emitDiagnostic({
        type: "realtime.function_call.command",
        status: "needs_clarification",
        operationId: call.id,
        toolName: call.name,
        commandTraceId,
        errorCode: "REALTIME_COMMAND_EMPTY"
      });
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要听到要执行的具体指令。",
        errorCode: "REALTIME_COMMAND_EMPTY"
      });
      return;
    }
    if (commandTraceId) {
      this.realtimeTraceCommandToolCalls.add(commandTraceId);
      this.realtimeTraceUserTranscripts.delete(commandTraceId);
    }
    this.emitDiagnostic({
      type: "realtime.function_call.command",
      status: "started",
      operationId: call.id,
      toolName: call.name,
      commandTraceId,
      data: { input: parsed.command }
    });
    void Promise.resolve(this.options.onCommand?.(parsed.command, { callId: call.id, commandTraceId }))
      .then((result) => {
        const finalResult = result ?? {
          status: "failed",
          message: "本地命令执行器不可用。",
          errorCode: "REALTIME_COMMAND_HANDLER_MISSING"
        };
        this.emitDiagnostic({
          type: "realtime.function_call.command_result",
          status: finalResult.status,
          operationId: call.id,
          toolName: call.name,
          commandTraceId,
          message: finalResult.message,
          errorCode: finalResult.errorCode,
          data: { input: parsed.command }
        });
        this.sendToolResult(call, finalResult);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "命令执行失败";
        this.emitDiagnostic({
          type: "realtime.function_call.command_result",
          status: "failed",
          operationId: call.id,
          toolName: call.name,
          commandTraceId,
          message,
          errorCode: "REALTIME_COMMAND_HANDLER_FAILED",
          data: { input: parsed.command }
        });
        this.sendToolResult(call, {
          status: "failed",
          message,
          errorCode: "REALTIME_COMMAND_HANDLER_FAILED"
        });
      });
  }

  private handlePlanSelection(call: AssistantToolCall, commandTraceId?: string): void {
    const selection = parseRealtimePlanSelectionArguments(call.arguments);
    const tracedInput = commandTraceId ? this.realtimeTraceUserTranscripts.get(commandTraceId)?.input ?? "" : "";
    const input = selection?.userCommand || tracedInput || "";
    if (!selection || !input || !this.currentContext) {
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要完整的命令内容和当前桌面上下文。",
        errorCode: "PLAN_SELECTION_CONTEXT_MISSING"
      });
      return;
    }
    const lowConfidenceStep = selection.steps.find(
      (step) => typeof step.confidence === "number" && step.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD
    );
    if (lowConfidenceStep) {
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要再确认其中一个操作。",
        errorCode: "PLAN_SELECTION_LOW_CONFIDENCE",
        data: { stepId: lowConfidenceStep.id, tool: lowConfidenceStep.name }
      });
      return;
    }

    const selectedTools: AssistantToolSpec[] = [];
    const resolvedSteps = selection.steps.map((step) => {
      const requestedTool = this.findToolSpec(step.name);
      if (!requestedTool) return null;
      const selectedModule =
        step.selectedModule ??
        requestedTool.widgetType ??
        this.moduleRegistry?.findModuleForTool(requestedTool.name)?.type ??
        requestedTool.name.split(".")[0];
      selectedTools.push(requestedTool);
      return { ...step, selectedModule, userCommand: input };
    });
    if (resolvedSteps.some((step) => !step)) {
      const unknownTools = selection.steps.filter((step) => !this.findToolSpec(step.name)).map((step) => step.name);
      this.sendToolResult(call, {
        status: "failed",
        message: `命令计划包含未注册工具：${unknownTools.join("、")}`,
        errorCode: "PLAN_SELECTION_UNKNOWN_TOOL"
      });
      return;
    }

    const normalizedSelection = {
      ...selection,
      userCommand: input,
      steps: resolvedSteps.filter((step): step is NonNullable<typeof step> => Boolean(step))
    };
    const addWidgetTool = this.findToolSpec(REALTIME_ADD_WIDGET_TOOL_NAME);
    if (addWidgetTool) selectedTools.push(addWidgetTool);
    const tools = this.uniqueTools(selectedTools);
    const moduleContexts = normalizedSelection.steps
      .map((step) => step.selectedModule
        ? this.moduleRegistry?.getScopedContextForModule(step.selectedModule, {
            userText: input,
            selectedToolHint: step.name,
            compactContext: this.currentContext!,
            tools
          }) ?? undefined
        : undefined)
      .filter((context): context is RealtimeScopedModuleContext => Boolean(context))
      .filter((context, index, contexts) => contexts.findIndex((item) => item.moduleType === context.moduleType) === index);

    this.activeRealtimePlanSelection = { selection: normalizedSelection, input, tools };
    this.pendingPlanSelectionResult = {
      call,
      commandTraceId,
      result: {
        status: "success",
        message: "已识别完整操作序列，正在生成执行计划。",
        data: { steps: normalizedSelection.steps.map((step) => step.name) }
      }
    };
    if (commandTraceId) this.realtimeTraceCommandToolCalls.add(commandTraceId);
    this.sendEvent(createRealtimeCommandPlanUpdate({
      command: input,
      context: this.currentContext,
      tools,
      selection: normalizedSelection,
      moduleContexts
    }));
    this.emitDiagnostic({
      type: "realtime.plan_selection.success",
      status: "success",
      operationId: call.id,
      commandTraceId,
      data: { input, steps: normalizedSelection.steps.map((step) => step.name), modules: moduleContexts.map((item) => item.moduleType) }
    });
  }

  private handlePlanSubmission(call: AssistantToolCall, commandTraceId?: string): void {
    const active = this.activeRealtimePlanSelection;
    const parsedPlan = active
      ? parseRealtimeSubmittedCommandPlan(call.arguments, active.input, active.tools) ??
        createFallbackCommandPlanFromSelection(active.input, active.selection, active.tools)
      : null;
    const parsed = parsedPlan && active
      ? {
          ...parsedPlan,
          commands: parsedPlan.commands.map((command) => {
            if ((command.tool !== "tv.play" && command.tool !== "tv.select_channel") || !isRecord(command.args)) {
              return command;
            }
            if (typeof command.args.channelName === "string" && command.args.channelName.trim()) {
              return {
                ...command,
                args: completeTvChannelArgumentsFromContext(command.args, this.currentContext, active.input)
              };
            }
            const channelName = extractTvChannelNameFromText(active.input) || findContextTvChannelName(active.input, this.currentContext);
            return channelName ? { ...command, args: { ...command.args, channelName } } : command;
          })
        }
      : null;
    if (!active || !parsed || !this.currentContext) {
      const fallbackText =
        (active?.input ?? "") ||
        (commandTraceId ? this.realtimeTraceUserTranscripts.get(commandTraceId)?.input ?? "" : "") ||
        this.activeScopedToolSelection?.userCommand ||
        "";
      const command = extractLegacyRealtimeCommandText(call, fallbackText);
      if (command) {
        this.handleLegacyRealtimeCommandPlan(call, commandTraceId);
        return;
      }
      this.sendToolResult(call, {
        status: "failed",
        message: "没有可执行的完整命令计划。",
        errorCode: "REALTIME_COMMAND_PLAN_MISSING"
      });
      return;
    }
    const plan = normalizeRealtimePlanArguments(parsed, this.currentContext, active.tools, active.selection.steps);
    this.activeRealtimePlanSelection = null;
    if (commandTraceId) this.realtimeTraceCommandToolCalls.add(commandTraceId);
    void Promise.resolve(this.options.onCommandPlan?.(active.input, plan, { callId: call.id, commandTraceId }))
      .then((result) => {
        const finalResult = result ?? {
          status: "failed" as const,
          message: "本地命令计划执行器不可用。",
          errorCode: "REALTIME_COMMAND_PLAN_HANDLER_MISSING"
        };
        this.emitDiagnostic({
          type: "realtime.function_call.command_plan_result",
          status: finalResult.status,
          operationId: call.id,
          commandTraceId,
          message: finalResult.message,
          errorCode: finalResult.errorCode,
          data: {
            commandCount: plan.commands.length,
            tools: plan.commands.map((command) => command.tool),
            commands: plan.commands.map((command) => ({
              toolName: command.tool,
              args: createSafeRealtimeToolCallDiagnosticData({
                id: command.id,
                name: command.tool,
                arguments: command.args,
                source: "realtime"
              })
            }))
          }
        });
        this.sendToolResult(call, finalResult);
      })
      .catch((error) => {
        this.sendToolResult(call, {
          status: "failed",
          message: error instanceof Error ? error.message : "命令计划执行失败",
          errorCode: "REALTIME_COMMAND_PLAN_HANDLER_FAILED"
        });
      });
  }

  private deferToolSelectionUntilTranscript(call: AssistantToolCall, commandTraceId: string): void {
    const previous = this.pendingRealtimeToolSelections.get(commandTraceId);
    if (previous) clearTimeout(previous.timeout);
    const timeout = setTimeout(() => {
      const pending = this.pendingRealtimeToolSelections.get(commandTraceId);
      if (!pending || pending.call.id !== call.id) return;
      this.pendingRealtimeToolSelections.delete(commandTraceId);
      this.emitDiagnostic({
        type: "realtime.tool_selection.transcript_wait",
        status: "timeout",
        operationId: call.id,
        toolName: REALTIME_TOOL_SELECTION_TOOL_NAME,
        commandTraceId
      });
      this.handleToolSelection(call, true);
    }, REALTIME_TRANSCRIPT_SELECTION_GRACE_MS);
    this.pendingRealtimeToolSelections.set(commandTraceId, { call, timeout });
    this.emitDiagnostic({
      type: "realtime.tool_selection.transcript_wait",
      status: "started",
      operationId: call.id,
      toolName: REALTIME_TOOL_SELECTION_TOOL_NAME,
      commandTraceId
    });
  }

  private flushPendingToolSelection(commandTraceId?: string): void {
    if (!commandTraceId) return;
    const pending = this.pendingRealtimeToolSelections.get(commandTraceId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingRealtimeToolSelections.delete(commandTraceId);
    this.emitDiagnostic({
      type: "realtime.tool_selection.transcript_wait",
      status: "completed",
      operationId: pending.call.id,
      toolName: REALTIME_TOOL_SELECTION_TOOL_NAME,
      commandTraceId
    });
    this.handleToolSelection(pending.call, true);
  }

  private handleToolSelection(call: AssistantToolCall, allowWithoutTranscript = false): void {
    const commandTraceId =
      this.functionCallTraceIds.get(call.id) ??
      this.activeCommandTraceId ??
      this.activeRealtimeResponseTraceId ??
      this.activeUserCommandTraceId ??
      undefined;
    if (
      !allowWithoutTranscript &&
      this.connectMode === "audio" &&
      commandTraceId &&
      !this.realtimeTraceUserTranscripts.has(commandTraceId)
    ) {
      this.deferToolSelectionUntilTranscript(call, commandTraceId);
      return;
    }
    const selection = parseToolSelectionArguments(call.arguments);
    const resolvedSelection = selection && this.currentContext
      ? this.resolveScopedToolsForSelection(selection, this.currentContext, this.currentTools, commandTraceId)
      : null;
    if (!selection || !resolvedSelection?.ok || !this.currentContext) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.failed",
        status: "needs_clarification",
        operationId: call.id,
        toolName: selection?.name,
        errorCode: "TOOL_SELECTION_CONTEXT_MISSING",
        data: {
          selectedModule: selection?.selectedModule,
          intent: selection?.intent,
          targetHint: selection?.targetHint,
          exposedTools: resolvedSelection && !resolvedSelection.ok ? resolvedSelection.exposedTools : undefined,
          excludedReasons: resolvedSelection && !resolvedSelection.ok ? resolvedSelection.excludedReasons : undefined
        }
      });
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要再确认要操作哪个工具或小工具。",
        errorCode: "TOOL_SELECTION_CONTEXT_MISSING"
      });
      return;
    }
    if (
      typeof selection.confidence === "number" &&
      selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD &&
      !resolvedSelection.candidateMode &&
      !shouldAcceptLowConfidenceToolSelection(resolvedSelection.selectedTool.name, resolvedSelection.input, resolvedSelection.selection.targetHint)
    ) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.low_confidence",
        status: "needs_clarification",
        operationId: call.id,
        toolName: resolvedSelection.selectedTool.name,
        data: { confidence: selection.confidence, targetHint: selection.targetHint, selectedModule: selection.selectedModule, intent: selection.intent }
      });
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要再确认要操作哪个小工具。",
        errorCode: "TOOL_SELECTION_LOW_CONFIDENCE"
      });
      return;
    }
    if (commandTraceId) {
      this.realtimeTraceCommandToolCalls.add(commandTraceId);
    }

    const selectedTool = resolvedSelection.selectedTool;
    const resolvedConcreteSelection = resolvedSelection.selection;
    const selectedModule = resolvedSelection.selectedModule ?? this.resolveSelectedModuleForToolSelection(selectedTool, resolvedConcreteSelection);
    const scopedToolChoiceName = resolveScopedToolChoiceName(
      selectedTool,
      selectedModule,
      this.currentContext,
      resolvedSelection.scopedTools,
      resolvedSelection.candidateMode
    );

    if (
      selectedTool.name === "widget.remove" &&
      isBulkWindowSelectionText(resolvedConcreteSelection.userCommand, resolvedConcreteSelection.targetHint)
    ) {
      const targetText = resolvedConcreteSelection.userCommand || resolvedConcreteSelection.targetHint || "所有窗口";
      const bulkCall: AssistantToolCall = {
        id: `${call.id}_bulk_window_shortcut`,
        name: "widget.remove",
        arguments: { targetText },
        source: "shortcut",
        transcript: targetText
      };
      this.emitDiagnostic({
        type: "realtime.tool_selection.local_bulk_shortcut",
        status: "started",
        operationId: call.id,
        toolName: selectedTool.name,
        commandTraceId,
        data: { targetText }
      });
      void Promise.resolve(this.options.onFunctionCall?.(bulkCall))
        .then(() => {
          this.sendToolResult(call, {
            status: "success",
            message: "已用本地快捷方式执行批量窗口关闭。",
            data: { selectedTool: selectedTool.name, targetHint: resolvedConcreteSelection.targetHint, execution: "local_bulk_shortcut" }
          });
        })
        .catch((error) => {
          this.sendToolResult(call, {
            status: "failed",
            message: error instanceof Error ? error.message : "批量窗口关闭失败",
            errorCode: "LOCAL_BULK_SHORTCUT_FAILED"
          });
        });
      return;
    }

    const shouldTryLocalAddWidgetShortcut =
      (selectedTool.name === "board.add_widget" && !resolvedSelection.candidateMode) ||
      (selectedModule === "translate" && scopedToolChoiceName === REALTIME_ADD_WIDGET_TOOL_NAME);
    if (shouldTryLocalAddWidgetShortcut) {
      const addWidgetSelection = {
        ...resolvedConcreteSelection,
        name: REALTIME_ADD_WIDGET_TOOL_NAME,
        requestedToolName: selectedTool.name === REALTIME_ADD_WIDGET_TOOL_NAME ? resolvedConcreteSelection.requestedToolName : selectedTool.name
      };
      const addWidgetShortcut = this.createLocalAddWidgetShortcut(call, addWidgetSelection, commandTraceId);
      if (addWidgetShortcut) {
        this.emitDiagnostic({
          type: "realtime.tool_selection.local_add_widget_shortcut",
          status: "started",
          operationId: call.id,
          toolName: selectedTool.name,
          commandTraceId,
          data: {
            definitionId: addWidgetShortcut.definition.definitionId,
            definitionType: addWidgetShortcut.definition.type,
            targetText: addWidgetShortcut.targetText,
            followUpName: isRecord(addWidgetShortcut.call.arguments) && isRecord(addWidgetShortcut.call.arguments.followUp)
              ? addWidgetShortcut.call.arguments.followUp.name
              : undefined,
            channelName:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.channelName === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.channelName
                : undefined,
            indexCodes:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              Array.isArray(addWidgetShortcut.call.arguments.followUp.arguments.indexCodes)
                ? addWidgetShortcut.call.arguments.followUp.arguments.indexCodes
                : undefined,
            query:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.query === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.query
                : undefined,
            text:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.text === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.text
                : undefined,
            content:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.content === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.content
                : undefined,
            value:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              (typeof addWidgetShortcut.call.arguments.followUp.arguments.value === "string" ||
                typeof addWidgetShortcut.call.arguments.followUp.arguments.value === "number")
                ? addWidgetShortcut.call.arguments.followUp.arguments.value
                : undefined,
            category:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.category === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.category
                : undefined,
            fromUnit:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.fromUnit === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.fromUnit
                : undefined,
            toUnit:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.toUnit === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.toUnit
                : undefined,
            sourceText:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.sourceText === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.sourceText
                : undefined,
            targetLang:
              isRecord(addWidgetShortcut.call.arguments) &&
              isRecord(addWidgetShortcut.call.arguments.followUp) &&
              isRecord(addWidgetShortcut.call.arguments.followUp.arguments) &&
              typeof addWidgetShortcut.call.arguments.followUp.arguments.targetLang === "string"
                ? addWidgetShortcut.call.arguments.followUp.arguments.targetLang
                : undefined
          }
        });
        void Promise.resolve(this.options.onFunctionCall?.(addWidgetShortcut.call))
          .then(() => {
            this.sendToolResult(call, {
              status: "success",
              message: `已打开${addWidgetShortcut.definition.name || "小工具"}。`,
              data: {
                selectedTool: selectedTool.name,
                targetHint: resolvedConcreteSelection.targetHint,
                definitionId: addWidgetShortcut.definition.definitionId,
                execution: "local_add_widget_shortcut"
              }
            });
          })
          .catch((error) => {
            this.sendToolResult(call, {
              status: "failed",
              message: error instanceof Error ? error.message : "打开小工具失败",
              errorCode: "LOCAL_ADD_WIDGET_SHORTCUT_FAILED"
            });
          });
        return;
      }
    }

    this.activeScopedToolSelection = {
      selectedModule,
      targetHint: resolvedConcreteSelection.targetHint,
      userCommand: resolvedSelection.input,
      candidateTools: resolvedConcreteSelection.candidateTools,
      selectedToolName: scopedToolChoiceName
    };
    const update = createScopedRealtimeToolUpdate(
      {
        input: resolvedSelection.input,
        context: this.currentContext,
        tools: resolvedSelection.scopedTools,
        moduleContext: selectedModule
          ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
              userText: resolvedSelection.input,
              selectedToolHint: resolvedSelection.candidateMode ? resolvedSelection.scopedTools.map((tool) => tool.name).join(",") : selectedTool.name,
              compactContext: this.currentContext,
              tools: resolvedSelection.scopedTools
            }) ?? undefined
          : undefined
      },
      resolvedConcreteSelection
    );
    if (!update) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.failed",
        status: "failed",
        operationId: call.id,
        toolName: selectedTool.name,
        errorCode: "UNKNOWN_SELECTED_TOOL"
      });
      this.sendToolResult(call, {
        status: "failed",
        message: `未知工具：${selectedTool.name}`,
        errorCode: "UNKNOWN_SELECTED_TOOL"
      });
      return;
    }

    this.pendingScopedToolSelectionResult = {
      call,
      result: {
        status: "success",
        message: "已选择工具，正在读取所需上下文。",
        data: {
          selectedTool: scopedToolChoiceName,
          candidateTools: resolvedConcreteSelection.candidateTools,
          targetHint: resolvedConcreteSelection.targetHint,
          selectedModule,
          intent: resolvedConcreteSelection.intent,
          userCommand: resolvedSelection.input,
          scopedTools: resolvedSelection.scopedTools.map((tool) => tool.name)
        }
      },
      commandTraceId
    };
    this.scopedToolSelectionResponseInstructions.set(call.id, update.session.instructions);
    this.sendEvent(update);
    this.emitDiagnostic({
      type: "realtime.tool_selection.success",
      status: "success",
      operationId: call.id,
      toolName: selectedTool.name,
      data: {
        candidateMode: resolvedSelection.candidateMode,
        candidateTools: resolvedConcreteSelection.candidateTools,
        targetHint: resolvedConcreteSelection.targetHint,
        selectedModule,
        intent: resolvedConcreteSelection.intent,
        confidence: resolvedConcreteSelection.confidence,
        scopedTools: resolvedSelection.scopedTools.map((tool) => tool.name)
      }
    });
    this.emitDiagnostic({
      type: "realtime.tool_selection.result_deferred",
      status: "pending_session_update",
      operationId: call.id,
      toolName: selectedTool.name,
      commandTraceId
    });
  }

  private resolveSelectedModuleForToolSelection(
    selectedTool: AssistantToolSpec,
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>>
  ): string | undefined {
    if (selection.selectedModule) return selection.selectedModule;
    if (selectedTool.widgetType) return selectedTool.widgetType;

    const input = selection.userCommand || selection.targetHint || selection.name || "";
    const scopedContext = this.currentContext ? createScopedRealtimeContext(this.currentContext, selectedTool, selection, input) : null;
    const scopedWidgetTypes = [...new Set((scopedContext?.widgets ?? []).map((widget) => widget.type).filter(Boolean))];
    if (scopedWidgetTypes.length === 1) {
      return scopedWidgetTypes[0];
    }

    if (!selectedTool.name.startsWith("widget.")) {
      return this.moduleRegistry?.findModuleForTool(selectedTool.name)?.type ?? selectedTool.name.split(".")[0];
    }

    return undefined;
  }

  private createLocalAddWidgetShortcut(
    selectionCall: AssistantToolCall,
    selection: NonNullable<ReturnType<typeof parseToolSelectionArguments>> & { requestedToolName?: string },
    commandTraceId?: string
  ): { call: AssistantToolCall; definition: RealtimeDefinitionSummary; targetText: string } | null {
    if (!this.currentContext?.availableDefinitions?.length) return null;
    const targetText = [
      compactTargetText(selection.selectedModule),
      compactTargetText(selection.targetHint),
      compactTargetText(selection.userCommand)
    ].join(" ");
    const scored = this.currentContext.availableDefinitions
      .map((definition) => ({ definition, score: scoreDefinitionTarget(targetText, definition) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.definition.name.localeCompare(b.definition.name));
    const definition = scored[0]?.definition;
    if (!definition) return null;
    const input = selection.userCommand || selection.targetHint || definition.name;
    const pureOpenWidget = isPureOpenWidgetText(input);
    const countdownSeconds = definition.type === "countdown" ? parseCountdownSecondsFromText(input) : undefined;
    const musicQuery =
      definition.type === "music" && !pureOpenWidget && !/(切到|切换到|聚焦|当前小工具|播放器)/.test(input)
        ? extractMusicQueryFromText(input)
        : "";
    const tvChannelName =
      definition.type === "tv" ? extractTvChannelNameFromText(input) || findContextTvChannelName(input, this.currentContext) : "";
    const tvFullscreen = definition.type === "tv" && /全屏|fullscreen/i.test(input) && !hasExplicitTvChannelText(input);
    const noteContent = definition.type === "note" ? extractNoteContentFromText(input) : "";
    const todoText = definition.type === "todo" ? extractTodoTextFromText(input) : "";
    const recorderStart = definition.type === "recorder" && /(开始|启动|录一段|录音)/.test(input) && !/(停止|结束|暂停)/.test(input);
    const marketIndexCodes = definition.type === "market" ? extractMarketIndexCodesFromText(input) : [];
    const marketQuery = definition.type === "market" && marketIndexCodes.length === 0 ? extractMarketQueryFromText(input) : "";
    const converterArgs = definition.type === "converter" ? normalizeConverterToolArguments({}, input) : {};
    const hasConverterArgs = typeof converterArgs.value === "string" || typeof converterArgs.value === "number";
    const translateArgs = definition.type === "translate" ? extractTranslateArgsFromText(input) : {};
    const hasTranslateArgs = typeof translateArgs.sourceText === "string" && translateArgs.sourceText.trim().length > 0;
    const shouldOpenMissingWidget = Boolean(
      selection.requestedToolName &&
        selection.requestedToolName !== REALTIME_ADD_WIDGET_TOOL_NAME &&
        definition.type &&
        !this.currentContext.widgets.some((widget) => widget.type === definition.type) &&
        canOpenMissingWidgetForSelectedTool(input, definition.type, selection.requestedToolName, selection.intent)
    );
    if (
      !pureOpenWidget &&
      !countdownSeconds &&
      !musicQuery &&
      !tvChannelName &&
      !tvFullscreen &&
      !noteContent &&
      !todoText &&
      !recorderStart &&
      marketIndexCodes.length === 0 &&
      !marketQuery &&
      !hasConverterArgs &&
      !hasTranslateArgs &&
      !shouldOpenMissingWidget
    ) {
      return null;
    }
    const argumentsWithOptionalFollowUp: Record<string, unknown> = { definitionId: definition.definitionId };
    if (countdownSeconds) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "countdown.set",
        arguments: { totalSeconds: countdownSeconds, start: true }
      };
    } else if (definition.type === "music" && musicQuery) {
      const realtimeMusicTool =
        selection.requestedToolName === "music.search" || selection.requestedToolName === "music.play"
          ? selection.requestedToolName
          : selection.candidateTools?.find((toolName) => toolName === "music.search" || toolName === "music.play") ?? "";
      const wantsSearchOnly = isMusicSearchOnlyRequest(input) || (isMusicSearchRequest(input) && !isMusicExplicitPlayRequest(input));
      argumentsWithOptionalFollowUp.followUp = {
        name: realtimeMusicTool || (wantsSearchOnly ? "music.search" : "music.play"),
        arguments: { query: musicQuery }
      };
    } else if (definition.type === "tv") {
      if (tvChannelName) {
        argumentsWithOptionalFollowUp.followUp = {
          name: "tv.play",
          arguments: { channelName: tvChannelName }
        };
      } else if (tvFullscreen) {
        argumentsWithOptionalFollowUp.followUp = {
          name: "tv.fullscreen",
          arguments: {}
        };
      }
    } else if (definition.type === "note" && noteContent) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "note.write",
        arguments: { content: noteContent, mode: "append" }
      };
    } else if (definition.type === "todo" && todoText) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "todo.add_item",
        arguments: { text: todoText }
      };
    } else if (definition.type === "market") {
      if (marketIndexCodes.length) {
        argumentsWithOptionalFollowUp.followUp = {
          name: "market.set_indices",
          arguments: { indexCodes: marketIndexCodes }
        };
      } else if (marketQuery) {
        argumentsWithOptionalFollowUp.followUp = {
          name: "market.set_indices",
          arguments: { query: marketQuery }
        };
      }
    } else if (definition.type === "converter" && hasConverterArgs) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "converter.set",
        arguments: converterArgs
      };
    } else if (definition.type === "translate" && hasTranslateArgs) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "translate.set_draft",
        arguments: translateArgs
      };
    } else if (definition.type === "recorder" && recorderStart) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "recorder.start",
        arguments: {}
      };
    }
    return {
      definition,
      targetText: input,
      call: {
        id: `${selectionCall.id}_add_widget_shortcut`,
        name: "board.add_widget",
        arguments: argumentsWithOptionalFollowUp,
        source: "shortcut",
        transcript: input,
        commandTraceId
      } as AssistantToolCall
    };
  }

  private sendEvent(event: RealtimeEvent, options: { queueWhenClosed?: boolean; commandTraceId?: string } = {}): void {
    this.emitDiagnostic({
      type: "realtime.event.send",
      status: this.dataChannel?.readyState === "open" ? "sent" : "queued_or_dropped",
      commandTraceId: options.commandTraceId,
      data: { eventType: typeof event.type === "string" ? event.type : "unknown" }
    });
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(event));
      return;
    }
    if (options.queueWhenClosed ?? shouldQueueRealtimeEventWhenClosed(event)) {
      this.queuedEvents.push(event);
    }
  }

  private discardQueuedSessionUpdates(reason: string): void {
    const count = this.queuedEvents.length;
    if (count === 0) return;
    this.queuedEvents = [];
    this.emitDiagnostic({
      type: "realtime.session.queued_updates_discarded",
      status: "cleared",
      data: { count, reason }
    });
  }

  private handleRealtimeEventData(data: unknown): void {
    let parsed: RealtimeEvent | null = null;
    let parsedCommandTraceId: string | undefined;
    try {
      parsed = typeof data === "string" ? (JSON.parse(data) as RealtimeEvent) : isRecord(data) ? data : null;
    } catch {
      handleRealtimeFunctionCallEvent(data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
      return;
    }
    if (parsed) {
      const eventType = typeof parsed.type === "string" ? parsed.type : "unknown";
      const commandTraceId = this.prepareRealtimeEventTrace(parsed);
      parsedCommandTraceId = commandTraceId;
      if (shouldLogRealtimeEventType(eventType)) {
        this.emitDiagnostic({
          type: "realtime.event.receive",
          status: "received",
          commandTraceId,
          data: { eventType }
        });
      }
      this.emitRealtimeSemanticDiagnostic(parsed, commandTraceId);
      this.handleRealtimeLifecycleEvent(parsed, commandTraceId);
    }
    handleRealtimeFunctionCallEvent(parsed ?? data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call, parsedCommandTraceId));
  }

  private handleRealtimeLifecycleEvent(event: RealtimeEvent, commandTraceId?: string): void {
    const previousActiveResponseId = this.activeResponseId;
    this.activeResponseId = reduceRealtimeActiveResponseId(this.activeResponseId, event);
    let sentScopedResponseAfterToolResult = false;
    let sentSelectorRetry = false;
    if (previousActiveResponseId && !this.activeResponseId && this.pendingToolSelectionResetAfterActiveResponse) {
      const pending = this.pendingToolSelectionResetAfterActiveResponse;
      this.pendingToolSelectionResetAfterActiveResponse = null;
      this.sendToolSelectionReset(pending.commandTraceId);
    }
    if (previousActiveResponseId && !this.activeResponseId && this.pendingTextCommandAfterActiveResponse) {
      this.pendingResponseCreateAfterActiveToolResult = false;
      this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
      this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
      this.pendingResponseCreateAfterActiveToolResultTools = undefined;
      this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
      this.flushPendingTextCommandAfterActiveResponse();
    }
    if (previousActiveResponseId && !this.activeResponseId && this.pendingResponseCreateAfterActiveToolResult) {
      const toolChoice = this.pendingResponseCreateAfterActiveToolResultChoice;
      const instructions = this.pendingResponseCreateAfterActiveToolResultInstructions;
      const tools = this.pendingResponseCreateAfterActiveToolResultTools;
      const pendingCommandTraceId = this.pendingResponseCreateAfterActiveToolResultCommandTraceId ?? commandTraceId;
      this.pendingResponseCreateAfterActiveToolResult = false;
      this.pendingResponseCreateAfterActiveToolResultChoice = undefined;
      this.pendingResponseCreateAfterActiveToolResultInstructions = undefined;
      this.pendingResponseCreateAfterActiveToolResultTools = undefined;
      this.pendingResponseCreateAfterActiveToolResultCommandTraceId = undefined;
      const responseMode = this.connectMode === "audio" ? "voice" : "text";
      this.emitDiagnostic({ type: "realtime.response.create_after_tool_result", status: "sent", commandTraceId: pendingCommandTraceId });
      this.sendEvent(createRealtimeResponseCreateEvent(responseMode, { toolChoice, instructions, tools }), {
        queueWhenClosed: false,
        commandTraceId: pendingCommandTraceId
      });
      if (pendingCommandTraceId && instructions && tools?.length && toolChoice && toolChoice !== "none") {
        this.registerPendingScopedToolResponse(pendingCommandTraceId, {
          responseMode,
          instructions,
          tools,
          toolChoice
        });
        sentScopedResponseAfterToolResult = true;
      }
    }
    if (event.type === "response.done" && !sentScopedResponseAfterToolResult) {
      this.retryPendingScopedToolResponseIfNeeded(commandTraceId);
      sentSelectorRetry = this.retryPendingSelectorToolResponseIfNeeded(commandTraceId);
    }
    if (event.type === "session.created") {
      this.clearSessionUpdateTimeout();
      this.sessionReady = true;
      this.resolveSessionReadyPromise();
      this.emitDiagnostic({ type: "realtime.session.created_ready", status: "connected" });
      this.options.onStatusChange?.("connected");
      this.sendInitialToolSelectionUpdateIfReady("session_created");
      return;
    }
    if (event.type === "response.created" && commandTraceId) {
      this.clearResponseCreateConflictRetry(commandTraceId);
    }
    if (event.type === "session.updated") {
      this.clearSessionUpdateTimeout();
      this.clearInitialToolSelectionUpdateTimeout();
      this.sessionReady = true;
      this.resolveSessionReadyPromise();
      this.emitDiagnostic({ type: "realtime.session.updated", status: "connected" });
      this.options.onStatusChange?.("connected");
      const pendingSelection = this.pendingScopedToolSelectionResult;
      if (pendingSelection) {
        this.pendingScopedToolSelectionResult = null;
        this.emitDiagnostic({
          type: "realtime.tool_selection.result_send_after_session_update",
          status: "sent",
          operationId: pendingSelection.call.id,
          toolName: pendingSelection.call.name,
          commandTraceId: pendingSelection.commandTraceId
        });
        this.sendToolResult(pendingSelection.call, pendingSelection.result);
      }
      const pendingPlanSelection = this.pendingPlanSelectionResult;
      if (pendingPlanSelection) {
        this.pendingPlanSelectionResult = null;
        this.emitDiagnostic({
          type: "realtime.plan_selection.result_send_after_session_update",
          status: "sent",
          operationId: pendingPlanSelection.call.id,
          toolName: pendingPlanSelection.call.name,
          commandTraceId: pendingPlanSelection.commandTraceId
        });
        this.sendToolResult(pendingPlanSelection.call, pendingPlanSelection.result);
      }
      const pendingTextCommand = this.pendingTextCommandAfterSelectorUpdate;
      if (pendingTextCommand) {
        this.pendingTextCommandAfterSelectorUpdate = null;
        this.emitDiagnostic({
          type: "realtime.text_command.send",
          status: "started",
          commandTraceId: pendingTextCommand.commandTraceId,
          data: { inputLength: pendingTextCommand.inputLength }
        });
        for (const pendingEvent of pendingTextCommand.events) {
          this.sendEvent(pendingEvent, { queueWhenClosed: false, commandTraceId: pendingTextCommand.commandTraceId });
        }
        this.registerPendingSelectorToolResponse(pendingTextCommand.commandTraceId, {
          instructions: pendingTextCommand.selectorInstructions,
          tools: pendingTextCommand.selectorTools,
          toolChoice: pendingTextCommand.selectorToolChoice
        });
      }
      return;
    }
    if (event.type === "error") {
      const message = extractRealtimeEventErrorMessage(event);
      if (isIgnorableRealtimeCancelRace(message)) {
        this.emitDiagnostic({ type: "realtime.event.error", status: "ignored", message, commandTraceId });
        if (this.pendingTextCommandAfterActiveResponse) {
          this.activeResponseId = null;
          this.flushPendingTextCommandAfterActiveResponse();
        }
        return;
      }
      if (isRealtimeActiveResponseConflict(message)) {
        this.emitDiagnostic({ type: "realtime.event.error", status: "retryable", message, commandTraceId });
        this.sendEvent({ type: "response.cancel" }, { queueWhenClosed: false, commandTraceId });
        if (this.connectMode === "audio") {
          this.sendEvent({ type: "output_audio_buffer.clear" }, { queueWhenClosed: false, commandTraceId });
        }
        this.scheduleResponseCreateConflictRetry(commandTraceId);
        return;
      }
      this.emitDiagnostic({ type: "realtime.event.error", status: "failed", message });
      this.failSessionUpdate(message);
    }
    if (
      commandTraceId &&
      (event.type === "response.done" || event.type === "response.cancelled" || event.type === "response.failed")
    ) {
      if (event.type === "response.done") {
        const estimate = estimateRealtimeResponseCost(this.activeRealtimeModel, event);
        if (estimate) {
          this.emitDiagnostic({
            type: "openai.usage.cost_estimate",
            status: estimate.estimateAvailable ? "estimated" : "usage_only",
            commandTraceId,
            data: estimate
          });
        }
      }
      if (!sentSelectorRetry) {
        this.handleUnhandledRealtimeUserTranscript(commandTraceId);
      }
    }
    this.clearFinishedRealtimeEventTrace(event);
  }

  private handleUnhandledRealtimeUserTranscript(commandTraceId: string): void {
    if (this.realtimeTraceCommandToolCalls.has(commandTraceId) || !this.options.onUnhandledUserTranscript) return;
    const transcript = this.realtimeTraceUserTranscripts.get(commandTraceId);
    if (!transcript?.input) return;
    this.realtimeTraceCommandToolCalls.add(commandTraceId);
    this.emitDiagnostic({
      type: "realtime.voice.user_transcript_unhandled",
      status: "started",
      commandTraceId,
      data: { itemId: transcript.itemId, input: transcript.input }
    });
    try {
      void Promise.resolve(this.options.onUnhandledUserTranscript(transcript.input, { commandTraceId, itemId: transcript.itemId }))
        .then(() => {
          this.emitDiagnostic({
            type: "realtime.voice.user_transcript_unhandled",
            status: "success",
            commandTraceId,
            data: { itemId: transcript.itemId, input: transcript.input }
          });
        })
        .catch((error) => {
          this.emitDiagnostic({
            type: "realtime.voice.user_transcript_unhandled",
            status: "failed",
            commandTraceId,
            message: error instanceof Error ? error.message : "unhandled user transcript fallback failed",
            data: { itemId: transcript.itemId, input: transcript.input }
          });
        });
    } catch (error) {
      this.emitDiagnostic({
        type: "realtime.voice.user_transcript_unhandled",
        status: "failed",
        commandTraceId,
        message: error instanceof Error ? error.message : "unhandled user transcript fallback failed",
        data: { itemId: transcript.itemId, input: transcript.input }
      });
    }
  }

  private getOrCreateRealtimeResponseTraceId(responseId: string): string {
    const existing = this.realtimeResponseTraceIds.get(responseId);
    if (existing) return existing;
    const commandTraceId = this.activeUserCommandTraceId ?? this.activeRealtimeResponseTraceId ?? createRealtimeVoiceCommandTraceId(responseId);
    this.realtimeResponseTraceIds.set(responseId, commandTraceId);
    return commandTraceId;
  }

  private getOrCreateRealtimeItemTraceId(itemId: string): string {
    const existing = this.realtimeItemTraceIds.get(itemId);
    if (existing) return existing;
    const commandTraceId = this.activeUserCommandTraceId ?? this.activeRealtimeResponseTraceId ?? createRealtimeVoiceCommandTraceId(itemId);
    this.realtimeItemTraceIds.set(itemId, commandTraceId);
    if (this.realtimeItemTraceIds.size > 32) {
      const oldestKey = this.realtimeItemTraceIds.keys().next().value;
      if (typeof oldestKey === "string") {
        this.realtimeItemTraceIds.delete(oldestKey);
      }
    }
    return commandTraceId;
  }

  private prepareRealtimeEventTrace(event: RealtimeEvent): string | undefined {
    const itemId = extractRealtimeItemId(event);
    if (event.type === "input_audio_buffer.speech_started") {
      return this.beginRealtimeVoiceTurn(itemId);
    }
    const responseId = extractRealtimeResponseId(event);
    if (event.type === "response.created" && responseId) {
      const commandTraceId = this.getOrCreateRealtimeResponseTraceId(responseId);
      this.activeRealtimeResponseTraceId = commandTraceId;
      return commandTraceId;
    }
    if (responseId) {
      const commandTraceId = this.realtimeResponseTraceIds.get(responseId);
      if (commandTraceId) {
        this.activeRealtimeResponseTraceId = commandTraceId;
        return commandTraceId;
      }
    }
    if (itemId) {
      const commandTraceId = this.getOrCreateRealtimeItemTraceId(itemId);
      if (!this.suppressedEchoTraceIds.has(commandTraceId)) {
        this.activeRealtimeResponseTraceId = commandTraceId;
      }
      return commandTraceId;
    }
    return this.activeRealtimeResponseTraceId ?? undefined;
  }

  private emitRealtimeSemanticDiagnostic(event: RealtimeEvent, commandTraceId?: string): void {
    const eventType = typeof event.type === "string" ? event.type : "";
    const itemId = extractRealtimeItemId(event);
    const responseId = extractRealtimeResponseId(event);
    if (eventType === "input_audio_buffer.speech_started") {
      this.emitDiagnostic({
        type: "realtime.voice.speech_started",
        status: "listening",
        commandTraceId,
        data: {
          itemId,
          audioStartMs: typeof event.audio_start_ms === "number" ? event.audio_start_ms : undefined
        }
      });
      return;
    }
    if (eventType === "input_audio_buffer.speech_stopped") {
      this.emitDiagnostic({
        type: "realtime.voice.speech_stopped",
        status: "committed",
        commandTraceId,
        data: {
          itemId,
          audioEndMs: typeof event.audio_end_ms === "number" ? event.audio_end_ms : undefined
        }
      });
      return;
    }
    if (eventType === "conversation.item.input_audio_transcription.completed") {
      const transcript = extractRealtimeEventTranscript(event);
      this.emitDiagnostic({
        type: "realtime.voice.user_transcript",
        status: "success",
        commandTraceId,
        data: { itemId, transcript }
      });
      this.handleRealtimeUserTranscript(transcript, commandTraceId, itemId);
      return;
    }
    if (eventType === "conversation.item.input_audio_transcription.failed") {
      const error = isRecord(event.error) ? event.error : null;
      this.emitDiagnostic({
        type: "realtime.voice.user_transcript",
        status: "failed",
        commandTraceId,
        errorCode: typeof error?.code === "string" ? error.code : typeof error?.type === "string" ? error.type : undefined,
        message: typeof error?.message === "string" ? error.message : undefined,
        data: { itemId }
      });
      return;
    }
    if (eventType === "response.audio_transcript.done" || eventType === "response.output_audio_transcript.done") {
      const transcript = extractRealtimeEventTranscript(event);
      this.rememberAssistantTranscript(transcript);
      this.emitDiagnostic({
        type: "realtime.voice.assistant_transcript",
        status: "success",
        commandTraceId,
        data: { responseId, itemId, transcript }
      });
    }
  }

  private clearFinishedRealtimeEventTrace(event: RealtimeEvent): void {
    if (event.type !== "response.done" && event.type !== "response.cancelled" && event.type !== "response.failed") {
      return;
    }
    const responseId = extractRealtimeResponseId(event);
    const commandTraceId = responseId ? this.realtimeResponseTraceIds.get(responseId) : this.activeRealtimeResponseTraceId;
    if (responseId) {
      this.realtimeResponseTraceIds.delete(responseId);
    }
    if (commandTraceId && this.activeRealtimeResponseTraceId === commandTraceId) {
      this.activeRealtimeResponseTraceId = null;
    }
  }

  private handleRealtimeUserTranscript(transcript: string, commandTraceId?: string, itemId?: string): void {
    const input = transcript.trim();
    if (!input) return;
    if ((commandTraceId && this.suppressedEchoTraceIds.has(commandTraceId)) || this.isRecentAssistantEchoTranscript(input)) {
      if (commandTraceId) {
        this.markRealtimeTraceEchoSuppressed(commandTraceId);
        this.realtimeTraceUserTranscripts.delete(commandTraceId);
      }
      this.emitDiagnostic({
        type: "realtime.voice.echo_suppressed",
        status: "success",
        commandTraceId,
        data: { itemId, transcript: input }
      });
      return;
    }
    if (commandTraceId) {
      this.realtimeTraceUserTranscripts.set(commandTraceId, { input, itemId });
      this.flushPendingToolSelection(commandTraceId);
    }
    if (!this.options.onUserTranscript) return;
    try {
      void Promise.resolve(this.options.onUserTranscript(input, { commandTraceId, itemId }))
        .catch((error) => {
          this.emitDiagnostic({
            type: "realtime.voice.user_transcript_callback",
            status: "failed",
            commandTraceId,
            message: error instanceof Error ? error.message : "user transcript callback failed",
            data: { itemId, input }
          });
        });
    } catch (error) {
      this.emitDiagnostic({
        type: "realtime.voice.user_transcript_callback",
        status: "failed",
        commandTraceId,
        message: error instanceof Error ? error.message : "user transcript callback failed",
        data: { itemId, input }
      });
    }
  }

  private clearRealtimeTraceState(): void {
    for (const pending of this.pendingRealtimeToolSelections.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingRealtimeToolSelections.clear();
    this.activeRealtimeResponseTraceId = null;
    this.activeUserCommandTraceId = null;
    this.realtimeResponseTraceIds.clear();
    this.realtimeItemTraceIds.clear();
    this.functionCallTraceIds.clear();
    this.realtimeTraceCommandToolCalls.clear();
    this.realtimeTraceUserTranscripts.clear();
    this.realtimeTraceCompletedToolKeys.clear();
    this.realtimeTraceExclusiveMediaModules.clear();
    this.realtimeTraceExclusiveMediaKeys.clear();
    this.interruptedRealtimeCommandTraceIds.clear();
    this.suppressedEchoTraceIds.clear();
    this.recentAssistantTranscripts = [];
  }

  private createSessionReadyPromise(): Promise<void> {
    this.clearSessionReadyPromise();
    if (this.sessionReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.sessionReadyResolve = resolve;
      this.sessionReadyReject = reject;
    });
  }

  private resolveSessionReadyPromise(): void {
    const resolve = this.sessionReadyResolve;
    this.clearSessionReadyPromise();
    resolve?.();
  }

  private failSessionUpdate(message: string): void {
    if (this.sessionReady) return;
    const reject = this.sessionReadyReject;
    const error = new Error(message || "REALTIME_SESSION_UPDATE_FAILED");
    this.closeResources();
    this.options.onStatusChange?.("session_failed");
    reject?.(error);
  }

  private clearSessionReadyPromise(): void {
    this.sessionReadyResolve = null;
    this.sessionReadyReject = null;
  }

  private armSessionUpdateTimeout(): void {
    this.clearSessionUpdateTimeout();
    const timeoutMs = this.options.sessionUpdateTimeoutMs ?? DEFAULT_REALTIME_SESSION_UPDATE_TIMEOUT_MS;
    this.sessionUpdateTimeout = setTimeout(() => {
      if (this.sessionReady) return;
      this.emitDiagnostic({
        type: "realtime.session.update_timeout",
        status: "failed",
        errorCode: "REALTIME_SESSION_UPDATE_TIMEOUT",
        data: { timeoutMs }
      });
      this.failSessionUpdate("REALTIME_SESSION_UPDATE_TIMEOUT");
    }, timeoutMs);
  }

  private clearSessionUpdateTimeout(): void {
    if (this.sessionUpdateTimeout) {
      clearTimeout(this.sessionUpdateTimeout);
      this.sessionUpdateTimeout = null;
    }
  }

  private armInitialToolSelectionUpdateTimeout(): void {
    this.clearInitialToolSelectionUpdateTimeout();
    const timeoutMs = this.options.sessionUpdateTimeoutMs ?? DEFAULT_REALTIME_SESSION_UPDATE_TIMEOUT_MS;
    this.initialToolSelectionUpdateTimeout = setTimeout(() => {
      this.emitDiagnostic({
        type: "realtime.initial_selector_update_timeout",
        status: "fallback_available",
        errorCode: "REALTIME_INITIAL_SELECTOR_UPDATE_TIMEOUT",
        data: {
          timeoutMs,
          sessionReady: this.sessionReady,
          dataChannelState: this.dataChannel?.readyState ?? "missing"
        }
      });
      this.initialToolSelectionUpdateTimeout = null;
    }, timeoutMs);
  }

  private clearInitialToolSelectionUpdateTimeout(): void {
    if (this.initialToolSelectionUpdateTimeout) {
      clearTimeout(this.initialToolSelectionUpdateTimeout);
      this.initialToolSelectionUpdateTimeout = null;
    }
  }
}
