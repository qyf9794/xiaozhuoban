import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const RECORDER_MODULE_TYPE = "recorder";

export const recorderAliases = ["录音", "录制", "录音机"];

export const recorderCapabilities = ["开始录音", "停止录音", "播放录音", "暂停录音", "关闭窗口"];

export const recorderShortcutExamples = ["开始录制", "播放录制", "暂停录制", "停止录音"];

export const recorderShortcuts: ShortcutRule[] = [
  {
    id: "recorder.control",
    intent: "recorder_control",
    actions: ["开始", "停止", "播放", "暂停"],
    examples: ["开始录制", "播放录制", "暂停录制", "停止录音"],
    risk: "safe"
  }
];

export function createRecorderDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? RECORDER_MODULE_TYPE,
    type: RECORDER_MODULE_TYPE,
    name: definition?.name ?? "录音机",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
