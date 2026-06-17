import type { WidgetExecutionPolicy } from "@xiaozhuoban/assistant-core";

export const recorderExecutionPolicy: WidgetExecutionPolicy = {
  defaultMode: "sequential",
  exclusiveActions: ["recorder.start", "recorder.stop", "recorder.play", "recorder.pause"],
  requiresMountedWidget: true,
  canRunInParallelWith: ["todo", "headline", "worldClock"],
  conflictsWith: ["realtime.microphone", "voiceAssistant.listen"]
};
