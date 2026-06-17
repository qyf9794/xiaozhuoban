import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createHeadlineScopedContext } from "./context";
import { HEADLINE_MODULE_TYPE, headlineAliases, headlineCapabilities, headlineShortcutExamples } from "./definition";

export function createHeadlineRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: HEADLINE_MODULE_TYPE,
      displayName: "新闻",
      aliases: headlineAliases,
      capabilities: headlineCapabilities,
      shortcutExamples: headlineShortcutExamples.slice(0, 5),
      riskSummary: ["新闻/头条只刷新 headline，不播放 CCTV/电视", "scoped context 不发送完整文章内容"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createHeadlineScopedContext(tools, request)
  };
}
