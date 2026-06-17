import type { AssistantAction, ScopedContextRequest } from "@xiaozhuoban/assistant-core";
import { createCalculatorScopedContext } from "./context";
import { CALCULATOR_MODULE_TYPE, calculatorAliases, calculatorCapabilities, calculatorShortcutExamples } from "./definition";

export function createCalculatorRealtimeProvider(tools: AssistantAction[]) {
  return {
    exposeCatalog: () => ({
      type: CALCULATOR_MODULE_TYPE,
      displayName: "计算器",
      aliases: calculatorAliases,
      capabilities: calculatorCapabilities,
      shortcutExamples: calculatorShortcutExamples.slice(0, 5),
      riskSummary: ["本地可算表达式优先走本地 shortcut，不默认调用模型", "只暴露当前 display 摘要"]
    }),
    getScopedContext: (request: ScopedContextRequest) => createCalculatorScopedContext(tools, request)
  };
}
