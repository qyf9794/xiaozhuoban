import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createTodoScopedContext } from "./context";
import { todoAliases, todoCapabilities, todoShortcutExamples, TODO_MODULE_TYPE } from "./definition";

export function createTodoRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: TODO_MODULE_TYPE,
      displayName: "待办",
      aliases: todoAliases,
      capabilities: todoCapabilities,
      shortcutExamples: todoShortcutExamples.slice(0, 5),
      riskSummary: ["scoped context 只发送待办数量和短摘要", "不发送完整待办列表或敏感提醒内容"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createTodoScopedContext(tools, request)
  };
}
