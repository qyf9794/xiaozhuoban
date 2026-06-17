import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const musicExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "latest-wins",
  exclusiveActions: ["music.play", "music.pause", "music.resume", "music.next", "music.previous"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["weather", "headline", "worldClock", "clipboard", "todo", "countdown"],
  conflictsWith: ["tv.play"]
};
