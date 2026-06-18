import {
  REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
  type WidgetAssistantRegistry,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext
} from "@xiaozhuoban/assistant-core";
import type { AssistantRealtimeAdapter } from "./AssistantHarness";
import type { AssistantDiagnosticEvent } from "./assistantDiagnostics";
import {
  createInitialRealtimeToolSpecs,
  decodeRealtimeToolName
} from "./realtimeSessionConfig";
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
  parseRealtimeTextToolSelectionResponse
} from "./realtimeTextToolCall";
import { createRealtimeCapabilityCatalog } from "./capabilityCatalog";

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
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
  getSafetyIdentifier?: () => string | undefined;
  onFunctionCall?: (call: AssistantToolCall) => void | Promise<void>;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
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

const PLANNED_WIDGET_PREFIX = "planned_widget_";

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

function normalizeRealtimePlanArguments(
  plan: CommandPlan,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[]
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

    if ((command.tool === "music.search" || command.tool === "music.play") && typeof args.query !== "string") {
      const aliasQuery =
        typeof args.keyword === "string"
          ? args.keyword
          : typeof args.term === "string"
            ? args.term
            : typeof args.search === "string"
              ? args.search
              : "";
      if (aliasQuery) {
        args.query = aliasQuery;
      }
    }
    if (command.tool === "music.search" || command.tool === "music.play") {
      delete args.keyword;
      delete args.term;
      delete args.search;
    }

    if (tool?.scope === "widget-detail" && tool.widgetType && typeof args.widgetId !== "string") {
      const existingWidgetId = firstWidgetByType.get(tool.widgetType);
      args.widgetId = existingWidgetId ?? `${PLANNED_WIDGET_PREFIX}${tool.widgetType}`;
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
  targetHint?: string;
  userCommand?: string;
  confidence?: number;
} | null {
  const parsed = parseArguments(value);
  if (!isRecord(parsed) || typeof parsed.name !== "string") return null;
  return {
    name: parsed.name,
    selectedModule: typeof parsed.selectedModule === "string" ? parsed.selectedModule : undefined,
    targetHint: typeof parsed.targetHint === "string" ? parsed.targetHint : undefined,
    userCommand: typeof parsed.userCommand === "string" ? parsed.userCommand : undefined,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined
  };
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
  return Object.keys(data).length ? data : undefined;
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
  options: { activeResponseId?: string | null } = {}
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
  if (!options.activeResponseId) {
    events.push({ type: "response.create" });
  }
  return events;
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
    {
      type: "response.create",
      response: {
        output_modalities: ["text"]
      }
    }
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

export function createRealtimeSessionRequestBody(safetyIdentifier: string | undefined): string {
  void safetyIdentifier;
  return JSON.stringify({});
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
  private activeRealtimeResponseTraceId: string | null = null;
  private realtimeResponseTraceIds = new Map<string, string>();
  private realtimeItemTraceIds = new Map<string, string>();
  private functionCallTraceIds = new Map<string, string>();

  constructor(private readonly options: OpenAIRealtimeWebRtcAdapterOptions = {}) {}

  private emitDiagnostic(event: AssistantDiagnosticEvent): void {
    this.options.onDiagnostic?.({
      ...event,
      commandTraceId: event.commandTraceId ?? this.activeCommandTraceId ?? this.activeRealtimeResponseTraceId ?? undefined
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
    this.options.onStatusChange?.("connecting");
    this.emitDiagnostic({ type: "realtime.connect.start", status: "connecting", data: { mode } });
    this.handledFunctionCallIds.clear();
    this.sessionReady = false;
    this.activeResponseId = null;
    this.clearRealtimeTraceState();
    this.pendingResponseCreateAfterActiveToolResult = false;

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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    } else {
      this.emitDiagnostic({ type: "realtime.microphone.permission", status: "skipped", data: { mode } });
    }

    try {
      const accessToken = await this.options.getAccessToken?.();
      this.emitDiagnostic({ type: "realtime.session.request", status: accessToken ? "authenticated" : "missing_auth" });
      const connectTimeoutMs = this.options.connectTimeoutMs ?? 15_000;
      const sessionResponse = await withTimeout(
        fetchImpl(this.options.sessionEndpoint ?? "/api/realtime/session", {
          method: "POST",
          headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
          body: createRealtimeSessionRequestBody(this.options.getSafetyIdentifier?.())
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
        if (!remoteStream || typeof Audio === "undefined") return;
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = remoteStream;
      };

      dataChannel.onopen = () => {
        this.options.onStatusChange?.("configuring");
        this.emitDiagnostic({ type: "realtime.data_channel.open", status: "configuring" });
        this.armSessionUpdateTimeout();
        this.flushQueuedEvents();
        void this.updateTools(this.getEffectiveSessionTools());
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
    this.pendingResponseCreateAfterActiveToolResult = false;
    this.clearRealtimeTraceState();
  }

  updateTools(tools: AssistantToolSpec[]): void {
    this.currentTools = tools;
    const capabilityCatalog = createRealtimeCapabilityCatalog(tools, this.moduleRegistry?.getRealtimeCatalog());
    const toolCatalogVersion = capabilityCatalog[0]?.catalogVersion;
    this.emitDiagnostic({
      type: "realtime.tools.update",
      status: "queued_or_sent",
      data: { toolCount: tools.length, tools: tools.map((tool) => tool.name), toolCatalogVersion }
    });
    this.sendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: createRealtimeToolSelectionInstructions(tools, capabilityCatalog),
        tools: [createRealtimeToolSelectionTool(tools)],
        tool_choice: "auto",
        parallel_tool_calls: false
      }
    });
  }

  private getEffectiveSessionTools(): AssistantToolSpec[] {
    return this.currentTools.length > 0 ? this.currentTools : createInitialRealtimeToolSpecs();
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
    this.emitDiagnostic({
      type: "realtime.tool_result.send",
      status: result.status,
      operationId: call.id,
      toolName: call.name,
      message: result.message,
      errorCode: result.errorCode,
      commandTraceId
    });
    createRealtimeToolResultEvents(call, result, { activeResponseId: this.activeResponseId }).forEach((event) =>
      this.sendEvent(event, { queueWhenClosed: false, commandTraceId })
    );
    if (hadActiveResponse) {
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
    this.emitDiagnostic({
      type: "realtime.text_command.send",
      status: "started",
      commandTraceId,
      data: { inputLength: text.length }
    });
    for (const event of createRealtimeTextCommandEvents(text)) {
      this.sendEvent(event, { queueWhenClosed: false, commandTraceId });
    }
  }

  async requestCommandPlan(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<CommandPlan | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.textToolCallEndpoint ?? "/api/realtime/tool-call";
    const accessToken = await this.options.getAccessToken?.();
    const capabilityCatalog = this.createCapabilityCatalog(tools);
    const contextWithVersions = this.attachContextVersions(context, tools);
    this.emitDiagnostic({
      type: "realtime.text_plan.select.request",
      status: "started",
      data: { input, contextVersion: contextWithVersions.contextVersion, toolCatalogVersion: capabilityCatalog[0]?.catalogVersion }
    });
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimePlanSelectionRequestBody(input, tools, capabilityCatalog)
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_PLAN_SELECTION_FAILED");
    }
    const planSelection = parseRealtimeTextPlanSelectionResponse(await selectionResponse.json());
    this.emitDiagnostic({
      type: "realtime.text_plan.select.result",
      status: planSelection?.steps.length ? "success" : "empty",
      data: { input, stepCount: planSelection?.steps.length ?? 0, steps: planSelection?.steps.map((step) => step.name) ?? [] }
    });
    if (!planSelection?.steps.length) return null;
    const moduleContexts = planSelection.steps
      .map((step) => {
        const selectedTool = tools.find((tool) => tool.name === step.name);
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
              tools
            })
          : undefined;
      })
      .filter((moduleContext): moduleContext is NonNullable<typeof moduleContext> => Boolean(moduleContext));
    const planResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeCommandPlanRequestBody(input, contextWithVersions, tools, planSelection, moduleContexts)
    });
    if (!planResponse.ok) {
      throw await readRealtimeEndpointError(planResponse, "REALTIME_PLAN_EXECUTION_FAILED");
    }
    const parsedPlan = parseRealtimeCommandPlanResponse(await planResponse.json());
    const plan = parsedPlan ? normalizeRealtimePlanArguments(parsedPlan, contextWithVersions, tools) : null;
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
    const capabilityCatalog = this.createCapabilityCatalog(tools);
    const contextWithVersions = this.attachContextVersions(context, tools);
    this.emitDiagnostic({
      type: "realtime.text_tool.select.request",
      status: "started",
      data: { input, contextVersion: contextWithVersions.contextVersion, toolCatalogVersion: capabilityCatalog[0]?.catalogVersion }
    });
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeToolSelectionRequestBody(input, tools, capabilityCatalog)
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_TOOL_SELECTION_FAILED");
    }
    const selection = parseRealtimeTextToolSelectionResponse(await selectionResponse.json());
    const selectedTool = selection ? tools.find((tool) => tool.name === selection.name) : undefined;
    this.emitDiagnostic({
      type: "realtime.text_tool.select.result",
      status: selection && selectedTool ? "success" : "empty",
      toolName: selection?.name,
      data: { input, confidence: selection?.confidence, selectedModule: selection?.selectedModule, targetHint: selection?.targetHint }
    });
    if (!selection || !selectedTool) return null;
    if (typeof selection.confidence === "number" && selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD) {
      this.emitDiagnostic({
        type: "realtime.text_tool.select.low_confidence",
        status: "needs_clarification",
        toolName: selection.name,
        data: { input, confidence: selection.confidence }
      });
      return null;
    }

    const scopedContext = createScopedRealtimeContext(contextWithVersions, selectedTool, selection, input);
    const selectedModule =
      selection.selectedModule ??
      selectedTool.widgetType ??
      this.moduleRegistry?.findModuleForTool(selectedTool.name)?.type ??
      selectedTool.name.split(".")[0];
    const moduleContext = selectedModule
      ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
              userText: input,
              selectedToolHint: selectedTool.name,
              compactContext: contextWithVersions,
              tools
            })
      : undefined;
    const toolCallResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeScopedToolCallRequestBody(input, scopedContext, tools, selection, moduleContext ?? undefined)
    });
    if (!toolCallResponse.ok) {
      throw await readRealtimeEndpointError(toolCallResponse, "REALTIME_TOOL_CALL_FAILED");
    }
    const call = parseRealtimeTextToolCallResponse(await toolCallResponse.json());
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
    this.emitDiagnostic({
      type: "realtime.function_call.tool",
      status: "received",
      operationId: call.id,
      toolName: call.name,
      commandTraceId,
      data: createSafeRealtimeToolCallDiagnosticData(call)
    });
    void this.options.onFunctionCall?.(call);
  }

  private handleToolSelection(call: AssistantToolCall): void {
    const selection = parseToolSelectionArguments(call.arguments);
    const selectedTool = selection ? this.currentTools.find((tool) => tool.name === selection.name) : undefined;
    if (!selection || !selectedTool || !this.currentContext) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.failed",
        status: "needs_clarification",
        operationId: call.id,
        toolName: selection?.name,
        errorCode: "TOOL_SELECTION_CONTEXT_MISSING"
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
        toolName: selection.name,
        data: { confidence: selection.confidence, targetHint: selection.targetHint }
      });
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要再确认要操作哪个小工具。",
        errorCode: "TOOL_SELECTION_LOW_CONFIDENCE"
      });
      return;
    }

    const update = createScopedRealtimeToolUpdate(
      {
        input: selection.userCommand || selection.targetHint || selection.name,
        context: this.currentContext,
        tools: this.currentTools,
        moduleContext: selection.selectedModule
          ? this.moduleRegistry?.getScopedContextForModule(selection.selectedModule, {
              userText: selection.userCommand || selection.targetHint || selection.name,
              selectedToolHint: selection.name,
              compactContext: this.currentContext,
              tools: this.currentTools
            }) ?? undefined
          : undefined
      },
      selection
    );
    if (!update) {
      this.emitDiagnostic({
        type: "realtime.tool_selection.failed",
        status: "failed",
        operationId: call.id,
        toolName: selection.name,
        errorCode: "UNKNOWN_SELECTED_TOOL"
      });
      this.sendToolResult(call, {
        status: "failed",
        message: `未知工具：${selection.name}`,
        errorCode: "UNKNOWN_SELECTED_TOOL"
      });
      return;
    }

    this.sendEvent(update);
    this.emitDiagnostic({
      type: "realtime.tool_selection.success",
      status: "success",
      operationId: call.id,
      toolName: selectedTool.name,
      data: { targetHint: selection.targetHint, selectedModule: selection.selectedModule, confidence: selection.confidence }
    });
    this.sendToolResult(call, {
      status: "success",
      message: "已选择工具，正在读取所需上下文。",
      data: {
        selectedTool: selectedTool.name,
        targetHint: selection.targetHint
      }
    });
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

  private flushQueuedEvents(): void {
    const events = this.queuedEvents.splice(0);
    events.forEach((event) => this.sendEvent(event));
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
      this.handleRealtimeLifecycleEvent(parsed);
    }
    handleRealtimeFunctionCallEvent(parsed ?? data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
  }

  private handleRealtimeLifecycleEvent(event: RealtimeEvent): void {
    const previousActiveResponseId = this.activeResponseId;
    this.activeResponseId = reduceRealtimeActiveResponseId(this.activeResponseId, event);
    if (previousActiveResponseId && !this.activeResponseId && this.pendingResponseCreateAfterActiveToolResult) {
      this.pendingResponseCreateAfterActiveToolResult = false;
      this.emitDiagnostic({ type: "realtime.response.create_after_tool_result", status: "sent" });
      this.sendEvent({ type: "response.create" }, { queueWhenClosed: false });
    }
    if (event.type === "session.updated") {
      this.clearSessionUpdateTimeout();
      this.sessionReady = true;
      this.resolveSessionReadyPromise();
      this.emitDiagnostic({ type: "realtime.session.updated", status: "connected" });
      this.options.onStatusChange?.("connected");
      return;
    }
    if (event.type === "error") {
      const message = extractRealtimeEventErrorMessage(event);
      this.emitDiagnostic({ type: "realtime.event.error", status: "failed", message });
      this.failSessionUpdate(message);
    }
    this.clearFinishedRealtimeEventTrace(event);
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
    const itemId = extractRealtimeItemId(event);
    if (itemId) {
      const commandTraceId = this.getOrCreateRealtimeItemTraceId(itemId);
      this.activeRealtimeResponseTraceId = commandTraceId;
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
      this.emitDiagnostic({
        type: "realtime.voice.user_transcript",
        status: "success",
        commandTraceId,
        data: { itemId, transcript: extractRealtimeEventTranscript(event) }
      });
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
    if (eventType === "response.audio_transcript.done") {
      this.emitDiagnostic({
        type: "realtime.voice.assistant_transcript",
        status: "success",
        commandTraceId,
        data: { responseId, itemId, transcript: extractRealtimeEventTranscript(event) }
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

  private clearRealtimeTraceState(): void {
    this.activeRealtimeResponseTraceId = null;
    this.realtimeResponseTraceIds.clear();
    this.realtimeItemTraceIds.clear();
    this.functionCallTraceIds.clear();
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
    this.sessionUpdateTimeout = setTimeout(() => {
      if (this.sessionReady) return;
      this.emitDiagnostic({ type: "realtime.session.update_timeout", status: "failed", errorCode: "REALTIME_SESSION_UPDATE_TIMEOUT" });
      this.failSessionUpdate("REALTIME_SESSION_UPDATE_TIMEOUT");
    }, this.options.sessionUpdateTimeoutMs ?? 4_000);
  }

  private clearSessionUpdateTimeout(): void {
    if (this.sessionUpdateTimeout) {
      clearTimeout(this.sessionUpdateTimeout);
      this.sessionUpdateTimeout = null;
    }
  }
}
