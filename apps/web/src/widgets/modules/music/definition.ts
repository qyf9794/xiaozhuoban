import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const MUSIC_MODULE_TYPE = "music";

export const musicAliases = ["音乐", "歌曲", "歌", "播放器", "音乐播放器"];

export const musicCapabilities = ["打开音乐", "查询 Apple Music 登录状态", "搜索音乐", "播放", "暂停", "继续", "上一首", "下一首", "关闭窗口"];

export const musicShortcutExamples = [
  "打开音乐",
  "搜索周杰伦音乐",
  "播放第一首",
  "暂停音乐",
  "关闭音乐",
  "先打开音乐，再搜索七里香，然后播放第一首",
  "打开音乐，播放周杰伦"
];

export const musicShortcuts: ShortcutRule[] = [
  {
    id: "music.window",
    intent: "window_control",
    actions: ["打开", "关闭", "收起"],
    examples: ["打开音乐", "关闭音乐", "把音乐收了"],
    risk: "safe"
  },
  {
    id: "music.search",
    intent: "music_search",
    actions: ["搜索", "找", "搜"],
    examples: ["搜索七里香", "搜索周杰伦音乐", "找轻松的音乐"],
    risk: "safe"
  },
  {
    id: "music.playback",
    intent: "media_control",
    actions: ["播放", "暂停", "继续", "上一首", "下一首"],
    examples: ["暂停音乐", "继续音乐", "播放第一首"],
    risk: "safe"
  }
];

export function createMusicDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? MUSIC_MODULE_TYPE,
    type: MUSIC_MODULE_TYPE,
    name: definition?.name ?? "音乐",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
