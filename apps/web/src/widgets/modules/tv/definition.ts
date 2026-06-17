import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const TV_MODULE_TYPE = "tv";

export const tvAliases = ["电视", "直播", "电视机"];

export const tvCapabilities = ["打开电视", "选择频道", "播放", "暂停", "全屏", "关闭窗口"];

export const tvShortcutExamples = ["看央视新闻", "暂停 CCTV1", "央视五套全屏播放", "播放 CCTV1"];

export const tvShortcuts: ShortcutRule[] = [
  {
    id: "tv.channel",
    intent: "tv_channel",
    actions: ["看", "切到", "播放"],
    examples: ["看央视新闻", "播放 CCTV1", "央视五套全屏播放"],
    risk: "safe"
  }
];

export function createTvDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? TV_MODULE_TYPE,
    type: TV_MODULE_TYPE,
    name: definition?.name ?? "电视",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
