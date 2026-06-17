import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const CALCULATOR_MODULE_TYPE = "calculator";

export const calculatorAliases = ["计算器", "计算", "算一下"];

export const calculatorCapabilities = ["打开计算器", "展示计算结果", "关闭窗口"];

export const calculatorShortcutExamples = ["12加30是多少", "12乘以8", "2斤是多少克"];

export const calculatorShortcuts: ShortcutRule[] = [
  {
    id: "calculator.calculate",
    intent: "calculate",
    actions: ["计算", "算"],
    examples: ["12加30是多少", "12乘以8", "2斤是多少克"],
    risk: "safe"
  }
];

export function createCalculatorDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? CALCULATOR_MODULE_TYPE,
    type: CALCULATOR_MODULE_TYPE,
    name: definition?.name ?? "计算器",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
