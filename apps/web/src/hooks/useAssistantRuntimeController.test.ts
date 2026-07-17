import { describe, expect, it } from "vitest";
import { shouldClearRealtimeTurnState } from "./useAssistantRuntimeController";

describe("useAssistantRuntimeController", () => {
  it("clears the previous realtime turn when disconnecting or starting a new connection", () => {
    expect(shouldClearRealtimeTurnState("disconnected")).toBe(true);
    expect(shouldClearRealtimeTurnState("connecting")).toBe(true);
  });

  it("keeps the current turn while the same realtime connection is active", () => {
    expect(shouldClearRealtimeTurnState("configuring")).toBe(false);
    expect(shouldClearRealtimeTurnState("connected")).toBe(false);
    expect(shouldClearRealtimeTurnState("failed")).toBe(false);
    expect(shouldClearRealtimeTurnState("session_failed")).toBe(false);
    expect(shouldClearRealtimeTurnState("microphone_denied")).toBe(false);
    expect(shouldClearRealtimeTurnState("microphone_unavailable")).toBe(false);
  });
});
