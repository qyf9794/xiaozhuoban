import type { AssistantHarness, AssistantOperationEvent } from "./AssistantHarness";
import {
  DEFAULT_REALTIME_BUDGET_CONFIG,
  RealtimeRuntimeController,
  type AssistantToolSpec,
  type AssistantRuntimeMode,
  type RealtimeBudgetConfig,
  type RealtimeBudgetMetrics
} from "@xiaozhuoban/assistant-core";
import { createLocalAssistantHarness } from "./createLocalAssistantHarness";
import type { AppShellActionBridge } from "./appShellActions";
import {
  OpenAIRealtimeWebRtcAdapter,
  type OpenAIRealtimeWebRtcAdapterOptions,
  type RealtimeConnectionStatus
} from "./openaiRealtimeAdapter";
import type { WidgetCapabilityBridge } from "./widgetCapabilityBridge";
import type { AssistantRoute, AssistantRealtimeAdapter } from "./AssistantHarness";

export const AGENTS_VOICE_ADAPTER_STORAGE_KEY = "xiaozhuoban.realtime.agentsVoiceAdapter.enabled";

export function readAgentsVoiceAdapterEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AGENTS_VOICE_ADAPTER_STORAGE_KEY) === "true";
}

type RuntimeRealtimeAdapter = AssistantRealtimeAdapter & {
  connect: () => Promise<void>;
  connectTextOnly?: () => Promise<void>;
  disconnect: () => void;
  sendTextCommand?: (input: string, options?: { commandTraceId?: string }) => void;
};

type RuntimeRealtimeAdapterKind = "agents_voice_sdk" | "classic_webrtc";

function createLazyAgentsVoiceAdapter(options: OpenAIRealtimeWebRtcAdapterOptions): RuntimeRealtimeAdapter {
  let adapter: RuntimeRealtimeAdapter | null = null;
  let adapterPromise: Promise<RuntimeRealtimeAdapter> | null = null;
  let cachedTools: AssistantToolSpec[] = [];
  let cachedContext: Parameters<NonNullable<AssistantRealtimeAdapter["updateContext"]>>[0] | null = null;
  let cachedModules: Parameters<NonNullable<AssistantRealtimeAdapter["updateModules"]>>[0] | null = null;
  let cachedCommandTraceId: string | null = null;

  const ensureAdapter = async () => {
    if (adapter) return adapter;
    adapterPromise ??= import("./agentsVoiceRealtimeAdapter").then(({ AgentsVoiceRealtimeAdapter }) => {
      const nextAdapter = new AgentsVoiceRealtimeAdapter(options) as RuntimeRealtimeAdapter;
      if (cachedTools.length) {
        void nextAdapter.updateTools(cachedTools);
      }
      if (cachedContext && nextAdapter.updateContext) {
        void nextAdapter.updateContext(cachedContext);
      }
      if (cachedModules && nextAdapter.updateModules) {
        void nextAdapter.updateModules(cachedModules);
      }
      if (nextAdapter.setActiveCommandTraceId) {
        void nextAdapter.setActiveCommandTraceId(cachedCommandTraceId);
      }
      adapter = nextAdapter;
      return nextAdapter;
    });
    return adapterPromise;
  };

  return {
    updateTools(tools) {
      cachedTools = tools;
      return adapter?.updateTools(tools);
    },
    updateContext(context) {
      cachedContext = context;
      return adapter?.updateContext?.(context);
    },
    updateModules(registry) {
      cachedModules = registry;
      return adapter?.updateModules?.(registry);
    },
    setActiveCommandTraceId(commandTraceId) {
      cachedCommandTraceId = commandTraceId;
      return adapter?.setActiveCommandTraceId?.(commandTraceId);
    },
    sendToolResult(call, result) {
      return adapter?.sendToolResult(call, result);
    },
    async connect() {
      const nextAdapter = await ensureAdapter();
      await nextAdapter.connect();
    },
    async connectTextOnly() {
      const nextAdapter = await ensureAdapter();
      if (!nextAdapter.connectTextOnly) {
        throw new Error("REALTIME_TEXT_ONLY_UNAVAILABLE");
      }
      await nextAdapter.connectTextOnly();
    },
    disconnect() {
      adapter?.disconnect();
    },
    sendTextCommand(input, commandOptions) {
      if (!adapter?.sendTextCommand) {
        throw new Error("REALTIME_TEXT_CHANNEL_NOT_READY");
      }
      adapter.sendTextCommand(input, commandOptions);
    }
  };
}

export function shouldFallbackUnhandledVoiceTranscriptToHarness(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  if (/^(在吗|你好|您好|hello|hi|嗨|你在吗)[？?。!！\s]*$/i.test(normalized)) return false;
  return /(关闭|关掉|收起|打开|唤出|调出|整理|排列|对齐|全屏|侧栏|侧边栏|设置|命令面板|倒计时|计时|留言板|音乐|歌曲|歌|听|播放|王菲|陈奕迅|周杰伦|孙燕姿|Beyond|李宗盛|Taylor Swift|Adele|Coldplay|红豆|十年|时钟|表盘|几点|时间|时区|天气|新闻|头条|行情|指数|股票|股价|个股|翻译|换算|壁纸|背景|桌面背景|换壁纸|换背景|小工具|窗口|组件|面板)/i.test(
    normalized
  );
}

export interface RealtimeAssistantRuntime {
  harness: AssistantHarness;
  adapter: RuntimeRealtimeAdapter;
  runtimeController: RealtimeRuntimeController;
  connect: () => Promise<void>;
  connectTextOnly: () => Promise<void>;
  connectForWake: () => Promise<void>;
  sendRealtimeTextCommand: (input: string, options?: { commandTraceId?: string }) => Promise<void>;
  disconnect: () => void;
  detectLocalWake: () => void;
  noteRealtimeActivity: (source: string) => void;
  handleIdleElapsed: (idleMs: number) => void;
  handleMaxSessionElapsed: (activeMs: number) => void;
  recordCommandRoute: (route: AssistantRoute) => void;
}

export function createRealtimeAssistantRuntime(options: {
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onRuntimeBudgetChange?: (status: { mode: AssistantRuntimeMode; metrics: RealtimeBudgetMetrics }) => void;
  onOperation?: (event: AssistantOperationEvent) => void;
  capabilityBridge?: WidgetCapabilityBridge;
  appShellBridge?: AppShellActionBridge;
  adapterOptions?: Omit<OpenAIRealtimeWebRtcAdapterOptions, "onFunctionCall" | "onStatusChange">;
  adapterFactory?: (options: OpenAIRealtimeWebRtcAdapterOptions) => RuntimeRealtimeAdapter;
  useAgentsVoiceAdapter?: boolean | (() => boolean);
  runtimeBudgetConfig?: RealtimeBudgetConfig;
  now?: () => number;
} = {}): RealtimeAssistantRuntime {
  let harness: AssistantHarness;
  let connectedAt: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxSessionTimer: ReturnType<typeof setTimeout> | null = null;
  const now = options.now ?? (() => Date.now());
  const runtimeBudgetConfig = options.runtimeBudgetConfig ?? DEFAULT_REALTIME_BUDGET_CONFIG;
  const emitDiagnostic = options.adapterOptions?.onDiagnostic;
  const runtimeController = new RealtimeRuntimeController(runtimeBudgetConfig);
  const notifyRuntime = () =>
    options.onRuntimeBudgetChange?.({
      mode: runtimeController.mode,
      metrics: runtimeController.metrics
    });
  const clearIdleTimer = () => {
    if (!idleTimer) return;
    globalThis.clearTimeout(idleTimer);
    idleTimer = null;
  };
  const clearMaxSessionTimer = () => {
    if (!maxSessionTimer) return;
    globalThis.clearTimeout(maxSessionTimer);
    maxSessionTimer = null;
  };
  const getIdleTimeoutMs = () => {
    if (runtimeController.mode === "realtime_command_window") return runtimeBudgetConfig.commandWindowIdleMs;
    if (runtimeController.mode === "realtime_dialogue_window") return runtimeBudgetConfig.dialogueIdleMs;
    if (runtimeController.mode === "realtime_cooldown") return runtimeBudgetConfig.cooldownMs ?? DEFAULT_REALTIME_BUDGET_CONFIG.cooldownMs ?? 0;
    return 0;
  };
  const getMaxSessionMs = () => {
    if (runtimeController.mode === "realtime_command_window") return runtimeBudgetConfig.maxSingleCommandSessionMs;
    if (runtimeController.mode === "realtime_dialogue_window") return runtimeBudgetConfig.maxDialogueSessionMs;
    return 0;
  };
  const scheduleIdleTimer = (onElapsed: (idleMs: number) => void) => {
    clearIdleTimer();
    const timeoutMs = getIdleTimeoutMs();
    if (timeoutMs <= 0) return;
    idleTimer = globalThis.setTimeout(() => onElapsed(timeoutMs), timeoutMs);
  };
  const scheduleMaxSessionTimer = (onElapsed: (activeMs: number) => void) => {
    clearMaxSessionTimer();
    const timeoutMs = getMaxSessionMs();
    if (timeoutMs <= 0) return;
    maxSessionTimer = globalThis.setTimeout(() => onElapsed(timeoutMs), timeoutMs);
  };
  const noteRealtimeActivity = (source: string) => {
    if (connectedAt === null || !runtimeController.mode.startsWith("realtime_")) return;
    scheduleIdleTimer((idleMs) => runtimeApi.handleIdleElapsed(idleMs));
    emitDiagnostic?.({
      type: "realtime.runtime.activity",
      status: "refreshed",
      data: { source, mode: runtimeController.mode }
    });
  };
  const adapterOptions: OpenAIRealtimeWebRtcAdapterOptions = {
    ...options.adapterOptions,
    onStatusChange(status) {
      if (status === "connected") {
        connectedAt = now();
        scheduleIdleTimer((idleMs) => runtimeApi.handleIdleElapsed(idleMs));
        scheduleMaxSessionTimer((activeMs) => runtimeApi.handleMaxSessionElapsed(activeMs));
      }
      if (status === "disconnected" && connectedAt) {
        clearIdleTimer();
        clearMaxSessionTimer();
        runtimeController.recordRealtimeUsage({ activeMs: now() - connectedAt });
        connectedAt = null;
        notifyRuntime();
      }
      options.onStatusChange?.(status);
    },
    async onFunctionCall(call) {
      noteRealtimeActivity("function_call");
      await harness.handleFunctionCall(call, "function_call");
    },
    async onCommand(input, commandOptions) {
      noteRealtimeActivity("command_tool");
      try {
        const response = await harness.handleRealtimeUserInput(input, { commandTraceId: commandOptions.commandTraceId });
        if (response.route === "shortcut" || response.route === "learned") {
          runtimeController.recordLocalHit();
        } else if (response.route === "model") {
          runtimeController.recordFallback();
        }
        notifyRuntime();
        emitDiagnostic?.({
          type: "realtime.runtime.command_tool_result",
          status: response.result.status,
          commandTraceId: commandOptions.commandTraceId,
          route: response.route,
          toolName: response.call?.name,
          operationId: response.call?.id,
          message: response.result.message,
          errorCode: response.result.errorCode,
          data: { input }
        });
        return response.result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "realtime command harness failed";
        emitDiagnostic?.({
          type: "realtime.runtime.command_tool_result",
          status: "failed",
          commandTraceId: commandOptions.commandTraceId,
          message,
          data: { input }
        });
        return {
          status: "failed",
          message,
          errorCode: "REALTIME_COMMAND_HANDLER_FAILED"
        };
      }
    },
    async onCommandPlan(input, plan, commandOptions) {
      try {
        const response = await harness.handleRealtimeCommandPlan(input, plan, { commandTraceId: commandOptions.commandTraceId });
        runtimeController.recordFallback();
        notifyRuntime();
        emitDiagnostic?.({
          type: "realtime.runtime.command_plan_result",
          status: response.result.status,
          commandTraceId: commandOptions.commandTraceId,
          route: response.route,
          toolName: response.call?.name,
          operationId: response.call?.id,
          message: response.result.message,
          errorCode: response.result.errorCode,
          data: { input, commandCount: plan.commands.length, tools: plan.commands.map((command) => command.tool) }
        });
        return response.result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "realtime command plan harness failed";
        emitDiagnostic?.({
          type: "realtime.runtime.command_plan_result",
          status: "failed",
          commandTraceId: commandOptions.commandTraceId,
          message,
          data: { input }
        });
        return { status: "failed", message, errorCode: "REALTIME_COMMAND_PLAN_HANDLER_FAILED" };
      }
    },
    onUnhandledUserTranscript(input, transcriptOptions) {
      if (!shouldFallbackUnhandledVoiceTranscriptToHarness(input)) {
        return;
      }
      return harness.handleRealtimeUserInput(input, { commandTraceId: transcriptOptions.commandTraceId }).then((response) => {
        if (response.route === "shortcut" || response.route === "learned") {
          runtimeController.recordLocalHit();
        } else if (response.route === "model") {
          runtimeController.recordFallback();
        }
        notifyRuntime();
        emitDiagnostic?.({
          type: "realtime.runtime.unhandled_voice_transcript_result",
          status: response.result.status,
          commandTraceId: transcriptOptions.commandTraceId,
          route: response.route,
          toolName: response.call?.name,
          operationId: response.call?.id,
          message: response.result.message,
          errorCode: response.result.errorCode,
          data: { input }
        });
      }).catch((error) => {
        emitDiagnostic?.({
          type: "realtime.runtime.unhandled_voice_transcript_result",
          status: "failed",
          commandTraceId: transcriptOptions.commandTraceId,
          message: error instanceof Error ? error.message : "unhandled voice transcript fallback failed",
          data: { input }
        });
      });
    }
  };
  const shouldUseAgentsVoiceAdapter = () =>
    typeof options.useAgentsVoiceAdapter === "function" ? options.useAgentsVoiceAdapter() : Boolean(options.useAgentsVoiceAdapter);
  let activeAdapter: RuntimeRealtimeAdapter | null = null;
  let activeAdapterKind: RuntimeRealtimeAdapterKind | null = null;
  let cachedTools: AssistantToolSpec[] = [];
  let cachedContext: Parameters<NonNullable<AssistantRealtimeAdapter["updateContext"]>>[0] | null = null;
  let cachedModules: Parameters<NonNullable<AssistantRealtimeAdapter["updateModules"]>>[0] | null = null;
  let cachedCommandTraceId: string | null = null;
  const createRuntimeAdapter = (forcedKind?: RuntimeRealtimeAdapterKind) => {
    const adapterKind = forcedKind ?? (shouldUseAgentsVoiceAdapter() ? "agents_voice_sdk" : "classic_webrtc");
    const nextAdapter = options.adapterFactory
      ? options.adapterFactory(adapterOptions)
      : adapterKind === "agents_voice_sdk"
        ? createLazyAgentsVoiceAdapter(adapterOptions)
        : new OpenAIRealtimeWebRtcAdapter(adapterOptions);
    activeAdapterKind = adapterKind;
    emitDiagnostic?.({ type: "realtime.runtime.adapter_selected", status: adapterKind });
    if (cachedTools.length) {
      void nextAdapter.updateTools(cachedTools);
    }
    if (cachedContext && nextAdapter.updateContext) {
      void nextAdapter.updateContext(cachedContext);
    }
    if (cachedModules && nextAdapter.updateModules) {
      void nextAdapter.updateModules(cachedModules);
    }
    if (nextAdapter.setActiveCommandTraceId) {
      void nextAdapter.setActiveCommandTraceId(cachedCommandTraceId);
    }
    return nextAdapter;
  };
  const getAdapter = () => {
    activeAdapter ??= createRuntimeAdapter();
    return activeAdapter;
  };
  const switchAdapter = (kind: RuntimeRealtimeAdapterKind) => {
    activeAdapter?.disconnect();
    activeAdapter = createRuntimeAdapter(kind);
    return activeAdapter;
  };
  const adapter: RuntimeRealtimeAdapter = {
    connect: () => getAdapter().connect(),
    connectTextOnly: () => getAdapter().connectTextOnly?.() ?? Promise.reject(new Error("REALTIME_TEXT_ONLY_UNAVAILABLE")),
    disconnect: () => activeAdapter?.disconnect(),
    sendTextCommand: (input, commandOptions) => {
      const selectedAdapter = getAdapter();
      if (!selectedAdapter.sendTextCommand) {
        throw new Error("REALTIME_TEXT_COMMAND_UNAVAILABLE");
      }
      selectedAdapter.sendTextCommand(input, commandOptions);
    },
    updateTools: (tools) => {
      cachedTools = tools;
      return activeAdapter?.updateTools(tools);
    },
    updateContext: (context) => {
      cachedContext = context;
      return activeAdapter?.updateContext?.(context);
    },
    updateModules: (registry) => {
      cachedModules = registry;
      return activeAdapter?.updateModules?.(registry);
    },
    setActiveCommandTraceId: (commandTraceId) => {
      cachedCommandTraceId = commandTraceId;
      return activeAdapter?.setActiveCommandTraceId?.(commandTraceId);
    },
    sendToolResult: (call, result) => activeAdapter?.sendToolResult(call, result),
    requestToolCall: (input, context, tools, moduleRegistry) => getAdapter().requestToolCall?.(input, context, tools, moduleRegistry) ?? null,
    requestCommandPlan: (input, context, tools, moduleRegistry) => getAdapter().requestCommandPlan?.(input, context, tools, moduleRegistry) ?? null
  };
  if (options.adapterFactory) {
    activeAdapter = createRuntimeAdapter();
  }
  harness = createLocalAssistantHarness({
    capabilityBridge: options.capabilityBridge,
    appShellBridge: options.appShellBridge,
    realtime: adapter,
    onOperation: options.onOperation
  });

  const connectWithReason = async (reason: "manual" | "wake") => {
    const gate = runtimeController.requestRealtime(reason);
    notifyRuntime();
    if (!gate.allowed) {
      throw new Error(gate.reason);
    }
    try {
      await adapter.connect();
    } catch (error) {
      if (activeAdapterKind !== "agents_voice_sdk") {
        throw error;
      }
      emitDiagnostic?.({
        type: "realtime.runtime.adapter_fallback",
        status: "classic_webrtc",
        message: error instanceof Error ? error.message : "agents voice adapter connect failed"
      });
      await switchAdapter("classic_webrtc").connect();
    }
  };
  const connectTextOnlyWithReason = async (reason: "manual" | "wake") => {
    const gate = runtimeController.requestRealtime(reason);
    notifyRuntime();
    if (!gate.allowed) {
      throw new Error(gate.reason);
    }
    if (!adapter.connectTextOnly) {
      throw new Error("REALTIME_TEXT_ONLY_UNAVAILABLE");
    }
    try {
      await adapter.connectTextOnly();
    } catch (error) {
      if (activeAdapterKind !== "agents_voice_sdk") {
        throw error;
      }
      emitDiagnostic?.({
        type: "realtime.runtime.adapter_fallback",
        status: "classic_webrtc",
        message: error instanceof Error ? error.message : "agents voice adapter text-only connect failed"
      });
      const fallbackAdapter = switchAdapter("classic_webrtc");
      if (!fallbackAdapter.connectTextOnly) {
        throw new Error("REALTIME_TEXT_ONLY_UNAVAILABLE");
      }
      await fallbackAdapter.connectTextOnly();
    }
  };
  const disconnectRealtime = (reason: "manual" | "idle_timeout" | "max_session_timeout" = "manual") => {
    clearIdleTimer();
    clearMaxSessionTimer();
    emitDiagnostic?.({
      type: "realtime.runtime.disconnect",
      status: reason,
      data: { mode: runtimeController.mode, connected: connectedAt !== null }
    });
    if (connectedAt) {
      runtimeController.recordRealtimeUsage({ activeMs: now() - connectedAt });
      connectedAt = null;
    }
    if (reason === "manual" || reason === "max_session_timeout") {
      runtimeController.endRealtimeSession(reason);
    }
    notifyRuntime();
    adapter.disconnect();
  };

  const runtimeApi: RealtimeAssistantRuntime = {
    harness,
    adapter,
    runtimeController,
    async connect() {
      await connectWithReason("manual");
    },
    async connectTextOnly() {
      await connectTextOnlyWithReason("manual");
    },
    async connectForWake() {
      await connectWithReason("wake");
    },
    async sendRealtimeTextCommand(input, options) {
      if (!adapter.sendTextCommand) {
        throw new Error("REALTIME_TEXT_COMMAND_UNAVAILABLE");
      }
      if (!runtimeController.mode.startsWith("realtime_")) {
        await connectTextOnlyWithReason("manual");
      }
      noteRealtimeActivity("text_command");
      adapter.sendTextCommand(input, options);
    },
    disconnect: disconnectRealtime,
    detectLocalWake() {
      runtimeController.detectLocalWake();
      notifyRuntime();
    },
    noteRealtimeActivity,
    handleIdleElapsed(idleMs) {
      const previousMode = runtimeController.mode;
      const nextMode = runtimeController.idleElapsed(idleMs);
      if (
        (previousMode === "realtime_command_window" || previousMode === "realtime_dialogue_window") &&
        (nextMode === "local_standby" || nextMode === "realtime_cooldown")
      ) {
        disconnectRealtime("idle_timeout");
      } else {
        notifyRuntime();
      }
      if (nextMode === "realtime_cooldown") {
        scheduleIdleTimer((nextIdleMs) => runtimeApi.handleIdleElapsed(nextIdleMs));
      }
    },
    handleMaxSessionElapsed(activeMs) {
      if (runtimeController.mode !== "realtime_command_window" && runtimeController.mode !== "realtime_dialogue_window") {
        notifyRuntime();
        return;
      }
      emitDiagnostic?.({
        type: "realtime.runtime.max_session_elapsed",
        status: "max_session_timeout",
        durationMs: activeMs,
        data: { mode: runtimeController.mode }
      });
      disconnectRealtime("max_session_timeout");
      const modeAfterDisconnect = runtimeController.mode as AssistantRuntimeMode;
      if (modeAfterDisconnect === "realtime_cooldown") {
        scheduleIdleTimer((nextIdleMs) => runtimeApi.handleIdleElapsed(nextIdleMs));
      }
    },
    recordCommandRoute(route) {
      if (route === "shortcut" || route === "learned") {
        runtimeController.recordLocalHit();
      } else if (route === "model") {
        runtimeController.recordFallback();
      }
      notifyRuntime();
    }
  };
  return runtimeApi;
}
