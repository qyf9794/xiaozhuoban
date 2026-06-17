import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const countdownExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["countdown.set", "countdown.pause", "countdown.resume", "countdown.reset"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["music", "weather", "headline", "worldClock", "todo"]
};
