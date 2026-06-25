import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenAIRealtimeWebRtcAdapterOptions, RealtimeConnectionStatus } from "./openaiRealtimeAdapter";
import { createRealtimeAssistantRuntime } from "./createRealtimeAssistantRuntime";

function createRuntimeWithFakeAdapter(options: {
  commandWindowIdleMs?: number;
  dialogueIdleMs?: number;
  cooldownMs?: number;
  maxSingleCommandSessionMs?: number;
  maxDialogueSessionMs?: number;
  now?: () => number;
} = {}) {
  let adapterOptions: OpenAIRealtimeWebRtcAdapterOptions | null = null;
  const statuses: RealtimeConnectionStatus[] = [];
  const diagnostics: Array<{ type: string; status?: string; durationMs?: number }> = [];
  const adapter = {
    connect: vi.fn(async () => {
      adapterOptions?.onStatusChange?.("connected");
    }),
    connectTextOnly: vi.fn(async () => {
      adapterOptions?.onStatusChange?.("connected");
    }),
    disconnect: vi.fn(() => {
      adapterOptions?.onStatusChange?.("disconnected");
    }),
    sendTextCommand: vi.fn(),
    updateTools: vi.fn(),
    updateContext: vi.fn(),
    updateModules: vi.fn(),
    sendToolResult: vi.fn(),
    requestToolCall: vi.fn()
  };
  const runtime = createRealtimeAssistantRuntime({
    now: options.now,
    onStatusChange: (status) => statuses.push(status),
    runtimeBudgetConfig: {
      dailyBudgetUsd: 0.01,
      softLimitUsd: 0.005,
      hardLimitUsd: 0.01,
      commandWindowIdleMs: options.commandWindowIdleMs ?? 10,
      dialogueIdleMs: options.dialogueIdleMs ?? 20,
      cooldownMs: options.cooldownMs ?? 5,
      maxSingleCommandSessionMs: options.maxSingleCommandSessionMs ?? 60_000,
      maxDialogueSessionMs: options.maxDialogueSessionMs ?? 300_000,
      assistantAudioDailyLimitSeconds: 300
    },
    adapterOptions: {
      onDiagnostic(event) {
        diagnostics.push(event);
      }
    },
    adapterFactory: (nextOptions) => {
      adapterOptions = nextOptions;
      return adapter;
    }
  });
  return { runtime, adapter, statuses, diagnostics, getAdapterOptions: () => adapterOptions };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRealtimeAssistantRuntime", () => {
  it("can stay in local standby for 24 hours without creating a realtime session", () => {
    const { runtime, adapter } = createRuntimeWithFakeAdapter();

    runtime.runtimeController.standbyElapsed(24 * 60 * 60 * 1000);

    expect(runtime.runtimeController.mode).toBe("local_standby");
    expect(runtime.runtimeController.metrics.realtimeSessionCount).toBe(0);
    expect(runtime.runtimeController.metrics.estimatedCostUsd).toBe(0);
    expect(adapter.connect).not.toHaveBeenCalled();
  });

  it("disconnects automatically when the command window idles out", async () => {
    vi.useFakeTimers();
    const { runtime, adapter, statuses, diagnostics } = createRuntimeWithFakeAdapter({ commandWindowIdleMs: 10 });

    await runtime.connectForWake();
    expect(runtime.runtimeController.mode).toBe("realtime_command_window");

    vi.advanceTimersByTime(10);

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.runtimeController.mode).toBe("local_standby");
    expect(statuses).toEqual(["connected", "disconnected"]);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.runtime.disconnect", status: "idle_timeout" })
    ]));
  });

  it("disconnects dialogue sessions at the max session duration and enters cooldown", async () => {
    vi.useFakeTimers();
    const { runtime, adapter, diagnostics } = createRuntimeWithFakeAdapter({
      dialogueIdleMs: 60_000,
      maxDialogueSessionMs: 25
    });

    await runtime.connect();
    expect(runtime.runtimeController.mode).toBe("realtime_dialogue_window");

    vi.advanceTimersByTime(25);

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.runtimeController.mode).toBe("realtime_cooldown");
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.runtime.max_session_elapsed", status: "max_session_timeout", durationMs: 25 }),
      expect.objectContaining({ type: "realtime.runtime.disconnect", status: "max_session_timeout" })
    ]));
  });

  it("returns to local standby after a manual disconnect", async () => {
    const { runtime, adapter, diagnostics } = createRuntimeWithFakeAdapter();

    await runtime.connect();
    runtime.disconnect();

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.runtimeController.mode).toBe("local_standby");
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.runtime.disconnect", status: "manual" })
    ]));
  });

  it("blocks automatic realtime at the hard limit but allows manual continuation", async () => {
    const { runtime, adapter } = createRuntimeWithFakeAdapter();

    runtime.runtimeController.recordRealtimeUsage({ userAudioSeconds: 40 });
    await expect(runtime.connectForWake()).rejects.toThrow("daily_hard_limit_reached");
    expect(adapter.connect).not.toHaveBeenCalled();

    await runtime.connect();

    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(runtime.runtimeController.mode).toBe("realtime_dialogue_window");
  });

  it("can connect a text-only realtime session without calling the audio connect path", async () => {
    const { runtime, adapter, statuses } = createRuntimeWithFakeAdapter();

    await runtime.connectTextOnly();

    expect(adapter.connectTextOnly).toHaveBeenCalledTimes(1);
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(runtime.runtimeController.mode).toBe("realtime_dialogue_window");
    expect(statuses).toEqual(["connected"]);
  });

  it("opens text-only realtime before sending a text command", async () => {
    const { runtime, adapter } = createRuntimeWithFakeAdapter();

    await runtime.sendRealtimeTextCommand("打开表盘时钟", { commandTraceId: "trace_text_1" });

    expect(adapter.connectTextOnly).toHaveBeenCalledTimes(1);
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(adapter.sendTextCommand).toHaveBeenCalledWith("打开表盘时钟", { commandTraceId: "trace_text_1" });
  });

  it("records local hits and model fallbacks without adding realtime cost", () => {
    const { runtime } = createRuntimeWithFakeAdapter();

    runtime.recordCommandRoute("shortcut");
    runtime.recordCommandRoute("learned");
    runtime.recordCommandRoute("model");

    expect(runtime.runtimeController.metrics).toMatchObject({
      localHitCount: 2,
      fallbackCount: 1,
      realtimeSessionCount: 0,
      estimatedCostUsd: 0
    });
  });

  it("routes unified realtime command tool calls through the realtime harness path", async () => {
    const { runtime, getAdapterOptions, diagnostics } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput").mockResolvedValue({
      route: "shortcut",
      call: { id: "call_close", name: "widget.remove", arguments: { targetText: "所有窗口" }, source: "shortcut" },
      result: { status: "success", message: "已关闭所有窗口" }
    });

    const result = await getAdapterOptions()?.onCommand?.("关闭所有窗口", { callId: "call_realtime_command_1", commandTraceId: "voice_1" });

    expect(result).toEqual({ status: "success", message: "已关闭所有窗口" });
    expect(handleRealtimeUserInput).toHaveBeenCalledWith("关闭所有窗口", { commandTraceId: "voice_1" });
    expect(runtime.runtimeController.metrics.localHitCount).toBe(1);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.runtime.command_tool_result",
        status: "success",
        commandTraceId: "voice_1",
        route: "shortcut"
      })
    ]));
  });

  it("does not expose voice transcript execution routing from the runtime", async () => {
    const { runtime, getAdapterOptions } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput");

    expect(getAdapterOptions()?.onUserTranscript).toBeUndefined();
    expect(handleRealtimeUserInput).not.toHaveBeenCalled();
  });
});
