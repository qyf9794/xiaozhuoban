import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenAIRealtimeWebRtcAdapterOptions, RealtimeConnectionStatus } from "./openaiRealtimeAdapter";
import { createRealtimeAssistantRuntime } from "./createRealtimeAssistantRuntime";

function createRuntimeWithFakeAdapter(options: {
  commandWindowIdleMs?: number;
  dialogueIdleMs?: number;
  cooldownMs?: number;
  now?: () => number;
} = {}) {
  let adapterOptions: OpenAIRealtimeWebRtcAdapterOptions | null = null;
  const statuses: RealtimeConnectionStatus[] = [];
  const adapter = {
    connect: vi.fn(async () => {
      adapterOptions?.onStatusChange?.("connected");
    }),
    disconnect: vi.fn(() => {
      adapterOptions?.onStatusChange?.("disconnected");
    }),
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
      maxSingleCommandSessionMs: 60_000,
      maxDialogueSessionMs: 300_000,
      assistantAudioDailyLimitSeconds: 300
    },
    adapterFactory: (nextOptions) => {
      adapterOptions = nextOptions;
      return adapter;
    }
  });
  return { runtime, adapter, statuses };
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
    const { runtime, adapter, statuses } = createRuntimeWithFakeAdapter({ commandWindowIdleMs: 10 });

    await runtime.connectForWake();
    expect(runtime.runtimeController.mode).toBe("realtime_command_window");

    vi.advanceTimersByTime(10);

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.runtimeController.mode).toBe("local_standby");
    expect(statuses).toEqual(["connected", "disconnected"]);
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
});
