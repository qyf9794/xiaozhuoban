import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const calculatorExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["calculator.set_display"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "headline", "worldClock", "market", "todo"]
};
