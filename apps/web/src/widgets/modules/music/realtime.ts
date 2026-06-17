import type { AssistantAction, WidgetRealtimeProvider } from "@xiaozhuoban/assistant-core";
import { musicAliases, musicCapabilities, musicShortcutExamples } from "./definition";
import { createMusicScopedContext } from "./context";

export function createMusicRealtimeProvider(tools: AssistantAction[]): WidgetRealtimeProvider {
  return {
    exposeCatalog: () => ({
      type: "music",
      displayName: "音乐",
      aliases: musicAliases,
      capabilities: musicCapabilities,
      shortcutExamples: musicShortcutExamples.slice(0, 5),
      riskSummary: [
        "关闭音乐是关闭窗口，调用 widget.remove，不是暂停播放",
        "暂停音乐是暂停播放，调用 music.pause",
        "播放、搜索和控制需要已挂载 music capability"
      ]
    }),
    getScopedContext: (request) => createMusicScopedContext(tools, request)
  };
}
