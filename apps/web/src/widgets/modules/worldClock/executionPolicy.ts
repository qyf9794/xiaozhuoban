import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const worldClockExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["worldClock.set_zones"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "music", "headline", "market", "todo", "countdown"]
};
