import type { AssistantAction, ModuleMigrationReport, ShortcutConflictReport, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { RECORDER_MODULE_TYPE, createRecorderDefinition, recorderAliases, recorderShortcuts } from "./definition";
import { recorderExecutionPolicy } from "./executionPolicy";
import { createRecorderContextProvider } from "./context";
import { createRecorderRealtimeProvider } from "./realtime";
import { createRecorderActionSpecs, createRecorderTools } from "./tools";

export const recorderMigrationReport: ModuleMigrationReport = {
  module: RECORDER_MODULE_TYPE,
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
  preservedShortcuts: ["开始录制", "播放录制", "暂停录制", "停止录音", "打开录音机"],
  pendingItems: ["底层执行仍复用 WidgetCapabilityBridge；Realtime 麦克风互斥提示后续可接入运行态 UI。"]
};

export const recorderShortcutConflictReport: ShortcutConflictReport = {
  id: "recorder-conflict-none-2026-06-17",
  modules: [RECORDER_MODULE_TYPE],
  shortcut: "recorder shortcuts",
  conflictType: "unknown",
  resolution: "none",
  notes: "No conflict found. Recorder content is excluded from scoped context and microphone permission remains explicit."
};

export function createRecorderAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  const definition = definitions.find((item) => item.type === RECORDER_MODULE_TYPE);
  const tools = createRecorderTools(actions);
  return {
    type: RECORDER_MODULE_TYPE,
    definition: createRecorderDefinition(definition),
    aliases: recorderAliases,
    shortcuts: recorderShortcuts,
    tools,
    context: createRecorderContextProvider(tools),
    realtime: createRecorderRealtimeProvider(tools),
    executionPolicy: recorderExecutionPolicy,
    actionSpecs: createRecorderActionSpecs(actions),
    legacyBridge: true,
    migrationNotes: ["Recorder aliases/tools/context/realtime/policy are owned by modules/recorder."],
    testMatrix: {
      localParsing: ["开始录制", "播放录制", "暂停录制", "停止录音"],
      commandPlans: ["开始录制，同时打开新闻"],
      execution: tools.flatMap((action) => action.spec.examples ?? []),
      realtimeFallback: ["帮我开始录一下", "回放刚才的录音"],
      regression: recorderShortcuts.flatMap((shortcut) => shortcut.examples)
    }
  };
}
