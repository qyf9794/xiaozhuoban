import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { CALCULATOR_MODULE_TYPE, calculatorAliases, calculatorShortcuts, createCalculatorDefinition } from "./definition";
import { calculatorExecutionPolicy } from "./executionPolicy";
import { createCalculatorContextProvider } from "./context";
import { createCalculatorRealtimeProvider } from "./realtime";
import { createCalculatorActionSpecs, createCalculatorTools } from "./tools";

export const calculatorMigrationReport: ModuleMigrationReport = {
  module: CALCULATOR_MODULE_TYPE,
  legacyBridge: true,
  migratedFiles: [
    "definition.ts",
    "shortcuts.ts",
    "tools.ts",
    "context.ts",
    "realtime.ts",
    "executionPolicy.ts",
    "assistant.ts",
    "test-cases.json",
    "module.md"
  ],
  preservedShortcuts: ["12加30是多少", "12乘以8", "2斤是多少克", "打开计算器"],
  pendingItems: ["底层执行仍复用 WidgetStateActions；表达式解析仍由 shortcut router 负责本地优先。"]
};

export const calculatorShortcutConflictReport: ShortcutConflictReport = {
  id: "calculator-conflict-none-2026-06-17",
  modules: [CALCULATOR_MODULE_TYPE],
  shortcut: "calculator shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Local arithmetic shortcuts remain local-first and do not require model routing."
};

export function createCalculatorAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === CALCULATOR_MODULE_TYPE);
  const tools = createCalculatorTools(actions);
  return {
    type: CALCULATOR_MODULE_TYPE,
    definition: createCalculatorDefinition(definition),
    aliases: calculatorAliases,
    shortcuts: calculatorShortcuts,
    tools,
    context: createCalculatorContextProvider(tools),
    realtime: createCalculatorRealtimeProvider(tools),
    executionPolicy: calculatorExecutionPolicy,
    actionSpecs: createCalculatorActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Calculator aliases/tools/context/realtime/policy are owned by modules/calculator."],
    testMatrix: {
      localParsing: ["12加30是多少", "12乘以8", "2斤是多少克"],
      commandPlans: ["12加30是多少，同时打开新闻"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我算一下 12 加 30", "这个结果显示到计算器"],
      regression: calculatorShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
