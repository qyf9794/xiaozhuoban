import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createTranslateScopedContext } from "./context";
import { TRANSLATE_MODULE_TYPE, translateAliases, translateCapabilities, translateShortcutExamples } from "./definition";

export function createTranslateRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: TRANSLATE_MODULE_TYPE,
      displayName: "翻译",
      aliases: translateAliases,
      capabilities: translateCapabilities,
      shortcutExamples: translateShortcutExamples.slice(0, 5),
      riskSummary: ["长文本不默认进入 Realtime", "scoped context 只发送草稿元数据"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createTranslateScopedContext(tools, request)
  };
}
