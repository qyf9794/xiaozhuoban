import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const weatherExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["weather.set_city"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["music", "worldClock", "market", "headline", "todo"]
};
