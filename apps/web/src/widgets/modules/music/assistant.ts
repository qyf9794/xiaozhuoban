import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import {
  createMusicDefinition,
  musicAliases,
  musicShortcuts,
  MUSIC_MODULE_TYPE
} from "./definition";
import { musicExecutionPolicy } from "./executionPolicy";
import { createMusicContextProvider } from "./context";
import { createMusicRealtimeProvider } from "./realtime";
import { createMusicActionSpecs, createMusicTools } from "./tools";

export const musicMigrationReport: ModuleMigrationReport = {
  module: MUSIC_MODULE_TYPE,
  legacyBridge: true,
  migratedFiles: [
    "definition.ts",
    "shortcuts.ts",
    "tools.ts",
    "context.ts",
    "realtime.ts",
    "executionPolicy.ts",
    "assistant.ts",
    "test-cases.json",
    "module.md"
  ],
  preservedShortcuts: [
    "打开音乐",
    "关闭音乐",
    "暂停音乐",
    "继续音乐",
    "搜索周杰伦音乐",
    "先打开音乐，再搜索七里香，然后播放第一首"
  ],
  pendingItems: ["底层执行仍复用 WidgetCapabilityBridge；后续可把 MusicKit 失败模型继续下沉到 music/tools.ts"]
};

export const musicShortcutConflictReport: ShortcutConflictReport = {
  id: "music-conflict-none-2026-06-17",
  modules: ["music"],
  shortcut: "music shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Closing music remains widget.remove; pausing music remains music.pause."
};

export function createMusicAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === MUSIC_MODULE_TYPE);
  const tools = createMusicTools(actions);
  return {
    type: MUSIC_MODULE_TYPE,
    definition: createMusicDefinition(definition),
    aliases: musicAliases,
    shortcuts: musicShortcuts,
    tools,
    context: createMusicContextProvider(tools),
    realtime: createMusicRealtimeProvider(tools),
    executionPolicy: musicExecutionPolicy,
    actionSpecs: createMusicActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: [
      "Music aliases/tools/context/realtime/policy are owned by modules/music.",
      "Existing shortcut router behavior is preserved while module metadata is migrated."
    ],
    testMatrix: {
      localParsing: ["打开音乐", "关闭音乐", "暂停音乐", "打开音乐，播放周杰伦"],
      commandPlans: ["先打开音乐，再搜索七里香，然后播放第一首", "打开音乐，同时查北京天气"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我放点轻松的音乐", "搜一下七里香然后播第一首"],
      regression: musicShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
