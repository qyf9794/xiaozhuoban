import {
  REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
  type WidgetAssistantRegistry,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext,
  type RealtimeModuleCatalogItem
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
  decodeRealtimeToolName
} from "./realtimeSessionConfig";
import { REALTIME_ADD_WIDGET_TOOL_NAME, findRealtimeWidgetType, realtimeWidgetAliases } from "./realtimeRoutingPolicy";
import {
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  createRealtimeCommandPlanRequestBody,
  createRealtimePlanSelectionRequestBody,
  createRealtimeScopedToolCallRequestBody,
  createRealtimeToolSelectionInstructions,
  createRealtimeToolSelectionRequestBody,
  createRealtimeToolSelectionTool,
  createScopedRealtimeContext,
  createScopedRealtimeToolUpdate,
  parseRealtimeCommandPlanResponse,
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
type PendingTextCommandAfterSelectorUpdate = {
  events: RealtimeEvent[];
  commandTraceId: string;
  inputLength: number;
};
type RealtimeTargetHint = Pick<RealtimeTextToolSelection, "selectedModule" | "targetHint"> & {
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
  switch: ["board.switch", "tv.select_channel"],
  create: ["board.create", "board.add_widget"],
  rename: ["board.rename"],
  toggle: ["app.sidebar.set", "app.fullscreen.set", "dialClock.set_night_mode"],
  write: ["note.write", "clipboard.add_text", "todo.add_item", "messageBoard.send"],
  translate: ["translate.set_draft"],
  calculate: ["calculator.set_display"],
  convert: ["converter.set"]
};
const REALTIME_MAX_OUTPUT_TOKENS = 480;
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
  const queryParts = [
    nextArgs.query,
    nextArgs.q,
    nextArgs.keyword,
    nextArgs.term,
    nextArgs.search,
    nextArgs.artist,
    nextArgs.artistName,
    nextArgs.singer,
    nextArgs.song,
    nextArgs.songName,
    nextArgs.title,
    nextArgs.track
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const query = Array.from(new Set(queryParts)).join(" ");
  if (query) {
    nextArgs.query = query;
  }
  delete nextArgs.keyword;
  delete nextArgs.q;
  delete nextArgs.term;
  delete nextArgs.search;
  delete nextArgs.artist;
  delete nextArgs.artistName;
  delete nextArgs.singer;
  delete nextArgs.song;
  delete nextArgs.songName;
  delete nextArgs.title;
  delete nextArgs.track;
  delete nextArgs.boardId;
  delete nextArgs.notAutoPlay;
  delete nextArgs.autoPlay;
  delete nextArgs.autoplay;
  return nextArgs;
}

function extractMusicQueryFromText(text: string): string {
  return text
    .replace(/^(我想听|想听|我要听|播放|放一下|放一首|来一首|来个|搜索|搜一下|搜一点|找一下|找一点)/, "")
    .replace(/(的歌|歌曲|音乐|歌单|不一定播放|先搜一下|先搜索一下)$/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountdownToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  const nextArgs = { ...args };
  if (typeof nextArgs.totalSeconds !== "number") {
    if (typeof nextArgs.durationMs === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationMs / 1000));
    } else if (typeof nextArgs.durationSeconds === "number") {
      nextArgs.totalSeconds = Math.max(0, Math.round(nextArgs.durationSeconds));
    }
  }
  if (typeof nextArgs.start !== "boolean" && typeof nextArgs.autoStart === "boolean") {
    nextArgs.start = nextArgs.autoStart;
  }
  delete nextArgs.durationMs;
  delete nextArgs.durationSeconds;
  delete nextArgs.autoStart;
  return nextArgs;
}

function parseCountdownSecondsFromText(text: string): number | undefined {
  const compact = text.replace(/\s+/g, "");
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
    nextArgs.text = nextArgs.text
      .replace(/^(给?待办(?:加|添加)?一条|添加待办|加一条待办|待办[:：]?)/, "")
      .trim() || nextArgs.text;
  }
  if (toolName === "todo.complete_item" && typeof nextArgs.text === "string") {
    nextArgs.text = nextArgs.text.replace(/^(把|将)?/, "").replace(/(标记为完成|标记完成|完成|勾掉|做完)$/, "").trim() || nextArgs.text;
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
  if (typeof nextArgs.query !== "string") {
    const query = nextArgs.companyName ?? nextArgs.company ?? nextArgs.name ?? nextArgs.stockName ?? fallbackText;
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
  return nextArgs;
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
  if (/Bloomberg|彭博/i.test(value)) return "Bloomberg";
  const cctv = value.match(/CCTV\s*[-_]?\s*(\d{1,2})/i);
  if (cctv) return `CCTV${cctv[1]}`;
  if (/央视.*新闻|新闻.*央视|CCTV\s*13/i.test(value)) return "CCTV13";
  if (/电影/.test(value)) return "CCTV6";
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

function normalizeRealtimeToolArguments(toolName: string, args: Record<string, unknown>, fallbackText = ""): Record<string, unknown> {
  let nextArgs = args;
  if (toolName === "music.search" || toolName === "music.play") {
    nextArgs = normalizeMusicToolArguments(nextArgs);
  }
  if (toolName === "todo.add_item" || toolName === "todo.complete_item") {
    nextArgs = normalizeTodoToolArguments(toolName, nextArgs, fallbackText);
  }
  if (toolName === "countdown.set") {
    nextArgs = normalizeCountdownToolArguments(nextArgs);
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
  if (toolName === "board.add_widget") {
    nextArgs = normalizeBoardAddWidgetArguments(nextArgs, fallbackText);
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
          arguments: normalizeCountdownToolArguments(followUpArgs)
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
  return scored[0]?.widget.type ?? "";
}

function bindWindowToolTargetForCall(
  call: AssistantToolCall,
  context: CompactAssistantContext | null,
  tools: AssistantToolSpec[],
  hint?: RealtimeTargetHint
): AssistantToolCall {
  if (!context || !isRecord(call.arguments) || typeof call.arguments.widgetId === "string") {
    return call;
  }
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
  const selectedTool = hint?.selectedToolName ? tools.find((tool) => tool.name === hint.selectedToolName) : undefined;
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
  if (followUpName === "music.search" || followUpName === "music.play") {
    nextArgs.followUp = {
      name: followUpName,
      arguments: normalizeMusicToolArguments({ query: input })
    };
  } else if (followUpName === "tv.play" || followUpName === "tv.select_channel") {
    nextArgs.followUp = {
      name: followUpName,
      arguments: normalizeTvToolArguments({}, input)
    };
  }
  return { ...call, arguments: nextArgs };
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
      const definitionId = typeof args.definitionId === "string" ? args.definitionId : definitionsByType.get(requestedType)?.definitionId;
      delete args.type;
      delete args.widgetType;
      delete args.boardId;
      if (definitionId) {
        args.definitionId = definitionId;
      }
      const definitionType = (context.availableDefinitions ?? []).find((definition) => definition.definitionId === definitionId)?.type;
      if (definitionType) {
        plannedWidgetTypeByCommandId.set(command.id, definitionType);
      }
    }

    const normalizedArgs = normalizeRealtimeToolArguments(command.tool, args);
    if (normalizedArgs !== args) {
      Object.keys(args).forEach((key) => delete args[key]);
      Object.assign(args, normalizedArgs);
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

  const normalizedCommands = commandsWithInsertedAdds.map((command) => {
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
  const groups = plan.executionGroups.map((group) => {
    const commandIds = group.commandIds.flatMap((id) => {
      const addCommandId = insertedAddBeforeCommand.get(id);
      return addCommandId ? [addCommandId, id] : [id];
    });
    const containsAddDependency = group.commandIds.some((id) => {
      const command = normalizedCommands.find((item) => item.id === id);
      return (command?.dependsOn ?? []).some((dependsOn) => commandIds.includes(dependsOn));
    });
    return containsAddDependency ? { ...group, commandIds, mode: "sequential" as const } : { ...group, commandIds };
  });

  return {
    ...plan,
    commands: normalizedCommands,
    executionGroups: groups
  };
}

function parseToolSelectionArguments(value: unknown): {
  name: string;
  selectedModule?: string;
  intent?: string;
  targetHint?: string;
  userCommand?: string;
  confidence?: number;
} | null {
  const parsed = parseArguments(value);
  if (!isRecord(parsed)) return null;
  const name = typeof parsed.name === "string" ? parsed.name : undefined;
  const selectedModule = typeof parsed.selectedModule === "string" ? parsed.selectedModule : undefined;
  const intent = typeof parsed.intent === "string" ? parsed.intent : undefined;
  const targetHint = typeof parsed.targetHint === "string" ? parsed.targetHint : undefined;
  const userCommand = typeof parsed.userCommand === "string" ? parsed.userCommand : undefined;
  if (!name) return null;
  return {
    name,
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
  "kind",
  "resultIndex",
  "cityCode",
  "cityName",
  "zones",
  "channelName",
  "indexCodes",
  "definitionId",
  "boardId",
  "enabled",
  "targetLang",
  "display",
  "expression",
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
    if (typeof followUpArgs.channelName === "string") data.channelName = followUpArgs.channelName;
    if (typeof followUpArgs.query === "string") data.query = followUpArgs.query;
  }
  return Object.keys(data).length ? data : undefined;
}

function shouldSendRealtimeToolResult(call: AssistantToolCall): boolean {
  return call.source === "realtime";
}

function createUserFacingRealtimeToolResult(call: AssistantToolCall, result: AssistantToolResult): AssistantToolResult {
  if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME || result.status !== "success") {
    return result;
  }
  return {
    ...result,
    message: formatAssistantResultMessage({
      status: result.status,
      message: result.message,
      toolName: call.name,
      data: result.data,
      seed: `${call.id}|${call.name}|${result.message}`
    })
  };
}

function isFinalLocalSelectorResult(call: AssistantToolCall, result: AssistantToolResult): boolean {
  if (call.name !== REALTIME_TOOL_SELECTION_TOOL_NAME || result.status !== "success" || !isRecord(result.data)) return false;
  return result.data.execution === "local_add_widget_shortcut" || result.data.execution === "local_bulk_shortcut";
}

function isBulkWindowSelectionText(...values: Array<string | undefined>): boolean {
  const normalized = values.filter(Boolean).join(" ").replace(/\s+/g, "");
  if (!normalized || /(保留|除了|除开|只关闭|只留下|留下|确认|先问|先确认|临时)/.test(normalized)) {
    return false;
  }
  return /(所有|全部|全都|全部的|所有的)/.test(normalized) && /(窗口|小工具|组件|面板)/.test(normalized);
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
  options: { activeResponseId?: string | null; responseMode?: RealtimeResponseMode; continueResponse?: boolean } = {}
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
    events.push(createRealtimeResponseCreateEvent(options.responseMode ?? "text"));
  }
  return events;
}

type RealtimeResponseMode = "text" | "voice";

function createRealtimeResponseCreateEvent(mode: RealtimeResponseMode = "text"): RealtimeEvent {
  return {
    type: "response.create",
    response: {
      output_modalities: mode === "voice" ? ["audio"] : ["text"],
      max_output_tokens: REALTIME_MAX_OUTPUT_TOKENS
    }
  };
}

function createRealtimeTextOnlyResponseCreateEvent(): RealtimeEvent {
  return createRealtimeResponseCreateEvent("text");
}

export function createRealtimeTextCommandEvents(input: string): RealtimeEvent[] {
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
    createRealtimeTextOnlyResponseCreateEvent()
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
  private activeCommandTraceId: string | null = null;
  private initialToolSelectionUpdateSent = false;
  private initialToolSelectionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeRealtimeResponseTraceId: string | null = null;
  private realtimeResponseTraceIds = new Map<string, string>();
  private realtimeItemTraceIds = new Map<string, string>();
  private functionCallTraceIds = new Map<string, string>();
  private realtimeTraceCommandToolCalls = new Set<string>();
  private realtimeTraceUserTranscripts = new Map<string, { input: string; itemId?: string }>();
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
  private pendingTextCommandAfterSelectorUpdate: PendingTextCommandAfterSelectorUpdate | null = null;
  private activeScopedToolSelection: RealtimeTargetHint | null = null;
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
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.activeScopedToolSelection = null;

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
        const [remoteStream] = event.streams;
        this.attachRemoteAudioStream(remoteStream);
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
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.activeScopedToolSelection = null;
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
    this.initialToolSelectionUpdateSent = false;
    this.clearInitialToolSelectionUpdateTimeout();
    this.pendingScopedToolSelectionResult = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.activeScopedToolSelection = null;
    this.clearRealtimeTraceState();
  }

  private releaseRemoteAudioElement(): void {
    this.stopRemoteAudioLevelMonitor();
    const audio = this.remoteAudioElement;
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
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
    this.markActiveRealtimeTracesInterrupted(commandTraceId);
    this.activeRealtimeResponseTraceId = commandTraceId;
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.pendingScopedToolSelectionResult = null;
    this.pendingTextCommandAfterSelectorUpdate = null;
    this.activeScopedToolSelection = null;

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
      this.activeResponseId = null;
    }
    if (shouldClearOutputAudio) {
      this.emitDiagnostic({
        type: "realtime.output_audio.clear_on_speech_started",
        status: "sent",
        commandTraceId
      });
      this.sendEvent({ type: "output_audio_buffer.clear" }, { queueWhenClosed: false, commandTraceId });
    }
    this.emitDiagnostic({
      type: "realtime.voice.selector_reset",
      status: "sent",
      commandTraceId,
      data: { toolCount: this.getEffectiveSessionTools().length }
    });
    this.sendEvent(this.createToolSelectionSessionUpdate(), { queueWhenClosed: false, commandTraceId });
    return commandTraceId;
  }

  private attachRemoteAudioStream(remoteStream: MediaStream | undefined): void {
    if (!remoteStream || typeof Audio === "undefined") return;
    this.releaseRemoteAudioElement();
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.srcObject = remoteStream;
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
    return selection.userCommand || tracedInput || selection.targetHint || selection.selectedModule || selection.intent || selection.name || "";
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
    return undefined;
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
        selection: RealtimeTextToolSelection & { name: string; requestedToolName?: string };
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
    const legacySelectedTool = selection.name ? tools.find((tool) => tool.name === selection.name) ?? this.findToolSpec(selection.name) : undefined;
    const selectedModule = this.resolveSelectedModuleFromSelection(selection, input, legacySelectedTool);
    const exposurePlan = this.createToolExposurePlan(input, context, tools);
    const exposedTools = exposurePlan.exposedTools.map((tool) => tool.name);
    const addWidgetTool = tools.find((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME);
    const moduleTools = selectedModule
      ? tools.filter((tool) => this.isToolForSelectionModule(tool, selectedModule))
      : [];
    const exposedToolNames = new Set(exposedTools);
    const intentPriorityNames = new Set([
      ...(selection.intent ? INTENT_TOOL_PRIORITIES[selection.intent] ?? [] : []),
      ...(selection.name ? [selection.name] : [])
    ]);
    const intentTools = tools.filter((tool) => intentPriorityNames.has(tool.name));
    const baseTools = exposurePlan.exposedTools.length
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
          context.availableDefinitions?.some((definition) => definition.type === selectedModule) &&
          (MODULE_OPEN_INTENTS.has(selection.intent ?? "") || !context.widgets.some((widget) => widget.type === selectedModule))
      );
    const scopedCandidates = this.uniqueTools([
      ...baseTools,
      ...(shouldIncludeAddWidget && addWidgetTool ? [addWidgetTool] : [])
    ]);
    const sortedCandidates = this.sortToolsForSelectionIntent(scopedCandidates, selection, selectedModule).slice(0, MAX_SCOPED_SELECTION_TOOLS);

    const hasMountedSelectedModule = selectedModule ? context.widgets.some((widget) => widget.type === selectedModule) : false;
    const canUseLocalAddWidgetFollowUp = Boolean(
      selectedModule &&
        addWidgetTool &&
        shouldIncludeAddWidget &&
        !hasMountedSelectedModule &&
        (isPureOpenWidgetText(input) || legacySelectedTool?.scope === "widget-detail")
    );
    const pureOpenAddWidget =
      selectedModule &&
      addWidgetTool &&
      sortedCandidates.some((tool) => tool.name === REALTIME_ADD_WIDGET_TOOL_NAME) &&
      (selection.intent === "open" || canUseLocalAddWidgetFollowUp) &&
      (isPureOpenWidgetText(input) || canUseLocalAddWidgetFollowUp)
        ? addWidgetTool
        : undefined;
    const legacyCandidate = selection.name ? sortedCandidates.find((tool) => tool.name === selection.name) : undefined;
    const selectedTool = pureOpenAddWidget ?? legacyCandidate ?? sortedCandidates.find((tool) => tool.name !== REALTIME_ADD_WIDGET_TOOL_NAME) ?? sortedCandidates[0];
    if (!selectedTool) {
      return {
        ok: false,
        input,
        exposedTools,
        excludedReasons: exposurePlan.excludedReasons
      };
    }

    const scopedTools = this.uniqueTools([
      selectedTool,
      ...sortedCandidates,
      ...(shouldIncludeAddWidget && addWidgetTool ? [addWidgetTool] : [])
    ]).slice(0, MAX_SCOPED_SELECTION_TOOLS);

    return {
      ok: true,
      input,
      selectedTool,
      selectedModule,
      scopedTools,
      selection: {
        ...selection,
        name: selectedTool.name,
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
    const commandTraceId = this.functionCallTraceIds.get(call.id) ?? this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined;
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId)) {
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
    const continueResponse = call.name === REALTIME_TOOL_SELECTION_TOOL_NAME && !isFinalLocalSelectorResult(call, result);
    createRealtimeToolResultEvents(call, userFacingResult, {
      activeResponseId: this.activeResponseId,
      responseMode: this.connectMode === "audio" ? "voice" : "text",
      continueResponse
    }).forEach((event) => this.sendEvent(event, { queueWhenClosed: false, commandTraceId }));
    if (hadActiveResponse && continueResponse) {
      this.pendingResponseCreateAfterActiveToolResult = true;
    }
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
    if (this.activeResponseId) {
      this.emitDiagnostic({
        type: "realtime.response.cancel_before_text_command",
        status: "sent",
        operationId: this.activeResponseId,
        commandTraceId
      });
      this.sendEvent({ type: "response.cancel" }, { queueWhenClosed: false, commandTraceId });
      this.activeResponseId = null;
      this.pendingResponseCreateAfterActiveToolResult = false;
      this.pendingScopedToolSelectionResult = null;
      this.pendingTextCommandAfterSelectorUpdate = null;
      this.activeScopedToolSelection = null;
    }
    this.emitDiagnostic({
      type: "realtime.text_command.reset_selector_tool",
      status: "sent",
      commandTraceId,
      data: { toolCount: this.getEffectiveSessionTools().length }
    });
    this.sendEvent(this.createToolSelectionSessionUpdate(), { queueWhenClosed: false, commandTraceId });
    this.pendingTextCommandAfterSelectorUpdate = {
      events: createRealtimeTextCommandEvents(text),
      commandTraceId,
      inputLength: text.length
    };
    this.emitDiagnostic({
      type: "realtime.text_command.send",
      status: "pending_session_update",
      commandTraceId,
      data: { inputLength: text.length }
    });
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
        scopedTools: resolvedSelection?.ok ? resolvedSelection.scopedTools.map((tool) => tool.name) : undefined
      }
    });
    if (!selection || !resolvedSelection?.ok) return null;
    if (typeof selection.confidence === "number" && selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD) {
      this.emitDiagnostic({
        type: "realtime.text_tool.select.low_confidence",
        status: "needs_clarification",
        toolName: resolvedSelection.selectedTool.name,
        data: { input, confidence: selection.confidence }
      });
      return null;
    }

    const scopedContext = createScopedRealtimeContext(contextWithVersions, resolvedSelection.selectedTool, resolvedSelection.selection, input);
    const selectedModule = resolvedSelection.selectedModule;
    const moduleContext = selectedModule
      ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
          userText: input,
          selectedToolHint: resolvedSelection.selectedTool.name,
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

  private handleFunctionCall(call: AssistantToolCall): void {
    if (!this.sessionReady) {
      return;
    }
    const commandTraceId = this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined;
    if (commandTraceId) {
      this.functionCallTraceIds.set(call.id, commandTraceId);
    }
    if (commandTraceId && this.interruptedRealtimeCommandTraceIds.has(commandTraceId)) {
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
    if (call.name === REALTIME_COMMAND_EXECUTION_TOOL_NAME) {
      this.handleRealtimeCommandExecution(call, commandTraceId);
      return;
    }
    if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME) {
      this.emitDiagnostic({
        type: "realtime.function_call.selection",
        status: "received",
        operationId: call.id,
        toolName: call.name,
        commandTraceId
      });
      this.handleToolSelection(call);
      return;
    }
    const fallbackText =
      (commandTraceId ? this.realtimeTraceUserTranscripts.get(commandTraceId)?.input ?? "" : "") ||
      this.activeScopedToolSelection?.userCommand ||
      "";
    const realtimeTargetHint = this.activeScopedToolSelection ?? (fallbackText ? { userCommand: fallbackText, targetHint: fallbackText } : undefined);
    const sanitized = sanitizeRealtimeToolCallArguments(call, this.findToolSpec(call.name), fallbackText);
    const addWidgetBoundCall = inferAddWidgetDefinitionForCall(
      sanitized.call,
      this.currentContext,
      this.currentTools,
      realtimeTargetHint,
      fallbackText
    );
    const toolCall = completeRealtimeToolArguments(
      bindWindowToolTargetForCall(addWidgetBoundCall, this.currentContext, this.currentTools, realtimeTargetHint),
      this.currentContext,
      fallbackText
    );
    this.activeScopedToolSelection = null;
    if (sanitized.removedKeys.length) {
      this.emitDiagnostic({
        type: "realtime.function_call.arguments_sanitized",
        status: "success",
        operationId: call.id,
        toolName: call.name,
        commandTraceId,
        data: { removedKeys: sanitized.removedKeys }
      });
    }
    this.emitDiagnostic({
      type: "realtime.function_call.tool",
      status: "received",
      operationId: toolCall.id,
      toolName: toolCall.name,
      commandTraceId,
      data: createSafeRealtimeToolCallDiagnosticData(toolCall)
    });
    if (commandTraceId) {
      this.realtimeTraceCommandToolCalls.add(commandTraceId);
    }
    void this.options.onFunctionCall?.(toolCall);
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

  private handleToolSelection(call: AssistantToolCall): void {
    const commandTraceId = this.functionCallTraceIds.get(call.id) ?? this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined;
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
    if (typeof selection.confidence === "number" && selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD) {
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

    if (selectedTool.name === "board.add_widget") {
      const addWidgetShortcut = this.createLocalAddWidgetShortcut(call, resolvedConcreteSelection, commandTraceId);
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

    const selectedModule = resolvedSelection.selectedModule ?? this.resolveSelectedModuleForToolSelection(selectedTool, resolvedConcreteSelection);
    this.activeScopedToolSelection = {
      selectedModule,
      targetHint: resolvedConcreteSelection.targetHint,
      userCommand: resolvedSelection.input,
      selectedToolName: selectedTool.name
    };
    const update = createScopedRealtimeToolUpdate(
      {
        input: resolvedSelection.input,
        context: this.currentContext,
        tools: resolvedSelection.scopedTools,
        moduleContext: selectedModule
          ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
              userText: resolvedSelection.input,
              selectedToolHint: selectedTool.name,
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
          selectedTool: selectedTool.name,
          targetHint: resolvedConcreteSelection.targetHint,
          selectedModule,
          intent: resolvedConcreteSelection.intent,
          scopedTools: resolvedSelection.scopedTools.map((tool) => tool.name)
        }
      },
      commandTraceId
    };
    this.sendEvent(update);
    this.emitDiagnostic({
      type: "realtime.tool_selection.success",
      status: "success",
      operationId: call.id,
      toolName: selectedTool.name,
      data: {
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
    const musicQuery = definition.type === "music" && !pureOpenWidget ? extractMusicQueryFromText(input) : "";
    const tvChannelName = definition.type === "tv" ? extractTvChannelNameFromText(input) : "";
    const shouldOpenMissingWidget = Boolean(
      selection.requestedToolName &&
        selection.requestedToolName !== REALTIME_ADD_WIDGET_TOOL_NAME &&
        definition.type &&
        !this.currentContext.widgets.some((widget) => widget.type === definition.type)
    );
    if (!pureOpenWidget && !countdownSeconds && !musicQuery && !tvChannelName && !shouldOpenMissingWidget) {
      return null;
    }
    const argumentsWithOptionalFollowUp: Record<string, unknown> = { definitionId: definition.definitionId };
    if (countdownSeconds) {
      argumentsWithOptionalFollowUp.followUp = {
        name: "countdown.set",
        arguments: { totalSeconds: countdownSeconds, start: true }
      };
    } else if (definition.type === "music" && musicQuery) {
      const wantsSearchOnly = /搜|搜索|找|不一定播放|先别播|先不要播/.test(input);
      argumentsWithOptionalFollowUp.followUp = {
        name: wantsSearchOnly ? "music.search" : "music.play",
        arguments: { query: musicQuery }
      };
    } else if (definition.type === "tv") {
      if (tvChannelName) {
        argumentsWithOptionalFollowUp.followUp = {
          name: "tv.play",
          arguments: { channelName: tvChannelName }
        };
      }
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
    try {
      parsed = typeof data === "string" ? (JSON.parse(data) as RealtimeEvent) : isRecord(data) ? data : null;
    } catch {
      handleRealtimeFunctionCallEvent(data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
      return;
    }
    if (parsed) {
      const eventType = typeof parsed.type === "string" ? parsed.type : "unknown";
      const commandTraceId = this.prepareRealtimeEventTrace(parsed);
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
    handleRealtimeFunctionCallEvent(parsed ?? data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
  }

  private handleRealtimeLifecycleEvent(event: RealtimeEvent, commandTraceId?: string): void {
    const previousActiveResponseId = this.activeResponseId;
    this.activeResponseId = reduceRealtimeActiveResponseId(this.activeResponseId, event);
    if (previousActiveResponseId && !this.activeResponseId && this.pendingResponseCreateAfterActiveToolResult) {
      this.pendingResponseCreateAfterActiveToolResult = false;
      this.emitDiagnostic({ type: "realtime.response.create_after_tool_result", status: "sent" });
      this.sendEvent(createRealtimeResponseCreateEvent(this.connectMode === "audio" ? "voice" : "text"), { queueWhenClosed: false });
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
      }
      return;
    }
    if (event.type === "error") {
      const message = extractRealtimeEventErrorMessage(event);
      if (isIgnorableRealtimeCancelRace(message)) {
        this.emitDiagnostic({ type: "realtime.event.error", status: "ignored", message, commandTraceId });
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
      this.handleUnhandledRealtimeUserTranscript(commandTraceId);
      this.realtimeTraceCommandToolCalls.delete(commandTraceId);
      this.realtimeTraceUserTranscripts.delete(commandTraceId);
    }
    this.clearFinishedRealtimeEventTrace(event);
  }

  private handleUnhandledRealtimeUserTranscript(commandTraceId: string): void {
    if (this.realtimeTraceCommandToolCalls.has(commandTraceId) || !this.options.onUnhandledUserTranscript) return;
    const transcript = this.realtimeTraceUserTranscripts.get(commandTraceId);
    if (!transcript?.input) return;
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
    const commandTraceId = this.activeRealtimeResponseTraceId ?? createRealtimeVoiceCommandTraceId(responseId);
    this.realtimeResponseTraceIds.set(responseId, commandTraceId);
    return commandTraceId;
  }

  private getOrCreateRealtimeItemTraceId(itemId: string): string {
    const existing = this.realtimeItemTraceIds.get(itemId);
    if (existing) return existing;
    const commandTraceId = this.activeRealtimeResponseTraceId ?? createRealtimeVoiceCommandTraceId(itemId);
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
    this.activeRealtimeResponseTraceId = null;
    this.realtimeResponseTraceIds.clear();
    this.realtimeItemTraceIds.clear();
    this.functionCallTraceIds.clear();
    this.realtimeTraceCommandToolCalls.clear();
    this.realtimeTraceUserTranscripts.clear();
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
