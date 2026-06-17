import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const headlineExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["headline.request_refresh"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "music", "worldClock", "market", "todo", "countdown"],
  conflictsWith: ["tv.select_channel", "tv.play"]
};
