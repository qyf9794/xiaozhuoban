import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createRecorderScopedContext } from "./context";
import { RECORDER_MODULE_TYPE, recorderAliases, recorderCapabilities, recorderShortcutExamples } from "./definition";

export function createRecorderRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: RECORDER_MODULE_TYPE,
      displayName: "录音机",
      aliases: recorderAliases,
      capabilities: recorderCapabilities,
      shortcutExamples: recorderShortcutExamples.slice(0, 5),
      riskSummary: ["需要麦克风权限", "与 Realtime 麦克风监听互斥", "scoped context 不发送录音内容"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createRecorderScopedContext(tools, request)
  };
}
