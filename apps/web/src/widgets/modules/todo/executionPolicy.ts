import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const todoExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "sequential",
  exclusiveActions: ["todo.add_item", "todo.complete_item"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "music", "clipboard", "headline", "worldClock"]
};
