import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandPlan } from "@xiaozhuoban/assistant-core";
import type { OpenAIRealtimeWebRtcAdapterOptions, RealtimeConnectionStatus } from "./openaiRealtimeAdapter";
import { createRealtimeAssistantRuntime, shouldFallbackUnhandledVoiceTranscriptToHarness } from "./createRealtimeAssistantRuntime";

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

  it("falls back to the classic WebRTC adapter when the Agents voice adapter fails to connect", async () => {
    const diagnostics: Array<{ type: string; status?: string; message?: string }> = [];
    const failingAgentsAdapter = {
      connect: vi.fn(async () => {
        throw new Error("SDK_CONNECT_FAILED");
      }),
      connectTextOnly: vi.fn(async () => {
        throw new Error("REALTIME_TEXT_ONLY_UNAVAILABLE");
      }),
      disconnect: vi.fn(),
      updateTools: vi.fn(),
      updateContext: vi.fn(),
      updateModules: vi.fn(),
      sendToolResult: vi.fn()
    };
    const classicAdapter = {
      connect: vi.fn(async () => undefined),
      connectTextOnly: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      updateTools: vi.fn(),
      updateContext: vi.fn(),
      updateModules: vi.fn(),
      sendToolResult: vi.fn()
    };
    let factoryCalls = 0;
    const runtime = createRealtimeAssistantRuntime({
      useAgentsVoiceAdapter: true,
      adapterOptions: {
        onDiagnostic(event) {
          diagnostics.push(event);
        }
      },
      adapterFactory: () => {
        factoryCalls += 1;
        return factoryCalls === 1 ? failingAgentsAdapter : classicAdapter;
      }
    });

    await runtime.connect();

    expect(failingAgentsAdapter.connect).toHaveBeenCalledTimes(1);
    expect(classicAdapter.connect).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.runtime.adapter_fallback",
        status: "classic_webrtc",
        message: "SDK_CONNECT_FAILED"
      })
    ]));
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

  it("passes submitted realtime command plans directly to the harness", async () => {
    const { runtime, getAdapterOptions, diagnostics } = createRuntimeWithFakeAdapter();
    const plan: CommandPlan = {
      id: "plan_1",
      sourceText: "暂停音乐",
      normalizedText: "暂停音乐",
      commands: [{
        id: "cmd_1",
        module: "music",
        tool: "music.pause",
        args: { widgetId: "wi_music" },
        risk: "safe",
        confidence: 0.98,
        source: "realtime",
        requiresHarnessValidation: true
      }],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_1"] }],
      confidence: 0.98,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const handleRealtimeCommandPlan = vi.spyOn(runtime.harness, "handleRealtimeCommandPlan").mockResolvedValue({
      route: "model",
      call: { id: "cmd_1", name: "music.pause", arguments: { widgetId: "wi_music" }, source: "realtime" },
      result: { status: "success", message: "已暂停" }
    });

    const result = await getAdapterOptions()?.onCommandPlan?.("暂停音乐", plan, { callId: "submit_1", commandTraceId: "voice_plan_1" });

    expect(result).toEqual({ status: "success", message: "已暂停" });
    expect(handleRealtimeCommandPlan).toHaveBeenCalledWith("暂停音乐", plan, { commandTraceId: "voice_plan_1" });
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realtime.runtime.command_plan_result", status: "success", commandTraceId: "voice_plan_1" })
    ]));
  });

  it("does not expose voice transcript execution routing from the runtime", async () => {
    const { runtime, getAdapterOptions } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput");

    expect(getAdapterOptions()?.onUserTranscript).toBeUndefined();
    expect(handleRealtimeUserInput).not.toHaveBeenCalled();
  });

  it("falls back to the realtime harness when a command-like voice transcript is left unhandled", async () => {
    const { runtime, getAdapterOptions, diagnostics } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput").mockResolvedValue({
      route: "shortcut",
      call: { id: "call_close_all", name: "widget.remove", arguments: { targetText: "所有小工具" }, source: "shortcut" },
      result: { status: "success", message: "已关闭所有小工具" }
    });

    await getAdapterOptions()?.onUnhandledUserTranscript?.("关闭所有小工具", { commandTraceId: "voice_unhandled_1", itemId: "item_1" });
    await Promise.resolve();

    expect(handleRealtimeUserInput).toHaveBeenCalledWith("关闭所有小工具", { commandTraceId: "voice_unhandled_1" });
    expect(runtime.runtimeController.metrics.localHitCount).toBe(1);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.runtime.unhandled_voice_transcript_result",
        status: "success",
        commandTraceId: "voice_unhandled_1",
        route: "shortcut"
      })
    ]));
  });

  it("treats short music listen and open-player transcripts as command-like fallbacks", () => {
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("我想听王菲的歌")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("我想听王菲")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("来一首 Ryuichi Sakamoto 的 Merry Christmas Mr Lawrence")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("找一点北欧爵士，先不要播放")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("打开音乐播放器")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("看苹果股票")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("查腾讯股价")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("西雅图现在几点")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("更换壁纸")).toBe(true);
    expect(shouldFallbackUnhandledVoiceTranscriptToHarness("你好")).toBe(false);
  });

  it("falls back unhandled artist listen requests into the realtime harness", async () => {
    const { runtime, getAdapterOptions, diagnostics } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput").mockResolvedValue({
      route: "model",
      call: { id: "call_music", name: "music.play", arguments: { query: "王菲" }, source: "realtime" },
      result: { status: "success", message: "已开始播放音乐" }
    });

    await getAdapterOptions()?.onUnhandledUserTranscript?.("我想听王菲的歌", { commandTraceId: "voice_music_1", itemId: "item_music" });
    await Promise.resolve();

    expect(handleRealtimeUserInput).toHaveBeenCalledWith("我想听王菲的歌", { commandTraceId: "voice_music_1" });
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "realtime.runtime.unhandled_voice_transcript_result",
        status: "success",
        commandTraceId: "voice_music_1",
        route: "model",
        toolName: "music.play"
      })
    ]));
  });

  it("does not fall back unhandled greetings into the realtime harness", async () => {
    const { runtime, getAdapterOptions } = createRuntimeWithFakeAdapter();
    const handleRealtimeUserInput = vi.spyOn(runtime.harness, "handleRealtimeUserInput");

    await getAdapterOptions()?.onUnhandledUserTranscript?.("你好", { commandTraceId: "voice_hello", itemId: "item_hello" });

    expect(handleRealtimeUserInput).not.toHaveBeenCalled();
  });
});
