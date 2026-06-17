import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const marketExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["market.set_indices"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "headline", "worldClock", "music", "todo"],
  conflictsWith: ["trading.execute"]
};
