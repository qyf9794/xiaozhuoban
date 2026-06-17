import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { calculatorExecutionPolicy } from "./executionPolicy";
import { CALCULATOR_MODULE_TYPE, calculatorShortcutExamples } from "./definition";

function safeCalculatorSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const displayMatch = compact.match(/[-+]?\d+(?:\.\d+)?/);
  return displayMatch ? `calculator-display:${displayMatch[0]}` : "calculator-display-summary-only";
}

export function createCalculatorScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === CALCULATOR_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeCalculatorSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: CALCULATOR_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      localCalculationPreferred: true,
      modelForArithmeticAllowed: false
    },
    shortcutExamples: calculatorShortcutExamples.slice(0, 8),
    executionPolicy: calculatorExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createCalculatorContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 500,
    getScopedContext: (request: ScopedContextRequest) => createCalculatorScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeCalculatorSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        localCalculationPreferred: true,
        modelForArithmeticAllowed: false
      }
    })
  };
}
