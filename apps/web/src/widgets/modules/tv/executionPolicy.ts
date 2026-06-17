import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const tvExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "sequential",
  exclusiveActions: ["tv.play", "tv.pause", "tv.fullscreen", "tv.select_channel"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "headline", "worldClock", "market"],
  conflictsWith: ["music.play", "music.resume"]
};
