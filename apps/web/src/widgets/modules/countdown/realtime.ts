import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createCountdownScopedContext } from "./context";
import { COUNTDOWN_MODULE_TYPE, countdownAliases, countdownCapabilities, countdownShortcutExamples } from "./definition";

export function createCountdownRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: COUNTDOWN_MODULE_TYPE,
      displayName: "倒计时",
      aliases: countdownAliases,
      capabilities: countdownCapabilities,
      shortcutExamples: countdownShortcutExamples.slice(0, 5),
      riskSummary: ["暂停计时是 countdown.pause，不是关闭窗口", "取消倒计时/关闭倒计时是 widget.remove"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createCountdownScopedContext(tools, request)
  };
}
