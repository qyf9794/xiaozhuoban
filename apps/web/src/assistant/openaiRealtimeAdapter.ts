import type {
  AssistantToolCall,
  AssistantToolResult,
  AssistantToolSpec,
  CompactAssistantContext
} from "@xiaozhuoban/assistant-core";
import type { AssistantRealtimeAdapter } from "./AssistantHarness";
import {
  XIAOZHUOBAN_REALTIME_MODEL,
  createRealtimeContextInstructions,
  decodeRealtimeToolName,
  serializeAssistantToolForRealtime
} from "./realtimeSessionConfig";
import {
  createRealtimeTextToolCallRequestBody,
  parseRealtimeTextToolCallResponse
} from "./realtimeTextToolCall";

export type RealtimeConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed"
  | "microphone_denied"
  | "microphone_unavailable";

export interface OpenAIRealtimeWebRtcAdapterOptions {
  sessionEndpoint?: string;
  textToolCallEndpoint?: string;
  model?: string;
  getSafetyIdentifier?: () => string | undefined;
  onFunctionCall?: (call: AssistantToolCall) => void | Promise<void>;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  fetchImpl?: typeof fetch;
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

export function createRealtimeToolResultEvents(call: AssistantToolCall, result: AssistantToolResult): RealtimeEvent[] {
  return [
    {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.id,
        output: JSON.stringify(result)
      }
    },
    {
      type: "response.create"
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

export function extractRealtimeSessionErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return typeof payload.error === "string" ? payload.error : "";
}

export function createRealtimeSessionRequestBody(safetyIdentifier: string | undefined): string {
  const trimmed = safetyIdentifier?.trim();
  return JSON.stringify(trimmed ? { safetyIdentifier: trimmed } : {});
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
  private handledFunctionCallIds = new Set<string>();
  private connectPromise: Promise<void> | null = null;
  private connectionAttemptId = 0;

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
      const sessionResponse = await fetchImpl(this.options.sessionEndpoint ?? "/api/realtime/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: createRealtimeSessionRequestBody(this.options.getSafetyIdentifier?.())
      });
      if (!sessionResponse.ok) {
        let errorCode = "";
        try {
          errorCode = extractRealtimeSessionErrorCode(await sessionResponse.json());
        } catch {
          // Keep the generic session failure if the endpoint returns a non-JSON error.
        }
        throw new Error(errorCode || "REALTIME_SESSION_FAILED");
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
        if (this.currentContext) {
          void this.updateContext(this.currentContext);
        }
        this.options.onStatusChange?.("connected");
      };
      dataChannel.onmessage = (event) =>
        handleRealtimeFunctionCallEvent(event.data, this.handledFunctionCallIds, (call) => this.handleFunctionCall(call));
      dataChannel.onclose = () => this.options.onStatusChange?.("disconnected");

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
    } catch (error) {
      if (this.isCurrentAttempt(attemptId)) {
        this.closeResources();
        this.options.onStatusChange?.("failed");
        throw error;
      }
    }
  }

  disconnect(): void {
    this.nextConnectionAttempt();
    this.connectPromise = null;
    this.closeResources();
    this.handledFunctionCallIds.clear();
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
  }

  updateTools(tools: AssistantToolSpec[]): void {
    this.currentTools = tools;
    this.sendEvent({
      type: "session.update",
      session: {
        tools: tools.map((tool) => serializeAssistantToolForRealtime(tool)),
        tool_choice: "auto"
      }
    });
  }

  updateContext(context: CompactAssistantContext): void {
    this.currentContext = context;
    this.sendEvent({
      type: "session.update",
      session: {
        instructions: createRealtimeContextInstructions(context)
      }
    });
  }

  sendToolResult(call: AssistantToolCall, result: AssistantToolResult): void {
    createRealtimeToolResultEvents(call, result).forEach((event) => this.sendEvent(event, { queueWhenClosed: false }));
  }

  async requestToolCall(
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ): Promise<AssistantToolCall | null> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(this.options.textToolCallEndpoint ?? "/api/realtime/tool-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createRealtimeTextToolCallRequestBody(input, context, tools)
    });
    if (!response.ok) return null;
    return parseRealtimeTextToolCallResponse(await response.json());
  }

  private handleFunctionCall(call: AssistantToolCall): void {
    void this.options.onFunctionCall?.(call);
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
}
