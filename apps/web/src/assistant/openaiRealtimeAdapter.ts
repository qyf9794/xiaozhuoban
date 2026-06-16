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

export type RealtimeConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed"
  | "microphone_denied";

export interface OpenAIRealtimeWebRtcAdapterOptions {
  sessionEndpoint?: string;
  model?: string;
  getSafetyIdentifier?: () => string | undefined;
  onFunctionCall?: (call: AssistantToolCall) => void | Promise<void>;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  fetchImpl?: typeof fetch;
}

type RealtimeEvent = Record<string, unknown>;
type RealtimeClosableResources = {
  dataChannel?: { close: () => void } | null;
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
  resources.dataChannel?.close();
  resources.peerConnection?.close();
  resources.mediaStream?.getTracks().forEach((track) => track.stop());
}

export class OpenAIRealtimeWebRtcAdapter implements AssistantRealtimeAdapter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private queuedEvents: RealtimeEvent[] = [];
  private currentTools: AssistantToolSpec[] = [];
  private currentContext: CompactAssistantContext | null = null;
  private handledFunctionCallIds = new Set<string>();

  constructor(private readonly options: OpenAIRealtimeWebRtcAdapterOptions = {}) {}

  async connect(): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    this.options.onStatusChange?.("connecting");
    this.handledFunctionCallIds.clear();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.options.onStatusChange?.("microphone_denied");
      throw new Error("MICROPHONE_DENIED");
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

      const peerConnection = new RTCPeerConnection();
      const dataChannel = peerConnection.createDataChannel("openai-realtime-data");
      this.peerConnection = peerConnection;
      this.dataChannel = dataChannel;

      stream.getAudioTracks().forEach((track) => peerConnection.addTrack(track, stream));
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
      dataChannel.onmessage = (event) => {
        try {
          const call = parseRealtimeFunctionCallEvent(event.data);
          if (shouldHandleRealtimeFunctionCall(call, this.handledFunctionCallIds)) {
            void this.options.onFunctionCall?.(call);
          }
        } catch {
          // Ignore malformed Realtime data-channel messages.
        }
      };
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
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (error) {
      this.closeResources();
      this.options.onStatusChange?.("failed");
      throw error;
    }
  }

  disconnect(): void {
    this.closeResources();
    this.handledFunctionCallIds.clear();
    this.options.onStatusChange?.("disconnected");
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
    createRealtimeToolResultEvents(call, result).forEach((event) => this.sendEvent(event));
  }

  private sendEvent(event: RealtimeEvent): void {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(event));
      return;
    }
    this.queuedEvents.push(event);
  }

  private flushQueuedEvents(): void {
    const events = this.queuedEvents.splice(0);
    events.forEach((event) => this.sendEvent(event));
  }
}
