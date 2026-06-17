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
import {
  XIAOZHUOBAN_REALTIME_MODEL,
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
  fetchImpl?: typeof fetch;
  sessionUpdateTimeoutMs?: number;
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

export function reduceRealtimeActiveResponseId(activeResponseId: string | null, event: RealtimeEvent): string | null {
  if (event.type === "response.created") {
    return extractRealtimeResponseId(event) || activeResponseId;
  }
  if (event.type === "response.done" || event.type === "response.cancelled") {
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

  constructor(private readonly options: OpenAIRealtimeWebRtcAdapterOptions = {}) {}

  connect(): Promise<void> {
    if (shouldReuseRealtimeConnect(Boolean(this.connectPromise), this.dataChannel?.readyState)) {
      return this.connectPromise ?? Promise.resolve();
    }
    if (this.dataChannel || this.peerConnection || this.mediaStream) {
      this.closeResources();
    }

    const attemptId = this.nextConnectionAttempt();
    const connectPromise = this.connectInternal(attemptId).finally(() => {
      if (this.connectPromise === connectPromise) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = connectPromise;
    return connectPromise;
  }

  private async connectInternal(attemptId: number): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    this.options.onStatusChange?.("connecting");
    this.handledFunctionCallIds.clear();
    this.sessionReady = false;
    this.activeResponseId = null;

    let stream: MediaStream;
    const permissionState = await getMicrophonePermissionState(navigator);
    if (permissionState === "denied") {
      if (!this.isCurrentAttempt(attemptId)) {
        return;
      }
      this.options.onStatusChange?.("microphone_denied");
      throw new Error("MICROPHONE_DENIED");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (!this.isCurrentAttempt(attemptId)) {
        return;
      }
      this.options.onStatusChange?.("microphone_unavailable");
      throw new Error("MICROPHONE_UNAVAILABLE");
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (!this.isCurrentAttempt(attemptId)) {
        return;
      }
      const errorCode = resolveMicrophoneAccessErrorCode(error);
      this.options.onStatusChange?.(errorCode === "MICROPHONE_UNAVAILABLE" ? "microphone_unavailable" : "microphone_denied");
      throw new Error(errorCode);
    }
    if (!this.isCurrentAttempt(attemptId)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.mediaStream = stream;

    try {
      const accessToken = await this.options.getAccessToken?.();
      const sessionResponse = await fetchImpl(this.options.sessionEndpoint ?? "/api/realtime/session", {
        method: "POST",
        headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
        body: createRealtimeSessionRequestBody(this.options.getSafetyIdentifier?.())
      });
      if (!sessionResponse.ok) {
        let errorMessage = "";
        try {
          errorMessage = extractRealtimeSessionErrorMessage(await sessionResponse.json(), "REALTIME_SESSION_FAILED");
        } catch {
          // Keep the generic session failure if the endpoint returns a non-JSON error.
        }
        throw new Error(errorMessage || "REALTIME_SESSION_FAILED");
      }
      const secret = extractClientSecret(await sessionResponse.json());
      if (!secret) {
        throw new Error("REALTIME_CLIENT_SECRET_MISSING");
      }
      if (!this.isCurrentAttempt(attemptId)) {
        return;
      }

      const peerConnection = new RTCPeerConnection();
      const dataChannel = peerConnection.createDataChannel("openai-realtime-data");
      this.peerConnection = peerConnection;
      this.dataChannel = dataChannel;
      const sessionReadyPromise = this.createSessionReadyPromise();

      stream.getAudioTracks().forEach((track) => peerConnection.addTrack(track, stream));
      const handlePeerStateChange = (state: string) => {
        const status = resolveRealtimePeerStatus(state);
        if (!status) return;
        if (status === "failed") {
          this.closeResources();
        }
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
        this.flushQueuedEvents();
        if (this.currentTools.length > 0) {
          void this.updateTools(this.currentTools);
        }
        this.armSessionUpdateTimeout();
        this.options.onStatusChange?.("configuring");
      };
      dataChannel.onmessage = (event) => this.handleRealtimeEventData(event.data);
      dataChannel.onclose = () => {
        this.clearSessionUpdateTimeout();
        this.sessionReady = false;
        this.options.onStatusChange?.("disconnected");
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const sdpResponse = await fetchImpl(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(this.options.model ?? XIAOZHUOBAN_REALTIME_MODEL)}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/sdp"
          },
          body: offer.sdp ?? ""
        }
      );
      if (!sdpResponse.ok) {
        throw new Error("REALTIME_SDP_FAILED");
      }
      if (!this.isCurrentAttempt(attemptId)) {
        peerConnection.close();
        return;
      }
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      await sessionReadyPromise;
    } catch (error) {
      if (this.isCurrentAttempt(attemptId)) {
        this.closeResources();
        this.options.onStatusChange?.(resolveRealtimeConnectFailureStatus(error));
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
  }

  updateTools(tools: AssistantToolSpec[]): void {
    this.currentTools = tools;
    this.sendEvent({
      type: "session.update",
      session: {
        instructions: createRealtimeToolSelectionInstructions(tools, this.moduleRegistry?.getRealtimeCatalog()),
        tools: [createRealtimeToolSelectionTool(tools)],
        tool_choice: "auto",
        parallel_tool_calls: false
      }
    });
  }

  updateModules(registry: WidgetAssistantRegistry): void {
    this.moduleRegistry = registry;
  }

  updateContext(context: CompactAssistantContext): void {
    this.currentContext = context;
  }

  sendToolResult(call: AssistantToolCall, result: AssistantToolResult): void {
    createRealtimeToolResultEvents(call, result, { activeResponseId: this.activeResponseId }).forEach((event) =>
      this.sendEvent(event, { queueWhenClosed: false })
    );
  }

  async requestCommandPlan(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<CommandPlan | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.textToolCallEndpoint ?? "/api/realtime/tool-call";
    const accessToken = await this.options.getAccessToken?.();
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimePlanSelectionRequestBody(input, tools, this.moduleRegistry?.getRealtimeCatalog())
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_PLAN_SELECTION_FAILED");
    }
    const planSelection = parseRealtimeTextPlanSelectionResponse(await selectionResponse.json());
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
              compactContext: context,
              tools
            })
          : undefined;
      })
      .filter((moduleContext): moduleContext is NonNullable<typeof moduleContext> => Boolean(moduleContext));
    const planResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeCommandPlanRequestBody(input, context, tools, planSelection, moduleContexts)
    });
    if (!planResponse.ok) {
      throw await readRealtimeEndpointError(planResponse, "REALTIME_PLAN_EXECUTION_FAILED");
    }
    return parseRealtimeCommandPlanResponse(await planResponse.json());
  }

  async requestToolCall(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<AssistantToolCall | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.textToolCallEndpoint ?? "/api/realtime/tool-call";
    const accessToken = await this.options.getAccessToken?.();
    const selectionResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeToolSelectionRequestBody(input, tools, this.moduleRegistry?.getRealtimeCatalog())
    });
    if (!selectionResponse.ok) {
      throw await readRealtimeEndpointError(selectionResponse, "REALTIME_TOOL_SELECTION_FAILED");
    }
    const selection = parseRealtimeTextToolSelectionResponse(await selectionResponse.json());
    const selectedTool = selection ? tools.find((tool) => tool.name === selection.name) : undefined;
    if (!selection || !selectedTool) return null;
    if (typeof selection.confidence === "number" && selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD) {
      return null;
    }

    const scopedContext = createScopedRealtimeContext(context, selectedTool, selection, input);
    const selectedModule =
      selection.selectedModule ??
      selectedTool.widgetType ??
      this.moduleRegistry?.findModuleForTool(selectedTool.name)?.type ??
      selectedTool.name.split(".")[0];
    const moduleContext = selectedModule
      ? this.moduleRegistry?.getScopedContextForModule(selectedModule, {
          userText: input,
          selectedToolHint: selectedTool.name,
          compactContext: context,
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
    return parseRealtimeTextToolCallResponse(await toolCallResponse.json());
  }

  private handleFunctionCall(call: AssistantToolCall): void {
    if (!this.sessionReady) {
      return;
    }
    if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME) {
      this.handleToolSelection(call);
      return;
    }
    void this.options.onFunctionCall?.(call);
  }

  private handleToolSelection(call: AssistantToolCall): void {
    const selection = parseToolSelectionArguments(call.arguments);
    const selectedTool = selection ? this.currentTools.find((tool) => tool.name === selection.name) : undefined;
    if (!selection || !selectedTool || !this.currentContext) {
      this.sendToolResult(call, {
        status: "needs_clarification",
        message: "我需要再确认要操作哪个工具或小工具。",
        errorCode: "TOOL_SELECTION_CONTEXT_MISSING"
      });
      return;
    }
    if (typeof selection.confidence === "number" && selection.confidence < REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD) {
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
      this.sendToolResult(call, {
        status: "failed",
        message: `未知工具：${selection.name}`,
        errorCode: "UNKNOWN_SELECTED_TOOL"
      });
      return;
    }

    this.sendEvent(update);
    this.sendToolResult(call, {
      status: "success",
      message: "已选择工具，正在读取所需上下文。",
      data: {
        selectedTool: selectedTool.name,
        targetHint: selection.targetHint
      }
    });
  }

  private sendEvent(event: RealtimeEvent, options: { queueWhenClosed?: boolean } = {}): void {
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
      this.handleRealtimeLifecycleEvent(parsed);
    }
    handleRealtimeFunctionCallEvent(parsed ?? data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
  }

  private handleRealtimeLifecycleEvent(event: RealtimeEvent): void {
    this.activeResponseId = reduceRealtimeActiveResponseId(this.activeResponseId, event);
    if (event.type === "session.updated") {
      this.clearSessionUpdateTimeout();
      this.sessionReady = true;
      this.resolveSessionReadyPromise();
      this.options.onStatusChange?.("connected");
      return;
    }
    if (event.type === "error") {
      this.failSessionUpdate(extractRealtimeEventErrorMessage(event));
    }
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
