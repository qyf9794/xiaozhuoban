import { describe, expect, it } from "vitest";
import {
  normalizeRealtimeTransportEvent,
  reduceRealtimeActiveResponseId,
  shouldLogRealtimeEventType
} from "./realtimeEventLifecycle";

describe("realtimeEventLifecycle", () => {
  it("normalizes raw data-channel strings and SDK transport objects", () => {
    expect(normalizeRealtimeTransportEvent('{"type":"session.updated"}')).toEqual({ type: "session.updated" });
    expect(normalizeRealtimeTransportEvent({ type: "response.done" })).toEqual({ type: "response.done" });
    expect(normalizeRealtimeTransportEvent("not-json")).toBeNull();
    expect(normalizeRealtimeTransportEvent(null)).toBeNull();
  });

  it("tracks only the response that is currently active", () => {
    const active = reduceRealtimeActiveResponseId(null, { type: "response.created", response: { id: "resp_1" } });
    expect(active).toBe("resp_1");
    expect(reduceRealtimeActiveResponseId(active, { type: "response.done", response: { id: "resp_other" } })).toBe("resp_1");
    expect(reduceRealtimeActiveResponseId(active, { type: "response.cancelled", response: { id: "resp_1" } })).toBeNull();
  });

  it("keeps lifecycle diagnostics while filtering noisy deltas", () => {
    expect(shouldLogRealtimeEventType("session.updated")).toBe(true);
    expect(shouldLogRealtimeEventType("response.function_call_arguments.done")).toBe(true);
    expect(shouldLogRealtimeEventType("response.output_audio.delta")).toBe(false);
  });
});
