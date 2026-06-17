import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { marketExecutionPolicy } from "./executionPolicy";
import { MARKET_MODULE_TYPE, marketShortcutExamples } from "./definition";

function safeMarketSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const parts = ["market-index-summary-only"];
  if (/美股|A股|港股|恒生|nasdaq|dow|sp/i.test(compact)) parts.push("selected-group-present");
  return parts.join(" ");
}

export function createMarketScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === MARKET_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeMarketSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: MARKET_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      indexGroupSummaryOnly: true,
      investmentAdviceAllowed: false,
      tradingAllowed: false
    },
    shortcutExamples: marketShortcutExamples.slice(0, 8),
    executionPolicy: marketExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createMarketContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 550,
    getScopedContext: (request: ScopedContextRequest) => createMarketScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeMarketSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        indexGroupSummaryOnly: true,
        investmentAdviceAllowed: false,
        tradingAllowed: false
      }
    })
  };
}
