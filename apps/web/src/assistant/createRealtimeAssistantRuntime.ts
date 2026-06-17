import type { AssistantHarness, AssistantOperationEvent } from "./AssistantHarness";
import {
  DEFAULT_REALTIME_BUDGET_CONFIG,
  RealtimeRuntimeController,
  type AssistantRuntimeMode,
  type RealtimeBudgetConfig,
  type RealtimeBudgetMetrics
} from "@xiaozhuoban/assistant-core";
import { createLocalAssistantHarness } from "./createLocalAssistantHarness";
import {
  OpenAIRealtimeWebRtcAdapter,
  type OpenAIRealtimeWebRtcAdapterOptions,
  type RealtimeConnectionStatus
} from "./openaiRealtimeAdapter";
import type { WidgetCapabilityBridge } from "./widgetCapabilityBridge";
import type { AssistantRoute, AssistantRealtimeAdapter } from "./AssistantHarness";

type RuntimeRealtimeAdapter = AssistantRealtimeAdapter & {
  connect: () => Promise<void>;
  disconnect: () => void;
};

export interface RealtimeAssistantRuntime {
  harness: AssistantHarness;
  adapter: RuntimeRealtimeAdapter;
  runtimeController: RealtimeRuntimeController;
  connect: () => Promise<void>;
  connectForWake: () => Promise<void>;
  disconnect: () => void;
  detectLocalWake: () => void;
  handleIdleElapsed: (idleMs: number) => void;
  recordCommandRoute: (route: AssistantRoute) => void;
}

export function createRealtimeAssistantRuntime(options: {
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onRuntimeBudgetChange?: (status: { mode: AssistantRuntimeMode; metrics: RealtimeBudgetMetrics }) => void;
  onOperation?: (event: AssistantOperationEvent) => void;
  capabilityBridge?: WidgetCapabilityBridge;
  adapterOptions?: Omit<OpenAIRealtimeWebRtcAdapterOptions, "onFunctionCall" | "onStatusChange">;
  adapterFactory?: (options: OpenAIRealtimeWebRtcAdapterOptions) => RuntimeRealtimeAdapter;
  runtimeBudgetConfig?: RealtimeBudgetConfig;
  now?: () => number;
} = {}): RealtimeAssistantRuntime {
  let harness: AssistantHarness;
  let connectedAt: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const now = options.now ?? (() => Date.now());
  const runtimeBudgetConfig = options.runtimeBudgetConfig ?? DEFAULT_REALTIME_BUDGET_CONFIG;
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
  const getIdleTimeoutMs = () => {
    if (runtimeController.mode === "realtime_command_window") return runtimeBudgetConfig.commandWindowIdleMs;
    if (runtimeController.mode === "realtime_dialogue_window") return runtimeBudgetConfig.dialogueIdleMs;
    if (runtimeController.mode === "realtime_cooldown") return runtimeBudgetConfig.cooldownMs ?? DEFAULT_REALTIME_BUDGET_CONFIG.cooldownMs ?? 0;
    return 0;
  };
  const scheduleIdleTimer = (onElapsed: (idleMs: number) => void) => {
    clearIdleTimer();
    const timeoutMs = getIdleTimeoutMs();
    if (timeoutMs <= 0) return;
    idleTimer = globalThis.setTimeout(() => onElapsed(timeoutMs), timeoutMs);
  };
  const adapterOptions: OpenAIRealtimeWebRtcAdapterOptions = {
    ...options.adapterOptions,
    onStatusChange(status) {
      if (status === "connected") {
        connectedAt = now();
        scheduleIdleTimer((idleMs) => runtimeApi.handleIdleElapsed(idleMs));
      }
      if (status === "disconnected" && connectedAt) {
        clearIdleTimer();
        runtimeController.recordRealtimeUsage({ activeMs: now() - connectedAt });
        connectedAt = null;
        notifyRuntime();
      }
      options.onStatusChange?.(status);
    },
    async onFunctionCall(call) {
      await harness.handleFunctionCall(call, "function_call");
    }
  };
  const adapter = options.adapterFactory ? options.adapterFactory(adapterOptions) : new OpenAIRealtimeWebRtcAdapter(adapterOptions);
  harness = createLocalAssistantHarness({
    capabilityBridge: options.capabilityBridge,
    realtime: adapter,
    onOperation: options.onOperation
  });

  const connectWithReason = async (reason: "manual" | "wake") => {
    const gate = runtimeController.requestRealtime(reason);
    notifyRuntime();
    if (!gate.allowed) {
      throw new Error(gate.reason);
    }
    await adapter.connect();
  };
  const disconnectRealtime = () => {
    clearIdleTimer();
    if (connectedAt) {
      runtimeController.recordRealtimeUsage({ activeMs: now() - connectedAt });
      connectedAt = null;
      notifyRuntime();
    }
    adapter.disconnect();
  };

  const runtimeApi: RealtimeAssistantRuntime = {
    harness,
    adapter,
    runtimeController,
    async connect() {
      await connectWithReason("manual");
    },
    async connectForWake() {
      await connectWithReason("wake");
    },
    disconnect: disconnectRealtime,
    detectLocalWake() {
      runtimeController.detectLocalWake();
      notifyRuntime();
    },
    handleIdleElapsed(idleMs) {
      const previousMode = runtimeController.mode;
      const nextMode = runtimeController.idleElapsed(idleMs);
      if (
        (previousMode === "realtime_command_window" || previousMode === "realtime_dialogue_window") &&
        (nextMode === "local_standby" || nextMode === "realtime_cooldown")
      ) {
        disconnectRealtime();
      } else {
        notifyRuntime();
      }
      if (nextMode === "realtime_cooldown") {
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
