import { describe, expect, it } from "vitest";
import { WidgetAssistantRegistry, createPassthroughSchema, createStrictObjectSchema } from "@xiaozhuoban/assistant-core";
import {
  OpenAIRealtimeWebRtcAdapter,
  closeRealtimeConnectionResources,
  createRealtimeSessionRequestBody,
  createRealtimeTextCommandEvents,
  createRealtimeToolResultEvents,
  extractRealtimeSessionErrorCode,
  extractRealtimeSessionErrorMessage,
  extractRealtimeEventErrorMessage,
  getMicrophonePermissionState,
  handleRealtimeFunctionCallEvent,
  isCurrentRealtimeConnectAttempt,
  parseRealtimeFunctionCallEvent,
  reduceRealtimeActiveResponseId,
  resolveRealtimeConnectFailureStatus,
  resolveMicrophoneAccessErrorCode,
  resolveRealtimeMicrophoneLevel,
  resolveRealtimePeerStatus,
  shouldQueueRealtimeEventWhenClosed,
  shouldHandleRealtimeFunctionCall,
  shouldReuseRealtimeConnect
} from "./openaiRealtimeAdapter";

describe("OpenAI realtime adapter helpers", () => {
  it("normalizes microphone samples into a bounded voice level", () => {
    expect(resolveRealtimeMicrophoneLevel(new Uint8Array([128, 128, 128, 128]))).toBe(0);
    expect(resolveRealtimeMicrophoneLevel(new Uint8Array([0, 255, 0, 255]))).toBe(1);
    expect(resolveRealtimeMicrophoneLevel(new Uint8Array([118, 138, 118, 138]))).toBeGreaterThan(0);
    expect(resolveRealtimeMicrophoneLevel(new Uint8Array())).toBe(0);
  });

  it("combines microphone and remote speech levels without one source clearing the other", () => {
    const levels: number[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onMicrophoneLevel(level) {
        levels.push(level);
      }
    });
    const levelControls = adapter as unknown as {
      setRealtimeAudioLevel: (kind: "microphone" | "remote", level: number) => void;
      stopMicrophoneLevelMonitor: () => void;
      stopRemoteAudioLevelMonitor: () => void;
    };

    levelControls.setRealtimeAudioLevel("microphone", 0.32);
    levelControls.setRealtimeAudioLevel("remote", 0.68);
    levelControls.stopMicrophoneLevelMonitor();
    levelControls.stopRemoteAudioLevelMonitor();

    expect(levels).toEqual([0.32, 0.68, 0.68, 0]);
  });

  it("parses response.function_call_arguments.done events", () => {
    const call = parseRealtimeFunctionCallEvent({
      type: "response.function_call_arguments.done",
      call_id: "call_1",
      name: "weather__dot__set_city",
      arguments: "{\"city\":\"上海\"}"
    });

    expect(call).toEqual({
      id: "call_1",
      name: "weather.set_city",
      arguments: { city: "上海" },
      source: "realtime"
    });
  });

  it("parses response.output_item.done function call events", () => {
    const call = parseRealtimeFunctionCallEvent(
      JSON.stringify({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "call_2",
          name: "countdown__dot__set",
          arguments: "{\"totalSeconds\":600,\"start\":true}"
        }
      })
    );

    expect(call).toMatchObject({
      id: "call_2",
      name: "countdown.set",
      arguments: { totalSeconds: 600, start: true }
    });
  });

  it("deduplicates repeated realtime function call events by call id", () => {
    const handled = new Set<string>();
    const first = parseRealtimeFunctionCallEvent({
      type: "response.function_call_arguments.done",
      call_id: "call_1",
      name: "widget__dot__focus",
      arguments: "{\"widgetId\":\"wi_tv\"}"
    });
    const duplicate = parseRealtimeFunctionCallEvent({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_1",
        name: "widget__dot__focus",
        arguments: "{\"widgetId\":\"wi_tv\"}"
      }
    });
    const next = parseRealtimeFunctionCallEvent({
      type: "response.function_call_arguments.done",
      call_id: "call_2",
      name: "widget__dot__focus",
      arguments: "{\"widgetId\":\"wi_music\"}"
    });

    expect(shouldHandleRealtimeFunctionCall(first, handled)).toBe(true);
    expect(shouldHandleRealtimeFunctionCall(duplicate, handled)).toBe(false);
    expect(shouldHandleRealtimeFunctionCall(next, handled)).toBe(true);
  });

  it("dispatches back-to-back realtime function calls without dropping distinct call ids", () => {
    const handled = new Set<string>();
    const calls: string[] = [];
    const first = {
      type: "response.function_call_arguments.done",
      call_id: "call_1",
      name: "board__dot__add_widget",
      arguments: "{\"definitionId\":\"wd_note\"}"
    };
    const duplicate = {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_1",
        name: "board__dot__add_widget",
        arguments: "{\"definitionId\":\"wd_note\"}"
      }
    };
    const next = {
      type: "response.function_call_arguments.done",
      call_id: "call_2",
      name: "weather__dot__set_city",
      arguments: "{\"city\":\"北京\"}"
    };

    const recordCall = (call: { id: string; name: string }) => {
      calls.push(`${call.id}:${call.name}`);
    };

    handleRealtimeFunctionCallEvent(first, handled, recordCall);
    handleRealtimeFunctionCallEvent(duplicate, handled, recordCall);
    handleRealtimeFunctionCallEvent("not-json", handled, recordCall);
    handleRealtimeFunctionCallEvent(next, handled, recordCall);

    expect(calls).toEqual(["call_1:board.add_widget", "call_2:weather.set_city"]);
  });

  it("creates function call output and response events", () => {
    const events = createRealtimeToolResultEvents(
      { id: "call_1", name: "board.auto_align", arguments: {}, source: "realtime" },
      { status: "success", message: "已整理" }
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: "call_1" }
    });
    expect(events[1]).toEqual({ type: "response.create", response: { output_modalities: ["text"] } });
  });

  it("creates audio response events for voice realtime tool results", () => {
    const events = createRealtimeToolResultEvents(
      { id: "call_1", name: "widget.remove", arguments: { widgetId: "wi_worldClock" }, source: "realtime" },
      { status: "success", message: "已关闭" },
      { responseMode: "voice" }
    );

    expect(events[1]).toEqual({ type: "response.create", response: { output_modalities: ["audio", "text"] } });
  });

  it("creates realtime text command events with text-only response output", () => {
    expect(createRealtimeTextCommandEvents("打开表盘时钟")).toEqual([
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "打开表盘时钟" }]
        }
      },
      {
        type: "response.create",
        response: { output_modalities: ["text"] }
      }
    ]);
  });

  it("cancels an active response before sending a new realtime text command", () => {
    const diagnostics: Array<{
      type: string;
      status?: string;
      operationId?: string;
      commandTraceId?: string;
      data?: { eventType?: string; toolCount?: number };
    }> = [];
    const sent: unknown[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });
    Object.assign(
      adapter as unknown as {
        sessionReady: boolean;
        activeResponseId: string;
        dataChannel: { readyState: string; send: (payload: string) => void };
      },
      {
        sessionReady: true,
        activeResponseId: "resp_active_1",
        dataChannel: {
          readyState: "open",
          send(payload: string) {
            sent.push(JSON.parse(payload) as unknown);
          }
        }
      }
    );

    adapter.sendTextCommand("来个周杰伦经典", { commandTraceId: "trace_text_2" });

    expect(sent).toEqual([
      { type: "response.cancel" },
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          type: "realtime",
          tools: expect.arrayContaining([expect.objectContaining({ name: "assistant__dot__select_tool" })]),
          tool_choice: "auto"
        })
      })
    ]);

    (adapter as unknown as { handleRealtimeEventData: (event: unknown) => void }).handleRealtimeEventData({ type: "session.updated" });

    expect(sent).toEqual([
      { type: "response.cancel" },
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          type: "realtime",
          tools: expect.arrayContaining([expect.objectContaining({ name: "assistant__dot__select_tool" })]),
          tool_choice: "auto"
        })
      }),
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "来个周杰伦经典" }]
        }
      },
      {
        type: "response.create",
        response: { output_modalities: ["text"] }
      }
    ]);
    expect((adapter as unknown as { activeResponseId: string | null }).activeResponseId).toBeNull();
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.response.cancel_before_text_command",
        status: "sent",
        operationId: "resp_active_1",
        commandTraceId: "trace_text_2"
      }),
      expect.objectContaining({ type: "realtime.event.send", commandTraceId: "trace_text_2", data: { eventType: "response.cancel" } }),
      expect.objectContaining({
        type: "realtime.text_command.reset_selector",
        status: "sent",
        commandTraceId: "trace_text_2",
        data: { toolCount: expect.any(Number) }
      }),
      expect.objectContaining({ type: "realtime.event.send", commandTraceId: "trace_text_2", data: { eventType: "session.update" } }),
      expect.objectContaining({ type: "realtime.text_command.send", status: "pending_session_update", commandTraceId: "trace_text_2" }),
      expect.objectContaining({ type: "realtime.text_command.send", status: "started", commandTraceId: "trace_text_2" })
    ]));
  });

  it("does not trust client-side safety identifiers in session requests", () => {
    expect(JSON.parse(createRealtimeSessionRequestBody(" user_123 "))).toEqual({});
    expect(JSON.parse(createRealtimeSessionRequestBody("   "))).toEqual({});
    expect(JSON.parse(createRealtimeSessionRequestBody(undefined))).toEqual({});
  });

  it("does not create a new response while another response is active", () => {
    const events = createRealtimeToolResultEvents(
      { id: "call_1", name: "board.auto_align", arguments: {}, source: "realtime" },
      { status: "success", message: "已整理" },
      { activeResponseId: "resp_1" }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: "call_1" }
    });
  });

  it("continues realtime after active response finishes with a pending tool result", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    const sent: unknown[] = [];
    (adapter as unknown as { dataChannel: { readyState: string; send: (payload: string) => void }; activeResponseId: string }).dataChannel = {
      readyState: "open",
      send(payload: string) {
        sent.push(JSON.parse(payload) as unknown);
      }
    };
    (adapter as unknown as { activeResponseId: string }).activeResponseId = "resp_1";

    adapter.sendToolResult(
      { id: "call_1", name: "assistant.select_tool", arguments: {}, source: "realtime" },
      { status: "success", message: "已选择工具" }
    );
    expect(sent).toHaveLength(1);

    (
      adapter as unknown as {
        handleRealtimeLifecycleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeLifecycleEvent({ type: "response.done", response: { id: "resp_1" } });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ type: "response.create", response: { output_modalities: ["text"] } });
  });

  it("continues voice realtime with audio after active tool response finishes", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    const sent: unknown[] = [];
    Object.assign(
      adapter as unknown as {
        dataChannel: { readyState: string; send: (payload: string) => void };
        activeResponseId: string;
        connectMode: "audio";
      },
      {
        activeResponseId: "resp_voice_1",
        connectMode: "audio",
        dataChannel: {
          readyState: "open",
          send(payload: string) {
            sent.push(JSON.parse(payload) as unknown);
          }
        }
      }
    );

    adapter.sendToolResult(
      { id: "call_voice_1", name: "assistant.select_tool", arguments: {}, source: "realtime" },
      { status: "success", message: "已选择工具" }
    );
    expect(sent).toHaveLength(1);

    (
      adapter as unknown as {
        handleRealtimeLifecycleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeLifecycleEvent({ type: "response.done", response: { id: "resp_voice_1" } });

    expect(sent[1]).toEqual({ type: "response.create", response: { output_modalities: ["audio", "text"] } });
  });

  it("tracks active realtime responses through lifecycle events", () => {
    const active = reduceRealtimeActiveResponseId(null, { type: "response.created", response: { id: "resp_1" } });

    expect(active).toBe("resp_1");
    expect(reduceRealtimeActiveResponseId(active, { type: "response.done", response: { id: "resp_other" } })).toBe("resp_1");
    expect(reduceRealtimeActiveResponseId(active, { type: "response.cancelled", response: { id: "resp_1" } })).toBeNull();
  });

  it("closes realtime resources and stops local media tracks", () => {
    const calls: string[] = [];
    const dataChannel = {
      onclose: () => calls.push("dataChannel.onclose"),
      close() {
        calls.push("dataChannel.close");
        this.onclose?.();
      }
    };

    closeRealtimeConnectionResources({
      dataChannel,
      peerConnection: { close: () => calls.push("peerConnection.close") },
      mediaStream: {
        getTracks: () => [
          { stop: () => calls.push("track.one.stop") },
          { stop: () => calls.push("track.two.stop") }
        ]
      }
    });

    expect(calls).toEqual(["dataChannel.close", "peerConnection.close", "track.one.stop", "track.two.stop"]);
    expect(dataChannel.onclose).toBeNull();
  });

  it("maps peer connection terminal states to realtime statuses", () => {
    expect(resolveRealtimePeerStatus("connected")).toBeNull();
    expect(resolveRealtimePeerStatus("connecting")).toBeNull();
    expect(resolveRealtimePeerStatus("failed")).toBe("failed");
    expect(resolveRealtimePeerStatus("disconnected")).toBe("disconnected");
    expect(resolveRealtimePeerStatus("closed")).toBe("disconnected");
  });

  it("reuses active realtime connect attempts", () => {
    expect(shouldReuseRealtimeConnect(true)).toBe(true);
    expect(shouldReuseRealtimeConnect(false, "connecting")).toBe(true);
    expect(shouldReuseRealtimeConnect(false, "open")).toBe(true);
    expect(shouldReuseRealtimeConnect(false, "closing")).toBe(false);
    expect(shouldReuseRealtimeConnect(false, "closed")).toBe(false);
    expect(shouldReuseRealtimeConnect(false)).toBe(false);
  });

  it("identifies stale realtime connect attempts", () => {
    expect(isCurrentRealtimeConnectAttempt(3, 3)).toBe(true);
    expect(isCurrentRealtimeConnectAttempt(4, 3)).toBe(false);
  });

  it("queues only reusable realtime session updates while disconnected", () => {
    expect(shouldQueueRealtimeEventWhenClosed({ type: "session.update", session: {} })).toBe(true);
    expect(shouldQueueRealtimeEventWhenClosed({ type: "conversation.item.create", item: {} })).toBe(false);
    expect(shouldQueueRealtimeEventWhenClosed({ type: "response.create" })).toBe(false);
  });

  it("reads microphone permission state when the browser exposes it", async () => {
    await expect(
      getMicrophonePermissionState({
        permissions: {
          query: async () => ({ state: "denied" })
        }
      })
    ).resolves.toBe("denied");
    await expect(getMicrophonePermissionState({})).resolves.toBe("unsupported");
    await expect(
      getMicrophonePermissionState({
        permissions: {
          query: async () => {
            throw new Error("permission query failed");
          }
        }
      })
    ).resolves.toBe("error");
  });

  it("connects realtime in text-only mode without touching microphone permission or capture", async () => {
    const originalPeerConnection = globalThis.RTCPeerConnection;
    const originalNavigator = globalThis.navigator;
    let getUserMediaCalled = false;
    const sentEvents: unknown[] = [];
    const diagnostics: Array<{ type: string; status?: string; data?: Record<string, unknown> }> = [];
    const statuses: string[] = [];
    const transceivers: Array<{ kind: string; init?: RTCRtpTransceiverInit }> = [];

    class MockDataChannel {
      readyState = "open";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;

      send(payload: string) {
        const event = JSON.parse(payload) as { type?: string };
        sentEvents.push(event);
        if (event.type === "session.update") {
          queueMicrotask(() => {
            this.onmessage?.({ data: JSON.stringify({ type: "session.updated", session: { type: "realtime" } }) });
          });
        }
      }

      close() {
        this.onclose?.();
      }
    }

    class MockPeerConnection {
      connectionState = "connected";
      iceConnectionState = "connected";
      onconnectionstatechange: (() => void) | null = null;
      oniceconnectionstatechange: (() => void) | null = null;
      ontrack: ((event: { streams: unknown[] }) => void) | null = null;
      channel: MockDataChannel | null = null;

      createDataChannel() {
        this.channel = new MockDataChannel();
        return this.channel;
      }

      addTrack() {
        throw new Error("text-only realtime should not add audio tracks");
      }

      addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
        transceivers.push({ kind, init });
      }

      async createOffer() {
        return { sdp: "offer-sdp" };
      }

      async setLocalDescription() {}

      async setRemoteDescription() {
        this.channel?.onopen?.();
      }

      close() {}
    }

    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockPeerConnection
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        permissions: {
          query: async () => {
            throw new Error("text-only realtime should not query microphone permission");
          }
        },
        mediaDevices: {
          getUserMedia: async () => {
            getUserMediaCalled = true;
            throw new Error("text-only realtime should not capture microphone");
          }
        }
      }
    });

    try {
      const adapter = new OpenAIRealtimeWebRtcAdapter({
        getAccessToken: () => "supabase-token",
        onStatusChange: (status) => statuses.push(status),
        onDiagnostic: (event) => diagnostics.push(event),
        fetchImpl: (async (url) => {
          if (String(url).includes("/api/realtime/session")) {
            return new Response(JSON.stringify({ client_secret: { value: "client-secret" } }), {
              status: 200,
              headers: { "content-type": "application/json" }
            });
          }
          if (String(url).includes("/v1/realtime/calls")) {
            return new Response("answer-sdp", { status: 201, headers: { "content-type": "application/sdp" } });
          }
          throw new Error(`Unexpected URL: ${String(url)}`);
        }) as typeof fetch
      });

      await adapter.connectTextOnly();

      expect(getUserMediaCalled).toBe(false);
      expect(transceivers).toEqual([{ kind: "audio", init: { direction: "recvonly" } }]);
      expect(statuses).toContain("connected");
      expect(diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "realtime.connect.start", data: { mode: "text" } }),
        expect.objectContaining({ type: "realtime.microphone.permission", status: "skipped", data: { mode: "text" } }),
        expect.objectContaining({ type: "realtime.session.updated", status: "connected" })
      ]));
      expect(sentEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "session.update", session: expect.objectContaining({ type: "realtime" }) })
      ]));
    } finally {
      Object.defineProperty(globalThis, "RTCPeerConnection", {
        configurable: true,
        value: originalPeerConnection
      });
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator
      });
    }
  });

  it("keeps remote audio element alive until realtime disconnects", () => {
    const originalAudio = globalThis.Audio;
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    const calls: string[] = [];
    const monitoredStreams: unknown[] = [];
    const attributes = new Map<string, string>();
    const remoteStream = { id: "remote_stream_1" };
    class MockAudio {
      autoplay = false;
      srcObject: unknown = null;

      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      }

      play() {
        calls.push("play");
        return Promise.resolve();
      }

      pause() {
        calls.push("pause");
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: MockAudio
    });
    (adapter as unknown as { startRemoteAudioLevelMonitor: (stream: MediaStream) => void }).startRemoteAudioLevelMonitor = (stream) => {
      monitoredStreams.push(stream);
    };

    try {
      (adapter as unknown as { attachRemoteAudioStream: (stream: MediaStream) => void }).attachRemoteAudioStream(remoteStream as MediaStream);
      const retained = (adapter as unknown as { remoteAudioElement: HTMLAudioElement | null }).remoteAudioElement;
      expect(retained).toMatchObject({ autoplay: true, srcObject: remoteStream });
      expect(attributes.get("playsinline")).toBe("true");
      expect(calls).toContain("play");
      expect(monitoredStreams).toEqual([remoteStream]);

      (adapter as unknown as { closeResources: () => void }).closeResources();
      expect((adapter as unknown as { remoteAudioElement: HTMLAudioElement | null }).remoteAudioElement).toBeNull();
      expect(calls).toContain("pause");
    } finally {
      Object.defineProperty(globalThis, "Audio", {
        configurable: true,
        value: originalAudio
      });
    }
  });

  it("sends text commands over an already configured realtime data channel", () => {
    const sent: unknown[] = [];
    const diagnostics: Array<{ type: string; status?: string; commandTraceId?: string; data?: { eventType?: string; toolCount?: number } }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });
    Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
      sessionReady: true,
      dataChannel: {
        readyState: "open",
        send(payload: string) {
          sent.push(JSON.parse(payload) as unknown);
        }
      }
    });

    adapter.sendTextCommand("播放陈奕迅的十年", { commandTraceId: "trace_text_1" });

    expect(sent).toEqual([
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          type: "realtime",
          tools: expect.arrayContaining([expect.objectContaining({ name: "assistant__dot__select_tool" })]),
          tool_choice: "auto"
        })
      })
    ]);

    (adapter as unknown as { handleRealtimeEventData: (event: unknown) => void }).handleRealtimeEventData({ type: "session.updated" });

    expect(sent).toEqual([
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          type: "realtime",
          tools: expect.arrayContaining([expect.objectContaining({ name: "assistant__dot__select_tool" })]),
          tool_choice: "auto"
        })
      }),
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "播放陈奕迅的十年" }]
        }
      },
      {
        type: "response.create",
        response: { output_modalities: ["text"] }
      }
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.text_command.reset_selector",
        status: "sent",
        commandTraceId: "trace_text_1",
        data: { toolCount: expect.any(Number) }
      }),
      expect.objectContaining({
        type: "realtime.event.send",
        status: "sent",
        commandTraceId: "trace_text_1",
        data: { eventType: "session.update" }
      }),
      expect.objectContaining({ type: "realtime.text_command.send", status: "pending_session_update", commandTraceId: "trace_text_1" }),
      expect.objectContaining({ type: "realtime.text_command.send", status: "started", commandTraceId: "trace_text_1" }),
      expect.objectContaining({
        type: "realtime.event.send",
        status: "sent",
        commandTraceId: "trace_text_1",
        data: { eventType: "conversation.item.create" }
      }),
      expect.objectContaining({
        type: "realtime.event.send",
        status: "sent",
        commandTraceId: "trace_text_1",
        data: { eventType: "response.create" }
      })
    ]));
  });

  it("rejects text commands before realtime session.updated", () => {
    const diagnostics: Array<{ type: string; status?: string; errorCode?: string }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });
    Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
      sessionReady: false,
      dataChannel: {
        readyState: "open",
        send() {}
      }
    });

    expect(() => adapter.sendTextCommand("打开音乐")).toThrow("REALTIME_TEXT_CHANNEL_NOT_READY");
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.text_command.send",
        status: "failed",
        errorCode: "REALTIME_TEXT_CHANNEL_NOT_READY"
      })
    ]));
  });

  it("distinguishes missing microphones from denied microphone access", () => {
    expect(resolveMicrophoneAccessErrorCode(new DOMException("missing", "NotFoundError"))).toBe(
      "MICROPHONE_UNAVAILABLE"
    );
    expect(resolveMicrophoneAccessErrorCode(new DOMException("denied", "NotAllowedError"))).toBe("MICROPHONE_DENIED");
    expect(resolveMicrophoneAccessErrorCode(new Error("unknown"))).toBe("MICROPHONE_DENIED");
  });

  it("extracts server-side realtime session error codes", () => {
    expect(extractRealtimeSessionErrorCode({ error: "OPENAI_API_KEY_MISSING" })).toBe("OPENAI_API_KEY_MISSING");
    expect(
      extractRealtimeSessionErrorCode({
        error: "OPENAI_REALTIME_SESSION_CREATE_FAILED",
        payload: { error: { code: "model_not_found", message: "The model does not exist." } }
      })
    ).toBe("OPENAI_REALTIME_SESSION_CREATE_FAILED");
    expect(extractRealtimeSessionErrorCode({ error: 500 })).toBe("");
    expect(extractRealtimeSessionErrorCode(null)).toBe("");
  });

  it("extracts diagnostic details from nested OpenAI realtime session errors", () => {
    expect(
      extractRealtimeSessionErrorMessage({
        error: "OPENAI_REALTIME_SESSION_CREATE_FAILED",
        status: 400,
        payload: {
          error: {
            type: "invalid_request_error",
            code: "unknown_parameter",
            param: "session.output_modalities",
            message: "Unknown parameter: session.output_modalities."
          }
        }
      })
    ).toBe(
      "OPENAI_REALTIME_SESSION_CREATE_FAILED (status 400 · unknown_parameter: param session.output_modalities: Unknown parameter: session.output_modalities.)"
    );
  });

  it("classifies session creation failures separately from WebRTC channel failures", () => {
    expect(resolveRealtimeConnectFailureStatus(new Error("OPENAI_API_KEY_MISSING"))).toBe("session_failed");
    expect(resolveRealtimeConnectFailureStatus(new Error("AUTH_INVALID"))).toBe("session_failed");
    expect(
      resolveRealtimeConnectFailureStatus(
        new Error(
          "OPENAI_REALTIME_SESSION_CREATE_FAILED (status 400 · unknown_parameter: param session.output_modalities: Unknown parameter: session.output_modalities.)"
        )
      )
    ).toBe("session_failed");
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_CLIENT_SECRET_MISSING"))).toBe("session_failed");
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_SESSION_UPDATE_TIMEOUT"))).toBe("session_failed");
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_CONNECT_TIMEOUT(sdp)"))).toBe("session_failed");
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_SESSION_UPDATE_FAILED (unknown_parameter: Invalid tool schema.)"))).toBe(
      "session_failed"
    );
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_SDP_FAILED"))).toBe("failed");
  });

  it("extracts realtime session.update error event details", () => {
    expect(
      extractRealtimeEventErrorMessage({
        type: "error",
        event_id: "evt_123",
        error: {
          type: "invalid_request_error",
          code: "unknown_parameter",
          param: "session.tools[0].parameters",
          message: "Invalid tool schema."
        }
      })
    ).toBe(
      "REALTIME_SESSION_UPDATE_FAILED (unknown_parameter: param session.tools[0].parameters: Invalid tool schema.: event evt_123)"
    );
    expect(extractRealtimeEventErrorMessage({ type: "error" })).toBe("REALTIME_SESSION_UPDATE_FAILED");
  });

  it("queues session tool updates before the data channel opens", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();

    adapter.updateTools([
      {
        name: "board.auto_align",
        description: "整理桌板",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "desktop"
      }
    ]);

    expect((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents).toHaveLength(1);
    const event = (adapter as unknown as { queuedEvents: Array<{ type: string; session: { type: string; instructions: string; tools: Array<{ name: string }> } }> })
      .queuedEvents[0];
    expect(event.type).toBe("session.update");
    expect(event.session.type).toBe("realtime");
    expect(event.session.instructions).toContain("board.auto_align");
    expect(event.session.tools[0].name).toBe("assistant__dot__select_tool");
  });

  it("adds the active command trace id to adapter diagnostics", () => {
    const diagnostics: Array<{ type: string; commandTraceId?: string }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });

    adapter.setActiveCommandTraceId("trace_adapter_1");
    adapter.updateTools([
      {
        name: "board.auto_align",
        description: "整理桌板",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "desktop"
      }
    ]);
    adapter.setActiveCommandTraceId(null);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.tools.update", commandTraceId: "trace_adapter_1" })
    ]));
  });

  it("groups realtime voice response function calls and tool results under one trace id", () => {
    const diagnostics: Array<{ type: string; commandTraceId?: string; operationId?: string; data?: { eventType?: string } }> = [];
    const calls: Array<{ id: string; name: string }> = [];
    const sent: unknown[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      },
      onFunctionCall(call) {
        calls.push({ id: call.id, name: call.name });
      }
    });
    Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
      sessionReady: true,
      dataChannel: {
        readyState: "open",
        send(payload: string) {
          sent.push(JSON.parse(payload) as unknown);
        }
      }
    });

    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({ type: "response.created", response: { id: "resp_voice_1" } });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_voice_1",
        name: "board__dot__auto_align",
        arguments: "{}"
      }
    });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({ type: "response.done", response: { id: "resp_voice_1" } });
    adapter.sendToolResult(
      { id: "call_voice_1", name: "board.auto_align", arguments: {}, source: "realtime" },
      { status: "success", message: "已整理" }
    );

    const trace = diagnostics.find((event) => event.type === "realtime.event.receive" && event.data?.eventType === "response.created")
      ?.commandTraceId;
    expect(trace).toMatch(/^voice_/);
    expect(calls).toEqual([{ id: "call_voice_1", name: "board.auto_align" }]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.function_call.tool", operationId: "call_voice_1", commandTraceId: trace }),
      expect.objectContaining({ type: "realtime.tool_result.send", operationId: "call_voice_1", commandTraceId: trace }),
      expect.objectContaining({ type: "realtime.event.send", commandTraceId: trace, data: { eventType: "conversation.item.create" } }),
      expect.objectContaining({ type: "realtime.event.send", commandTraceId: trace, data: { eventType: "response.create" } })
    ]));
    expect(sent).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "conversation.item.create" }),
      { type: "response.create", response: { output_modalities: ["text"] } }
    ]));
  });

  it("records safe tool arguments from realtime function calls before handing them to Harness", () => {
    const diagnostics: Array<{ type: string; operationId?: string; toolName?: string; data?: unknown }> = [];
    const calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      },
      onFunctionCall(call) {
        calls.push({ id: call.id, name: call.name, arguments: call.arguments as Record<string, unknown> });
      }
    });
    Object.assign(adapter as unknown as { sessionReady: boolean }, { sessionReady: true });

    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_music_1",
        name: "music__dot__play",
        arguments: JSON.stringify({ widgetId: "wi_music", query: "陈奕迅 十年", kind: "song", apiKey: "secret" })
      }
    });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_weather_1",
        name: "weather__dot__set_city",
        arguments: JSON.stringify({ widgetId: "wi_weather", cityCode: "shanghai", cityName: "上海" })
      }
    });

    expect(calls).toEqual([
      { id: "call_music_1", name: "music.play", arguments: { widgetId: "wi_music", query: "陈奕迅 十年", kind: "song", apiKey: "secret" } },
      { id: "call_weather_1", name: "weather.set_city", arguments: { widgetId: "wi_weather", cityCode: "shanghai", cityName: "上海" } }
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.function_call.tool",
        operationId: "call_music_1",
        toolName: "music.play",
        data: { query: "陈奕迅 十年", kind: "song" }
      }),
      expect.objectContaining({
        type: "realtime.function_call.tool",
        operationId: "call_weather_1",
        toolName: "weather.set_city",
        data: { cityCode: "shanghai", cityName: "上海" }
      })
    ]));
  });

  it("drops undeclared realtime tool arguments before Harness validation", () => {
    const diagnostics: Array<{ type: string; operationId?: string; toolName?: string; data?: unknown }> = [];
    const calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      },
      onFunctionCall(call) {
        calls.push({ id: call.id, name: call.name, arguments: call.arguments as Record<string, unknown> });
      }
    });
    adapter.updateTools([
      {
        name: "music.search",
        description: "搜索音乐",
        parameters: createStrictObjectSchema({
          widgetId: { type: "string", required: true },
          query: { type: "string", required: true },
          kind: { type: "string" }
        }),
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      }
    ]);
    Object.assign(adapter as unknown as { sessionReady: boolean }, { sessionReady: true });

    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_music_extra",
        name: "music__dot__search",
        arguments: JSON.stringify({ widgetId: "wi_music", query: "放松 音乐", play: true, raw: "ignored" })
      }
    });

    expect(calls).toEqual([
      { id: "call_music_extra", name: "music.search", arguments: { widgetId: "wi_music", query: "放松 音乐" } }
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.function_call.arguments_sanitized",
        operationId: "call_music_extra",
        toolName: "music.search",
        data: { removedKeys: ["play", "raw"] }
      }),
      expect.objectContaining({
        type: "realtime.function_call.tool",
        operationId: "call_music_extra",
        toolName: "music.search",
        data: { query: "放松 音乐" }
      })
    ]));
  });

  it("normalizes realtime music artist and song aliases before Harness validation", () => {
    const diagnostics: Array<{ type: string; operationId?: string; toolName?: string; data?: unknown }> = [];
    const calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      },
      onFunctionCall(call) {
        calls.push({ id: call.id, name: call.name, arguments: call.arguments as Record<string, unknown> });
      }
    });
    adapter.updateTools([
      {
        name: "music.play",
        description: "播放音乐",
        parameters: createStrictObjectSchema({
          widgetId: { type: "string", required: true },
          query: { type: "string" },
          kind: { type: "string" },
          resultIndex: { type: "number" }
        }),
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      }
    ]);
    Object.assign(adapter as unknown as { sessionReady: boolean }, { sessionReady: true });

    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_music_alias",
        name: "music__dot__play",
        arguments: JSON.stringify({ widgetId: "wi_music", artist: "陈奕迅", song: "十年", kind: "song" })
      }
    });

    expect(calls).toEqual([
      { id: "call_music_alias", name: "music.play", arguments: { widgetId: "wi_music", query: "陈奕迅 十年", kind: "song" } }
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.function_call.tool",
        operationId: "call_music_alias",
        toolName: "music.play",
        data: { query: "陈奕迅 十年", kind: "song" }
      })
    ]));
  });

  it("records realtime voice speech and transcript diagnostics under the same trace", () => {
    const diagnostics: Array<{ type: string; commandTraceId?: string; status?: string; data?: { eventType?: string; transcript?: string } }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });

    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({ type: "input_audio_buffer.speech_started", item_id: "item_voice_1", audio_start_ms: 120 });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({ type: "input_audio_buffer.speech_stopped", item_id: "item_voice_1", audio_end_ms: 840 });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_voice_1",
      transcript: "在吗"
    });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({ type: "response.created", response: { id: "resp_voice_2" } });
    (
      adapter as unknown as {
        handleRealtimeEventData: (event: Record<string, unknown>) => void;
      }
    ).handleRealtimeEventData({
      type: "response.audio_transcript.done",
      response_id: "resp_voice_2",
      item_id: "item_assistant_1",
      transcript: "我在，有什么需要我帮你处理？"
    });

    const trace = diagnostics.find((event) => event.type === "realtime.voice.speech_started")?.commandTraceId;
    expect(trace).toMatch(/^voice_/);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.voice.speech_started", status: "listening", commandTraceId: trace }),
      expect.objectContaining({ type: "realtime.voice.speech_stopped", status: "committed", commandTraceId: trace }),
      expect.objectContaining({
        type: "realtime.voice.user_transcript",
        status: "success",
        commandTraceId: trace,
        data: expect.objectContaining({ transcript: "在吗" })
      }),
      expect.objectContaining({ type: "realtime.event.receive", commandTraceId: trace, data: { eventType: "response.created" } }),
      expect.objectContaining({
        type: "realtime.voice.assistant_transcript",
        status: "success",
        commandTraceId: trace,
        data: expect.objectContaining({ transcript: "我在，有什么需要我帮你处理？" })
      })
    ]));
  });

  it("falls back to initial selector tools if voice connects before harness initialization finishes", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();

    const tools = (
      adapter as unknown as {
        getEffectiveSessionTools: () => Parameters<OpenAIRealtimeWebRtcAdapter["updateTools"]>[0];
      }
    ).getEffectiveSessionTools();
    adapter.updateTools(tools);

    const event = (adapter as unknown as { queuedEvents: Array<{ session: { type: string; instructions: string; tools: Array<{ name: string; parameters: unknown }> } }> })
      .queuedEvents[0];
    expect(tools.map((tool) => tool.name)).toContain("board.add_widget");
    expect(event.session.type).toBe("realtime");
    expect(event.session.tools[0].name).toBe("assistant__dot__select_tool");
    expect(JSON.stringify(event.session.tools[0].parameters)).toContain("board.add_widget");
    expect(JSON.stringify(event.session.tools[0].parameters)).not.toContain("widgetId");
  });

  it("does not queue stale tool results before the data channel opens", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();

    adapter.sendToolResult(
      { id: "call_1", name: "board.auto_align", arguments: {}, source: "realtime" },
      { status: "success", message: "已整理" }
    );

    expect((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents).toHaveLength(0);
  });

  it("does not send local shortcut results back into the realtime conversation", () => {
    const diagnostics: Array<{ type: string; status?: string; operationId?: string; data?: unknown }> = [];
    const sent: unknown[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });
    Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
      sessionReady: true,
      dataChannel: {
        readyState: "open",
        send(payload: string) {
          sent.push(JSON.parse(payload) as unknown);
        }
      }
    });

    adapter.sendToolResult(
      { id: "shortcut_1", name: "widget.remove", arguments: {}, source: "shortcut" },
      { status: "success", message: "已删除小工具" }
    );

    expect(sent).toEqual([]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.tool_result.skip",
        status: "skipped",
        operationId: "shortcut_1",
        data: { source: "shortcut" }
      })
    ]));
    expect(diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.tool_result.send", operationId: "shortcut_1" })
    ]));
  });

  it("stores compact context locally without sending it to realtime", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    const context = {
      boardId: "board_1",
      boardName: "我的桌板",
      availableDefinitions: [{ definitionId: "wd_music", type: "music", name: "音乐" }],
      widgetCountsByType: { tv: 1 },
      widgets: [
        {
          widgetId: "wi_tv",
          definitionId: "wd_tv",
          type: "tv",
          name: "电视",
          order: 1,
          summary: "CCTV1"
        }
      ]
    };

    adapter.updateContext(context);

    expect((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents).toEqual([]);
    expect((adapter as unknown as { currentContext: unknown }).currentContext).toMatchObject({ boardName: "我的桌板" });
  });

  it("turns a realtime tool selection into a scoped session update", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    adapter.updateTools([
      {
        name: "widget.remove",
        description: "删除小工具",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "desktop",
        risk: "safe",
        requiresTarget: true
      },
      {
        name: "music.pause",
        description: "暂停音乐",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      }
    ]);
    adapter.updateContext({
      boardId: "board_1",
      boardName: "默认桌板",
      widgetCountsByType: { music: 1, note: 1 },
      widgets: [
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐播放器",
          order: 1,
          summary: "正在播放"
        },
        {
          widgetId: "wi_note",
          definitionId: "wd_note",
          type: "note",
          name: "便签",
          order: 2,
          summary: "private note"
        }
      ]
    });
    (adapter as unknown as { sessionReady: boolean }).sessionReady = true;

    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "select_1",
      name: "assistant.select_tool",
      arguments: { name: "widget.remove", targetHint: "音乐", userCommand: "关闭音乐", confidence: 0.9 },
      source: "realtime"
    });

    const serialized = JSON.stringify((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents);
    expect(serialized).toContain("assistant__dot__select_tool");
    expect(serialized).toContain("widget__dot__remove");
    expect(serialized).toContain("semantic_vad");
    expect(serialized).toContain("gpt-4o-mini-transcribe");
    expect(serialized).toContain("wi_music");
    expect(serialized).not.toContain("music__dot__pause");
    expect(serialized).not.toContain("private note");
  });

  it("infers module context for generic widget removal when selectedModule is omitted", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();
    const registry = new WidgetAssistantRegistry();
    registry.register({
      type: "worldClock",
      definition: { id: "worldClock", type: "worldClock", name: "世界时钟" },
      aliases: ["世界时钟"],
      shortcuts: [],
      tools: [],
      context: {
        getScopedContext: ({ compactContext }) => ({
          moduleType: "worldClock",
          tools: [],
          toolSchemas: {},
          instances: (compactContext?.widgets ?? []).filter((widget) => widget.type === "worldClock"),
          stateSummary: { instanceCount: compactContext?.widgetCountsByType?.worldClock ?? 0 },
          shortcutExamples: ["关闭世界时钟"],
          executionPolicy: { defaultMode: "latest-wins" },
          riskPolicy: { safe: ["widget.remove"], confirm: [], destructive: [] }
        })
      },
      realtime: {
        exposeCatalog: () => ({
          type: "worldClock",
          displayName: "世界时钟",
          aliases: ["世界时钟"],
          capabilities: ["关闭窗口"],
          shortcutExamples: ["关闭世界时钟"],
          riskSummary: []
        }),
        getScopedContext: ({ compactContext }) => ({
          moduleType: "worldClock",
          tools: [],
          toolSchemas: {},
          instances: (compactContext?.widgets ?? []).filter((widget) => widget.type === "worldClock"),
          stateSummary: { instanceCount: compactContext?.widgetCountsByType?.worldClock ?? 0 },
          shortcutExamples: ["关闭世界时钟"],
          executionPolicy: { defaultMode: "latest-wins" },
          riskPolicy: { safe: ["widget.remove"], confirm: [], destructive: [] }
        })
      },
      executionPolicy: { defaultMode: "latest-wins" }
    });
    adapter.updateModules(registry);
    adapter.updateTools([
      {
        name: "widget.remove",
        description: "删除小工具",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "desktop",
        risk: "safe",
        requiresTarget: true
      }
    ]);
    adapter.updateContext({
      boardId: "board_1",
      boardName: "默认桌板",
      widgetCountsByType: { worldClock: 1, note: 1 },
      widgets: [
        {
          widgetId: "wi_world",
          definitionId: "wd_worldClock",
          type: "worldClock",
          name: "世界时钟",
          order: 1,
          summary: "北京 伦敦 纽约"
        },
        {
          widgetId: "wi_note",
          definitionId: "wd_note",
          type: "note",
          name: "便签",
          order: 2,
          summary: "private note"
        }
      ]
    });
    (adapter as unknown as { sessionReady: boolean }).sessionReady = true;

    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "select_world_clock",
      name: "assistant.select_tool",
      arguments: { name: "widget.remove", targetHint: "世界时钟", userCommand: "关闭世界时钟", confidence: 0.94 },
      source: "realtime"
    });

    const serialized = JSON.stringify((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents);
    expect(serialized).toContain("Selected Module Scoped Context");
    expect(serialized).toContain("worldClock");
    expect(serialized).toContain("wi_world");
    expect(serialized).toContain("widget__dot__remove");
    expect(serialized).not.toContain("private note");
  });

  it("waits for scoped session.updated before sending tool selection results", () => {
    const sent: unknown[] = [];
    const diagnostics: Array<{ type: string; status?: string; operationId?: string; toolName?: string }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    });
    adapter.updateTools([
      {
        name: "music.search",
        description: "搜索音乐",
        parameters: createStrictObjectSchema({
          widgetId: { type: "string", required: true },
          query: { type: "string", required: true }
        }),
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      }
    ]);
    adapter.updateContext({
      boardId: "board_1",
      boardName: "默认桌板",
      widgetCountsByType: { music: 1 },
      widgets: [
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐播放器",
          order: 1,
          summary: "idle"
        }
      ]
    });
    Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
      sessionReady: true,
      dataChannel: {
        readyState: "open",
        send(payload: string) {
          sent.push(JSON.parse(payload) as unknown);
        }
      }
    });

    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "select_music",
      name: "assistant.select_tool",
      arguments: { name: "music.search", selectedModule: "music", targetHint: "放松", userCommand: "我想听点放松的不一定播放", confidence: 0.92 },
      source: "realtime"
    });

    expect(sent).toEqual([
      expect.objectContaining({ type: "session.update" })
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.tool_selection.result_deferred",
        status: "pending_session_update",
        operationId: "select_music",
        toolName: "music.search"
      })
    ]));

    (adapter as unknown as { handleRealtimeEventData: (event: unknown) => void }).handleRealtimeEventData({ type: "session.updated" });

    expect(sent).toEqual([
      expect.objectContaining({ type: "session.update" }),
      expect.objectContaining({
        type: "conversation.item.create",
        item: expect.objectContaining({ type: "function_call_output", call_id: "select_music" })
      }),
      { type: "response.create", response: { output_modalities: ["text"] } }
    ]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.tool_selection.result_send_after_session_update",
        status: "sent",
        operationId: "select_music",
        toolName: "assistant.select_tool"
      })
    ]));
  });

  it("does not process realtime function calls before session.updated", () => {
    const calls: unknown[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onFunctionCall: (call) => {
        calls.push(call);
      }
    });

    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "call_1",
      name: "widget.focus",
      arguments: { widgetId: "wi_music" },
      source: "realtime"
    });

    expect(calls).toEqual([]);
  });

  it("binds live realtime window tool calls from the prior tool selection", () => {
    const calls: unknown[] = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      onFunctionCall: (call) => {
        calls.push(call);
      }
    });
    adapter.updateTools([
      {
        name: "widget.remove",
        description: "删除小工具",
        parameters: createPassthroughSchema<Record<string, unknown>>(),
        scope: "desktop",
        risk: "safe",
        requiresTarget: true
      }
    ]);
    adapter.updateContext({
      boardId: "board_1",
      boardName: "默认桌板",
      widgetCountsByType: { dialClock: 1, worldClock: 1 },
      widgets: [
        { widgetId: "wi_dialClock", definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟", order: 1, summary: "" },
        { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 2, summary: "" }
      ]
    });
    (adapter as unknown as { sessionReady: boolean }).sessionReady = true;

    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "select_world_clock",
      name: "assistant.select_tool",
      arguments: { name: "widget.remove", selectedModule: "worldClock", targetHint: "世界时钟", userCommand: "关闭世界时钟", confidence: 0.95 },
      source: "realtime"
    });
    (adapter as unknown as { handleFunctionCall: (call: unknown) => void }).handleFunctionCall({
      id: "call_close_world_clock",
      name: "widget.remove",
      arguments: {},
      source: "realtime"
    });

    expect(calls).toEqual([
      expect.objectContaining({
        name: "widget.remove",
        arguments: { widgetId: "wi_worldClock" }
      })
    ]);
  });

  it("requests text fallback tool calls from the scoped backend endpoint", async () => {
    const requests: Array<{ url: string; body: unknown; headers?: HeadersInit }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      getAccessToken: () => "supabase-token",
      fetchImpl: (async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers });
        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              call: null,
              selection: { name: "widget.remove", targetHint: "音乐", confidence: 0.9 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            call: {
              id: "model_1",
              name: "widget.remove",
              arguments: { widgetId: "wi_music" },
              source: "text"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });
    const moduleRegistry = new WidgetAssistantRegistry();
    moduleRegistry.register({
      type: "music",
      definition: { id: "wd_music", type: "music", name: "音乐" },
      aliases: ["音乐"],
      shortcuts: [{ id: "music.close", intent: "close", examples: ["关闭音乐"], risk: "safe" }],
      tools: [
        {
          spec: {
            name: "widget.remove",
            description: "删除小工具",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop",
            risk: "safe",
            requiresTarget: true
          },
          execute: () => ({ status: "success", message: "ok" })
        }
      ],
      context: {
        getScopedContext: () => ({
          moduleType: "music",
          tools: [],
          toolSchemas: {},
          instances: [],
          stateSummary: { instanceCount: 1 },
          shortcutExamples: ["关闭音乐"],
          executionPolicy: { defaultMode: "sequential" },
          riskPolicy: { safe: ["widget.remove"], confirm: [], destructive: [] }
        })
      },
      realtime: {
        exposeCatalog: () => ({
          type: "music",
          displayName: "音乐",
          aliases: ["音乐"],
          capabilities: ["关闭窗口"],
          shortcutExamples: ["关闭音乐"],
          riskSummary: []
        }),
        getScopedContext: () => ({
          moduleType: "music",
          tools: [],
          toolSchemas: {},
          instances: [],
          stateSummary: { instanceCount: 1 },
          shortcutExamples: ["关闭音乐"],
          executionPolicy: { defaultMode: "sequential" },
          riskPolicy: { safe: ["widget.remove"], confirm: [], destructive: [] }
        })
      },
      executionPolicy: { defaultMode: "sequential" }
    });
    adapter.updateModules(moduleRegistry);

    const call = await adapter.requestToolCall(
      "关音乐",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { music: 1 },
        widgets: [
          {
            widgetId: "wi_music",
            definitionId: "wd_music",
            type: "music",
            name: "音乐播放器",
            order: 1,
            summary: "正在播放"
          },
          {
            widgetId: "wi_note",
            definitionId: "wd_note",
            type: "note",
            name: "便签",
            order: 2,
            summary: "private note"
          }
        ]
      },
      [
        {
          name: "widget.remove",
          description: "删除小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop",
          risk: "safe",
          requiresTarget: true
        }
      ]
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("/api/realtime/tool-call");
    expect(requests[0]?.headers).toMatchObject({ authorization: "Bearer supabase-token" });
    expect(requests[0]?.body).toMatchObject({ input: "关音乐", phase: "select" });
    expect(JSON.stringify(requests[0]?.body)).toContain("moduleCatalog");
    expect(JSON.stringify(requests[0]?.body)).toContain("小工具窗口");
    expect(JSON.stringify(requests[0]?.body)).toContain("widget.remove");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("context");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("wi_music");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("private note");
    expect(requests[1]?.url).toBe("/api/realtime/tool-call");
    expect(requests[1]?.headers).toMatchObject({ authorization: "Bearer supabase-token" });
    expect(requests[1]?.body).toMatchObject({
      input: "关音乐",
      phase: "execute",
      selection: { name: "widget.remove", targetHint: "音乐", confidence: 0.9 }
    });
    expect(JSON.stringify(requests[1]?.body)).toContain("moduleContext");
    expect(JSON.stringify(requests[1]?.body)).toContain("instanceCount");
    expect(JSON.stringify(requests[1]?.body)).toContain("wi_music");
    expect(JSON.stringify(requests[1]?.body)).not.toContain("wi_note");
    expect(JSON.stringify(requests[1]?.body)).not.toContain("private note");
    expect(call).toEqual({
      id: "model_1",
      name: "widget.remove",
      arguments: { widgetId: "wi_music" },
      source: "text"
    });
  });

  it("binds text fallback window tool calls when the scoped backend omits widgetId", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "select") {
          return new Response(
            JSON.stringify({
              selection: { name: "widget.remove", selectedModule: "worldClock", targetHint: "世界时钟", confidence: 0.95 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            call: {
              id: "model_close_world_clock",
              name: "widget.remove",
              arguments: {},
              source: "text"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const call = await adapter.requestToolCall(
      "关闭世界时钟",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { dialClock: 1, worldClock: 1 },
        widgets: [
          { widgetId: "wi_dialClock", definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟", order: 1, summary: "" },
          { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 2, summary: "" }
        ]
      },
      [
        {
          name: "widget.remove",
          description: "删除小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop",
          risk: "safe",
          requiresTarget: true
        }
      ]
    );

    expect(call).toMatchObject({
      name: "widget.remove",
      arguments: { widgetId: "wi_worldClock" }
    });
  });

  it.each([
    ["note", "便签"],
    ["todo", "待办"],
    ["tv", "电视"],
    ["music", "音乐"],
    ["weather", "天气"],
    ["countdown", "倒计时"],
    ["headline", "新闻"],
    ["market", "行情"],
    ["calculator", "计算器"],
    ["translate", "翻译"],
    ["converter", "换算"],
    ["clipboard", "剪贴板"],
    ["recorder", "录音机"],
    ["messageBoard", "留言板"],
    ["dialClock", "表盘时钟"],
    ["worldClock", "世界时钟"]
  ])("binds text fallback window tool calls for %s", async (type, name) => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "select") {
          return new Response(
            JSON.stringify({
              selection: { name: "widget.remove", selectedModule: type, targetHint: name, confidence: 0.95 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            call: {
              id: `model_close_${type}`,
              name: "widget.remove",
              arguments: {},
              source: "text"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const call = await adapter.requestToolCall(
      `关闭${name}`,
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { [type]: 1 },
        widgets: [
          type === "dialClock"
            ? { widgetId: "wi_decoy", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 1, summary: "" }
            : { widgetId: "wi_decoy", definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟", order: 1, summary: "" },
          { widgetId: `wi_${type}`, definitionId: `wd_${type}`, type, name, order: 2, summary: "" }
        ]
      },
      [
        {
          name: "widget.remove",
          description: "删除小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop",
          risk: "safe",
          requiresTarget: true
        }
      ]
    );

    expect(call).toMatchObject({
      name: "widget.remove",
      arguments: { widgetId: `wi_${type}` }
    });
  });

  it("requests realtime command plans in two stages with module scoped context", async () => {
    const requests: Array<{ url: string; body: unknown; headers?: HeadersInit }> = [];
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      getAccessToken: () => "supabase-token",
      fetchImpl: (async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers });
        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              planSelection: {
                steps: [
                  { id: "step_music", name: "music.play", selectedModule: "music", targetHint: "周杰伦", connector: "start", confidence: 0.86 },
                  { id: "step_weather", name: "weather.set_city", selectedModule: "weather", targetHint: "北京天气", connector: "parallel", confidence: 0.84 }
                ]
              }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            plan: {
              id: "plan_model",
              sourceText: "打开音乐，同时查北京天气",
              normalizedText: "打开音乐 同时查北京天气",
              commands: [
                {
                  id: "cmd_music",
                  module: "music",
                  tool: "music.play",
                  args: { widgetId: "wi_music", query: "周杰伦" },
                  risk: "safe",
                  confidence: 0.86,
                  source: "text",
                  requiresHarnessValidation: true
                },
                {
                  id: "cmd_weather",
                  module: "weather",
                  tool: "weather.set_city",
                  args: { widgetId: "wi_weather", city: "北京" },
                  risk: "safe",
                  confidence: 0.84,
                  source: "text",
                  requiresHarnessValidation: true
                }
              ],
              dependencies: [],
              executionGroups: [{ id: "group_1", mode: "parallel", commandIds: ["cmd_music", "cmd_weather"] }],
              confidence: 0.84,
              needsConfirmation: false,
              createdBy: "text-llm",
              requiresHarnessValidation: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });
    const moduleRegistry = new WidgetAssistantRegistry();
    for (const type of ["music", "weather"]) {
      moduleRegistry.register({
        type,
        definition: { id: `wd_${type}`, type, name: type },
        aliases: [type],
        shortcuts: [],
        tools: [],
        context: {
          getScopedContext: () => ({
            moduleType: type,
            tools: [],
            toolSchemas: {},
            instances: [],
            stateSummary: { instanceCount: 1 },
            shortcutExamples: [],
            executionPolicy: { defaultMode: type === "weather" ? "latest-wins" : "parallel" },
            riskPolicy: { safe: [], confirm: [], destructive: [] }
          })
        },
        realtime: {
          exposeCatalog: () => ({
            type,
            displayName: type,
            aliases: [type],
            capabilities: [],
            shortcutExamples: [],
            riskSummary: []
          }),
          getScopedContext: () => ({
            moduleType: type,
            tools: [],
            toolSchemas: {},
            instances: [],
            stateSummary: { instanceCount: 1 },
            shortcutExamples: [],
            executionPolicy: { defaultMode: type === "weather" ? "latest-wins" : "parallel" },
            riskPolicy: { safe: [], confirm: [], destructive: [] }
          })
        },
        executionPolicy: { defaultMode: "parallel" }
      });
    }
    adapter.updateModules(moduleRegistry);

    const plan = await adapter.requestCommandPlan(
      "打开音乐，同时查北京天气",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { music: 1, weather: 1, note: 1 },
        widgets: [
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 1, summary: "idle" },
          { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 2, summary: "上海" },
          { widgetId: "wi_note", definitionId: "wd_note", type: "note", name: "便签", order: 3, summary: "private note" }
        ]
      },
      [
        {
          name: "music.play",
          description: "播放音乐",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "widget-detail",
          widgetType: "music",
          requiresTarget: true
        },
        {
          name: "weather.set_city",
          description: "设置天气城市",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "widget-detail",
          widgetType: "weather",
          requiresTarget: true
        }
      ]
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toMatchObject({ input: "打开音乐，同时查北京天气", phase: "plan_select" });
    expect(JSON.stringify(requests[0]?.body)).not.toContain("context");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("wi_music");
    expect(requests[1]?.body).toMatchObject({ input: "打开音乐，同时查北京天气", phase: "plan_execute" });
    expect(JSON.stringify(requests[1]?.body)).toContain("moduleContexts");
    expect(JSON.stringify(requests[1]?.body)).toContain("music");
    expect(JSON.stringify(requests[1]?.body)).toContain("weather");
    expect(plan?.executionGroups[0]).toMatchObject({ mode: "parallel", commandIds: ["cmd_music", "cmd_weather"] });
  });

  it("normalizes realtime command plan aliases before harness validation", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "plan_select") {
          return new Response(
            JSON.stringify({
              planSelection: {
                steps: [{ id: "music.play", name: "music.play", selectedModule: "music", targetHint: "播放王菲的红豆", confidence: 1 }]
              }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            plan: {
              id: "plan_music_aliases",
              sourceText: "播放王菲的红豆",
              normalizedText: "播放王菲的红豆",
              commands: [
                {
                  id: "cmd_add_music",
                  module: "board",
                  tool: "board.add_widget",
                  args: { boardId: "board_1", type: "music" },
                  risk: "safe",
                  confidence: 0.75,
                  source: "text",
                  requiresHarnessValidation: true
                },
                {
                  id: "cmd_search_music",
                  module: "music",
                  tool: "music.search",
                  args: { keyword: "王菲 红豆", boardId: "board_1", notAutoPlay: true },
                  risk: "safe",
                  confidence: 0.75,
                  source: "text",
                  requiresHarnessValidation: true
                },
                {
                  id: "cmd_play_music",
                  module: "music",
                  tool: "music.play",
                  args: { artist: "王菲", song: "红豆" },
                  risk: "safe",
                  confidence: 0.75,
                  source: "text",
                  requiresHarnessValidation: true
                }
              ],
              executionGroups: [{ id: "group_1", mode: "parallel", commandIds: ["cmd_add_music", "cmd_search_music", "cmd_play_music"] }],
              dependencies: [],
              confidence: 0.95,
              needsConfirmation: false,
              createdBy: "text-llm",
              requiresHarnessValidation: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const plan = await adapter.requestCommandPlan(
      "播放王菲的红豆",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        availableDefinitions: [{ definitionId: "wd_music", type: "music", name: "音乐" }],
        widgetCountsByType: {},
        widgets: []
      },
      [
        {
          name: "board.add_widget",
          description: "添加小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop"
        },
        {
          name: "music.search",
          description: "搜索音乐",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "widget-detail",
          widgetType: "music",
          requiresTarget: true
        },
        {
          name: "music.play",
          description: "播放音乐",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "widget-detail",
          widgetType: "music",
          requiresTarget: true
        }
      ]
    );

    expect(plan?.commands.map((command) => command.args)).toEqual([
      { definitionId: "wd_music" },
      { query: "王菲 红豆", widgetId: "planned_widget_music" },
      { query: "王菲 红豆", widgetId: "planned_widget_music" }
    ]);
    expect(plan?.commands[1]?.dependsOn).toEqual(["cmd_add_music"]);
    expect(plan?.commands[2]?.dependsOn).toEqual(["cmd_add_music"]);
    expect(plan?.executionGroups[0]).toMatchObject({ mode: "sequential" });
  });

  it("binds realtime window remove plans to the mentioned widget instance", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "plan_select") {
          return new Response(
            JSON.stringify({
              planSelection: {
                steps: [{ id: "widget.remove", name: "widget.remove", selectedModule: "worldClock", targetHint: "世界时钟", confidence: 0.96 }]
              }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            plan: {
              id: "plan_close_world_clock",
              sourceText: "关闭世界时钟",
              normalizedText: "关闭世界时钟",
              commands: [
                {
                  id: "cmd_close_world_clock",
                  module: "widget",
                  tool: "widget.remove",
                  args: { targetText: "世界时钟窗口" },
                  risk: "safe",
                  confidence: 0.92,
                  source: "text",
                  requiresHarnessValidation: true
                }
              ],
              executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_close_world_clock"] }],
              dependencies: [],
              confidence: 0.92,
              needsConfirmation: false,
              createdBy: "text-llm",
              requiresHarnessValidation: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const plan = await adapter.requestCommandPlan(
      "关闭世界时钟",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { dialClock: 1, worldClock: 1, note: 1 },
        widgets: [
          { widgetId: "wi_dialClock", definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟", order: 1, summary: "" },
          { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 2, summary: "北京 伦敦" },
          { widgetId: "wi_note", definitionId: "wd_note", type: "note", name: "便签", order: 3, summary: "private note" }
        ]
      },
      [
        {
          name: "widget.remove",
          description: "删除小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop",
          risk: "safe",
          requiresTarget: true
        }
      ]
    );

    expect(plan?.commands[0]).toMatchObject({
      tool: "widget.remove",
      args: { targetText: "世界时钟窗口", widgetId: "wi_worldClock" }
    });
  });

  it("binds multiple realtime window plan steps from selected modules", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "plan_select") {
          return new Response(
            JSON.stringify({
              planSelection: {
                steps: [
                  { id: "cmd_close_message_board", name: "widget.remove", selectedModule: "messageBoard", targetHint: "留言板", connector: "start", confidence: 0.96 },
                  { id: "cmd_close_world_clock", name: "widget.remove", selectedModule: "worldClock", targetHint: "世界时钟", connector: "parallel", confidence: 0.96 }
                ]
              }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            plan: {
              id: "plan_close_two_windows",
              sourceText: "关闭留言板和世界时钟",
              normalizedText: "关闭留言板和世界时钟",
              commands: [
                {
                  id: "cmd_close_message_board",
                  module: "widget",
                  tool: "widget.remove",
                  args: {},
                  risk: "safe",
                  confidence: 0.92,
                  source: "text",
                  requiresHarnessValidation: true
                },
                {
                  id: "cmd_close_world_clock",
                  module: "widget",
                  tool: "widget.remove",
                  args: {},
                  risk: "safe",
                  confidence: 0.92,
                  source: "text",
                  requiresHarnessValidation: true
                }
              ],
              executionGroups: [{ id: "group_1", mode: "parallel", commandIds: ["cmd_close_message_board", "cmd_close_world_clock"] }],
              dependencies: [],
              confidence: 0.92,
              needsConfirmation: false,
              createdBy: "text-llm",
              requiresHarnessValidation: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const plan = await adapter.requestCommandPlan(
      "关闭留言板和世界时钟",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { dialClock: 1, messageBoard: 1, worldClock: 1 },
        widgets: [
          { widgetId: "wi_dialClock", definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟", order: 1, summary: "" },
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 2, summary: "" },
          { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 3, summary: "" }
        ]
      },
      [
        {
          name: "widget.remove",
          description: "删除小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop",
          risk: "safe",
          requiresTarget: true
        }
      ]
    );

    expect(plan?.commands.map((command) => command.args)).toEqual([
      { widgetId: "wi_messageBoard" },
      { widgetId: "wi_worldClock" }
    ]);
  });

  it("inserts a widget add command when realtime omits a required target instance", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.phase === "plan_select") {
          return new Response(
            JSON.stringify({
              planSelection: {
                steps: [{ id: "music.play", name: "music.play", selectedModule: "music", targetHint: "播放王菲的红豆", confidence: 1 }]
              }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            plan: {
              id: "plan_music_without_instance",
              sourceText: "播放王菲的红豆",
              normalizedText: "播放王菲的红豆",
              commands: [
                {
                  id: "cmd_play_music",
                  module: "music",
                  tool: "music.play",
                  args: { keyword: "王菲 红豆" },
                  risk: "safe",
                  confidence: 0.88,
                  source: "text",
                  requiresHarnessValidation: true
                }
              ],
              executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_play_music"] }],
              dependencies: [],
              confidence: 0.88,
              needsConfirmation: false,
              createdBy: "text-llm",
              requiresHarnessValidation: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch
    });

    const plan = await adapter.requestCommandPlan(
      "播放王菲的红豆",
      {
        boardId: "board_1",
        boardName: "默认桌板",
        availableDefinitions: [{ definitionId: "wd_music", type: "music", name: "音乐" }],
        widgetCountsByType: {},
        widgets: []
      },
      [
        {
          name: "board.add_widget",
          description: "添加小工具",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "desktop"
        },
        {
          name: "music.play",
          description: "播放音乐",
          parameters: createPassthroughSchema<Record<string, unknown>>(),
          scope: "widget-detail",
          widgetType: "music",
          requiresTarget: true
        }
      ]
    );

    expect(plan?.commands.map((command) => ({ id: command.id, tool: command.tool, args: command.args, dependsOn: command.dependsOn }))).toEqual([
      { id: "cmd_add_music", tool: "board.add_widget", args: { definitionId: "wd_music" }, dependsOn: undefined },
      { id: "cmd_play_music", tool: "music.play", args: { query: "王菲 红豆", widgetId: "planned_widget_music" }, dependsOn: ["cmd_add_music"] }
    ]);
    expect(plan?.executionGroups[0]).toMatchObject({ mode: "sequential", commandIds: ["cmd_add_music", "cmd_play_music"] });
  });

  it("surfaces realtime command plan endpoint errors instead of silently falling back to clarification", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      getAccessToken: () => "supabase-token",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "OPENAI_API_KEY_MISSING" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        })) as typeof fetch
    });

    await expect(
      adapter.requestCommandPlan(
        "开始工作",
        { boardId: "board_1", boardName: "默认桌板", widgetCountsByType: {}, widgets: [] },
        [
          {
            name: "board.add_widget",
            description: "添加小工具",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop"
          }
        ]
      )
    ).rejects.toThrow("OPENAI_API_KEY_MISSING");
  });

  it("surfaces realtime tool-call endpoint errors instead of returning null", async () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter({
      textToolCallEndpoint: "/api/realtime/tool-call",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })) as typeof fetch
    });

    await expect(
      adapter.requestToolCall(
        "把音乐收了",
        { boardId: "board_1", boardName: "默认桌板", widgetCountsByType: {}, widgets: [] },
        [
          {
            name: "widget.remove",
            description: "删除小工具",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop"
          }
        ]
      )
    ).rejects.toThrow("AUTH_REQUIRED");
  });
});
