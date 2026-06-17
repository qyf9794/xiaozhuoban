import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const clipboardExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "sequential",
  destructiveActions: ["clipboard.clear"],
  requiresConfirmation: ["clipboard.clear"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "music", "todo", "headline", "worldClock"]
};
