import { describe, expect, it } from "vitest";
import { WidgetAssistantRegistry, createPassthroughSchema } from "@xiaozhuoban/assistant-core";
import {
  OpenAIRealtimeWebRtcAdapter,
  closeRealtimeConnectionResources,
  createRealtimeSessionRequestBody,
  createRealtimeToolResultEvents,
  extractRealtimeSessionErrorCode,
  extractRealtimeSessionErrorMessage,
  getMicrophonePermissionState,
  handleRealtimeFunctionCallEvent,
  isCurrentRealtimeConnectAttempt,
  parseRealtimeFunctionCallEvent,
  reduceRealtimeActiveResponseId,
  resolveRealtimeConnectFailureStatus,
  resolveMicrophoneAccessErrorCode,
  resolveRealtimePeerStatus,
  shouldQueueRealtimeEventWhenClosed,
  shouldHandleRealtimeFunctionCall,
  shouldReuseRealtimeConnect
} from "./openaiRealtimeAdapter";

describe("OpenAI realtime adapter helpers", () => {
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
    expect(events[1]).toEqual({ type: "response.create" });
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
    expect(resolveRealtimeConnectFailureStatus(new Error("REALTIME_SDP_FAILED"))).toBe("failed");
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
    const event = (adapter as unknown as { queuedEvents: Array<{ type: string; session: { instructions: string; tools: Array<{ name: string }> } }> })
      .queuedEvents[0];
    expect(event.type).toBe("session.update");
    expect(event.session.instructions).toContain("board.auto_align");
    expect(event.session.tools[0].name).toBe("assistant__dot__select_tool");
  });

  it("does not queue stale tool results before the data channel opens", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();

    adapter.sendToolResult(
      { id: "call_1", name: "board.auto_align", arguments: {}, source: "realtime" },
      { status: "success", message: "已整理" }
    );

    expect((adapter as unknown as { queuedEvents: unknown[] }).queuedEvents).toHaveLength(0);
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
    expect(serialized).toContain("wi_music");
    expect(serialized).not.toContain("music__dot__pause");
    expect(serialized).not.toContain("private note");
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
    expect(JSON.stringify(requests[0]?.body)).toContain("关闭窗口");
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
