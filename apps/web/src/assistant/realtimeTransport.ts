export type RealtimeTransportEvent = Record<string, unknown>;
export type RealtimeTransportFunctionCall = {
  id?: string;
  type: "function_call";
  callId: string;
  name: string;
  arguments: string;
  responseId: string;
};

export type RealtimeTransportDiagnostic =
  | { type: "sdp_timeout" }
  | { type: "sdp_failed"; status: number; message: string };

export interface RealtimeTransportConnectOptions {
  clientSecret: string;
  model: string;
  mediaStream: MediaStream;
  timeoutMs: number;
  audioElement?: HTMLAudioElement;
  shouldContinue?: () => boolean;
  onOpen: () => void;
  onMessage: (data: unknown) => void;
  onClose: () => void;
  onPeerStateChange: (state: string) => void;
  onTrack: (event: RTCTrackEvent) => void;
  onDiagnostic?: (event: RealtimeTransportDiagnostic) => void;
}

export interface RealtimeTransport {
  readonly readyState: string;
  readonly handlesAudioPlayback: boolean;
  readonly handlesInterrupt: boolean;
  readonly handlesFunctionCallOutput: boolean;
  readonly handlesMessageSend: boolean;
  readonly handlesResponseSequencing: boolean;
  readonly dataChannel: RTCDataChannel | null;
  readonly peerConnection: RTCPeerConnection | null;
  connect(options: RealtimeTransportConnectOptions): Promise<void>;
  sendEvent(event: RealtimeTransportEvent): void;
  requestResponse(response?: Record<string, unknown>): void;
  sendMessage(message: string, otherEventData?: Record<string, unknown>): void;
  sendFunctionCallOutput(call: RealtimeTransportFunctionCall, output: string, startResponse: boolean): void;
  interrupt(): void;
  close(): void;
}

async function withTransportTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout();
      reject(new Error("REALTIME_CONNECT_TIMEOUT(sdp)"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type AgentsSdkWebRtcTransport = import("@openai/agents/realtime").OpenAIRealtimeWebRTC;

/**
 * Agents SDK implementation of the same narrow transport contract. Business
 * events still flow through OpenAIRealtimeWebRtcAdapter during this migration
 * step; only WebRTC/DataChannel/SDP/resource ownership moves to the SDK.
 */
export class AgentsSdkRealtimeTransport implements RealtimeTransport {
  readonly handlesAudioPlayback = true;
  readonly handlesInterrupt = true;
  readonly handlesFunctionCallOutput = true;
  readonly handlesMessageSend = true;
  readonly handlesResponseSequencing = true;
  private sdkTransport: AgentsSdkWebRtcTransport | null = null;
  private closeRequested = false;

  get readyState(): string {
    return this.sdkTransport?.connectionState.dataChannel?.readyState ?? "closed";
  }

  get dataChannel(): RTCDataChannel | null {
    return this.sdkTransport?.connectionState.dataChannel ?? null;
  }

  get peerConnection(): RTCPeerConnection | null {
    return this.sdkTransport?.connectionState.peerConnection ?? null;
  }

  async connect(options: RealtimeTransportConnectOptions): Promise<void> {
    this.close();
    this.closeRequested = false;

    const sdk = await import("@openai/agents/realtime");
    let openNotified = false;
    const notifyOpen = () => {
      if (openNotified) return;
      openNotified = true;
      options.onOpen();
    };
    const sdkTransport = new sdk.OpenAIRealtimeWebRTC({
      model: options.model,
      mediaStream: options.mediaStream,
      audioElement: options.audioElement,
      changePeerConnection: (peerConnection) => {
        const sdkTrackHandler = peerConnection.ontrack;
        peerConnection.ontrack = (event) => {
          sdkTrackHandler?.call(peerConnection, event);
          if ((!event.streams || event.streams.length === 0) && options.audioElement) {
            options.audioElement.srcObject = new MediaStream([event.track]);
          }
          options.onTrack(event);
        };
        sdkTransport.connectionState.dataChannel?.addEventListener("open", notifyOpen, { once: true });
        return peerConnection;
      }
    });
    this.sdkTransport = sdkTransport;

    sdkTransport.on("*", (event) => options.onMessage(event));
    sdkTransport.on("connection_change", (status) => {
      if (status === "connecting") {
        options.onPeerStateChange("connecting");
        return;
      }
      if (status === "connected") {
        notifyOpen();
        options.onPeerStateChange("connected");
        return;
      }
      if (!this.closeRequested) {
        options.onPeerStateChange("disconnected");
        options.onClose();
      }
    });

    await withTransportTimeout(
      sdkTransport.connect({
        apiKey: options.clientSecret,
        model: options.model
      }),
      options.timeoutMs,
      () => options.onDiagnostic?.({ type: "sdp_timeout" })
    );
    if (options.shouldContinue && !options.shouldContinue()) {
      this.close();
    }
  }

  sendEvent(event: RealtimeTransportEvent): void {
    this.sdkTransport?.sendEvent(event as never);
  }

  requestResponse(response?: Record<string, unknown>): void {
    this.sdkTransport?.requestResponse(response);
  }

  sendMessage(message: string, otherEventData: Record<string, unknown> = {}): void {
    this.sdkTransport?.sendMessage(message, otherEventData, { triggerResponse: false });
  }

  sendFunctionCallOutput(call: RealtimeTransportFunctionCall, output: string, startResponse: boolean): void {
    this.sdkTransport?.sendFunctionCallOutput(call, output, startResponse);
  }

  interrupt(): void {
    this.sdkTransport?.interrupt();
  }

  close(): void {
    this.closeRequested = true;
    this.sdkTransport?.close();
    this.sdkTransport = null;
  }
}

export function createAgentsSdkRealtimeTransport(): RealtimeTransport {
  return new AgentsSdkRealtimeTransport();
}
