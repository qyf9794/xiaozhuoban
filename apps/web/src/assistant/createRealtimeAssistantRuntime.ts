import type { AssistantHarness, AssistantOperationEvent } from "./AssistantHarness";
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
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function createRealtimeAssistantRuntime(options: {
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onOperation?: (event: AssistantOperationEvent) => void;
  capabilityBridge?: WidgetCapabilityBridge;
  adapterOptions?: Omit<OpenAIRealtimeWebRtcAdapterOptions, "onFunctionCall" | "onStatusChange">;
} = {}): RealtimeAssistantRuntime {
  let harness: AssistantHarness;
  const adapter = new OpenAIRealtimeWebRtcAdapter({
    ...options.adapterOptions,
    onStatusChange: options.onStatusChange,
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
    connect: () => adapter.connect(),
    disconnect: () => adapter.disconnect()
  };
}
