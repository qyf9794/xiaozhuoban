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
        "播放、搜索和控制需要已挂载 music capability",
        "当前焦点是音乐播放器时，省略模块名的后续话语也应根据整体语义选择 play、pause、resume、next、previous 或 search；不要依赖固定措辞",
        "music.play 会自行查找实体并播放；用户要求的最终状态是播放时直接选择 music.play，不把 music.search 当作准备步骤；参数保留用户实体"
      ]
    }),
    getScopedContext: (request) => createMusicScopedContext(tools, request)
  };
}
