import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createTvScopedContext } from "./context";
import { TV_MODULE_TYPE, tvAliases, tvCapabilities, tvShortcutExamples } from "./definition";

export function createTvRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: TV_MODULE_TYPE,
      displayName: "电视",
      aliases: tvAliases,
      capabilities: tvCapabilities,
      shortcutExamples: tvShortcutExamples.slice(0, 5),
      riskSummary: ["需要 mounted TV capability", "与 music 播放存在媒体冲突", "scoped context 只发送频道/播放摘要"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createTvScopedContext(tools, request)
  };
}
