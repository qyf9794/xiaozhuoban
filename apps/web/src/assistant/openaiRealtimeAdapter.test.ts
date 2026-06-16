import { describe, expect, it } from "vitest";
import { createPassthroughSchema } from "@xiaozhuoban/assistant-core";
import {
  OpenAIRealtimeWebRtcAdapter,
  closeRealtimeConnectionResources,
  createRealtimeSessionRequestBody,
  createRealtimeToolResultEvents,
  extractRealtimeSessionErrorCode,
  parseRealtimeFunctionCallEvent,
  resolveRealtimePeerStatus,
  shouldHandleRealtimeFunctionCall
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

  it("adds a trimmed safety identifier to session requests when available", () => {
    expect(JSON.parse(createRealtimeSessionRequestBody(" user_123 "))).toEqual({
      safetyIdentifier: "user_123"
    });
    expect(JSON.parse(createRealtimeSessionRequestBody("   "))).toEqual({});
    expect(JSON.parse(createRealtimeSessionRequestBody(undefined))).toEqual({});
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

  it("extracts server-side realtime session error codes", () => {
    expect(extractRealtimeSessionErrorCode({ error: "OPENAI_API_KEY_MISSING" })).toBe("OPENAI_API_KEY_MISSING");
    expect(extractRealtimeSessionErrorCode({ error: 500 })).toBe("");
    expect(extractRealtimeSessionErrorCode(null)).toBe("");
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
    const event = (adapter as unknown as { queuedEvents: Array<{ type: string; session: { tools: Array<{ name: string }> } }> })
      .queuedEvents[0];
    expect(event.type).toBe("session.update");
    expect(event.session.tools[0].name).toBe("board__dot__auto_align");
  });

  it("queues compact context instructions before the data channel opens", () => {
    const adapter = new OpenAIRealtimeWebRtcAdapter();

    adapter.updateContext({
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
    });

    const event = (adapter as unknown as { queuedEvents: Array<{ session: { instructions: string } }> }).queuedEvents[0];
    expect(event.session.instructions).toContain("board: 我的桌板");
    expect(event.session.instructions).toContain("音乐(music) definitionId=wd_music");
  });
});
