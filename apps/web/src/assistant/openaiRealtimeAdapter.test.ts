import { describe, expect, it } from "vitest";
import { createPassthroughSchema } from "@xiaozhuoban/assistant-core";
import {
  OpenAIRealtimeWebRtcAdapter,
  createRealtimeSessionRequestBody,
  createRealtimeToolResultEvents,
  extractRealtimeSessionErrorCode,
  parseRealtimeFunctionCallEvent
} from "./openaiRealtimeAdapter";

describe("OpenAI realtime adapter helpers", () => {
  it("parses response.function_call_arguments.done events", () => {
    const call = parseRealtimeFunctionCallEvent({
      type: "response.function_call_arguments.done",
      call_id: "call_1",
      name: "weather.set_city",
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
          name: "countdown.set",
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
    expect((adapter as unknown as { queuedEvents: Array<{ type: string }> }).queuedEvents[0].type).toBe("session.update");
  });
});
