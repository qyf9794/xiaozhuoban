import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createClipboardScopedContext } from "./context";
import { clipboardAliases, clipboardCapabilities, clipboardShortcutExamples, CLIPBOARD_MODULE_TYPE } from "./definition";

export function createClipboardRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: CLIPBOARD_MODULE_TYPE,
      displayName: "剪贴板",
      aliases: clipboardAliases,
      capabilities: clipboardCapabilities,
      shortcutExamples: clipboardShortcutExamples.slice(0, 5),
      riskSummary: ["清空剪贴板需要 preview/confirm", "scoped context 不发送完整剪贴板内容"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createClipboardScopedContext(tools, request)
  };
}
