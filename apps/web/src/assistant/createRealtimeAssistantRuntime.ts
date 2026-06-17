import type { AssistantHarness, AssistantOperationEvent } from "./AssistantHarness";
import { RealtimeRuntimeController, type AssistantRuntimeMode, type RealtimeBudgetMetrics } from "@xiaozhuoban/assistant-core";
import { createLocalAssistantHarness } from "./createLocalAssistantHarness";
import {
  OpenAIRealtimeWebRtcAdapter,
  type OpenAIRealtimeWebRtcAdapterOptions,
  type RealtimeConnectionStatus
} from "./openaiRealtimeAdapter";
import type { WidgetCapabilityBridge } from "./widgetCapabilityBridge";

export interface RealtimeAssistantRuntime {
  harness: AssistantHarness;
  adapter: OpenAIRealtimeWebRtcAdapter;
  runtimeController: RealtimeRuntimeController;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function createRealtimeAssistantRuntime(options: {
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onRuntimeBudgetChange?: (status: { mode: AssistantRuntimeMode; metrics: RealtimeBudgetMetrics }) => void;
  onOperation?: (event: AssistantOperationEvent) => void;
  capabilityBridge?: WidgetCapabilityBridge;
  adapterOptions?: Omit<OpenAIRealtimeWebRtcAdapterOptions, "onFunctionCall" | "onStatusChange">;
} = {}): RealtimeAssistantRuntime {
  let harness: AssistantHarness;
  let connectedAt: number | null = null;
  const runtimeController = new RealtimeRuntimeController();
  const notifyRuntime = () =>
    options.onRuntimeBudgetChange?.({
      mode: runtimeController.mode,
      metrics: runtimeController.metrics
    });
  const adapter = new OpenAIRealtimeWebRtcAdapter({
    ...options.adapterOptions,
    onStatusChange(status) {
      if (status === "connected") {
        connectedAt = Date.now();
      }
      if (status === "disconnected" && connectedAt) {
        runtimeController.recordRealtimeUsage({ activeMs: Date.now() - connectedAt });
        connectedAt = null;
        notifyRuntime();
      }
      options.onStatusChange?.(status);
    },
    async onFunctionCall(call) {
      await harness.handleFunctionCall(call, "function_call");
    }
  });
  harness = createLocalAssistantHarness({
    capabilityBridge: options.capabilityBridge,
    realtime: adapter,
    onOperation: options.onOperation
  });

  return {
    harness,
    adapter,
    runtimeController,
    async connect() {
      const gate = runtimeController.requestRealtime("manual");
      notifyRuntime();
      if (!gate.allowed) {
        throw new Error(gate.reason);
      }
      await adapter.connect();
    },
    disconnect() {
      if (connectedAt) {
        runtimeController.recordRealtimeUsage({ activeMs: Date.now() - connectedAt });
        connectedAt = null;
        notifyRuntime();
      }
      adapter.disconnect();
    }
  };
}
