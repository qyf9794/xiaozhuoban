import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const translateExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["translate.set_draft"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "headline", "worldClock", "calculator", "todo"]
};
