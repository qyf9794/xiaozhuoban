import { describe, expect, it } from "vitest";
import { ActionRegistry } from "@xiaozhuoban/assistant-core";
import { createAppShellActions, type AiDialogOpenMetadata } from "./appShellActions";

const NOW = "2026-06-18T00:00:00.000Z";

function createRegistry(options: {
  sidebarOpen?: boolean;
  fullscreen?: boolean;
  opened?: string[];
} = {}) {
  let sidebarOpen = options.sidebarOpen ?? true;
  let fullscreen = options.fullscreen ?? false;
  const opened = options.opened ?? [];
  const aiDialogMetadata: AiDialogOpenMetadata[] = [];
  const registry = new ActionRegistry();
  createAppShellActions({
    getSidebarOpen: () => sidebarOpen,
    setSidebarOpen: (open) => {
      sidebarOpen = open;
    },
    getFullscreen: () => fullscreen,
    setFullscreen: (enabled) => {
      fullscreen = enabled;
    },
    openSettings: () => {
      opened.push("settings");
    },
    openCommandPalette: (query) => {
      opened.push(query ? `command_palette:${query}` : "command_palette");
    },
    openAiDialog: (prompt, metadata) => {
      opened.push(prompt ? `ai_dialog:${prompt}` : "ai_dialog");
      if (metadata) aiDialogMetadata.push(metadata);
    },
    openWallpaperPicker: () => {
      opened.push("wallpaper");
    }
  }).forEach((action) => registry.register(action));
  return {
    registry,
    opened,
    aiDialogMetadata,
    getSidebarOpen: () => sidebarOpen,
    getFullscreen: () => fullscreen
  };
}

describe("App shell assistant actions", () => {
  it("controls Xiaozhuoban sidebar state", async () => {
    const { registry, getSidebarOpen } = createRegistry({ sidebarOpen: true });

    const result = await registry.execute(
      { id: "call_1", name: "app.sidebar.set", arguments: { mode: "hide" }, source: "test" },
      { now: () => NOW }
    );

    expect(result).toMatchObject({ status: "success", message: "已隐藏侧栏" });
    expect(getSidebarOpen()).toBe(false);
  });

  it("controls page fullscreen state", async () => {
    const { registry, getFullscreen } = createRegistry();

    const result = await registry.execute(
      { id: "call_1", name: "app.fullscreen.set", arguments: { enabled: true }, source: "test" },
      { now: () => NOW }
    );

    expect(result).toMatchObject({ status: "success", message: "已进入全屏" });
    expect(getFullscreen()).toBe(true);
  });

  it("opens shell panels without widget targets", async () => {
    const { registry, opened, aiDialogMetadata } = createRegistry();

    await registry.execute({ id: "call_1", name: "app.settings.open", arguments: {}, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_2", name: "app.command_palette.open", arguments: {}, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_3", name: "app.command_palette.open", arguments: { query: "天气" }, source: "test" }, { now: () => NOW });
    await registry.execute(
      { id: "call_4", name: "app.ai_dialog.open", arguments: {}, source: "test", transcript: "打开 AI 生成", commandTraceId: "trace_ai_1" },
      { now: () => NOW, operationId: "call_4" }
    );
    await registry.execute(
      { id: "call_5", name: "app.ai_dialog.open", arguments: { prompt: "每日摘要" }, source: "test", transcript: "新建 AI 小工具做每日摘要", commandTraceId: "trace_ai_2" },
      { now: () => NOW, operationId: "call_5" }
    );
    await registry.execute({ id: "call_6", name: "app.wallpaper.pick", arguments: {}, source: "test" }, { now: () => NOW });

    expect(opened).toEqual(["settings", "command_palette", "command_palette:天气", "ai_dialog", "ai_dialog:每日摘要", "wallpaper"]);
    expect(aiDialogMetadata).toMatchObject([
      { source: "tool", commandTraceId: "trace_ai_1", operationId: "call_4", userCommand: "打开 AI 生成" },
      { source: "tool", commandTraceId: "trace_ai_2", operationId: "call_5", userCommand: "新建 AI 小工具做每日摘要" }
    ]);
  });

  it("rejects AI dialog tool calls without explicit AI creation intent", async () => {
    const { registry, opened } = createRegistry();

    const result = await registry.execute({
      id: "call_unrelated",
      name: "app.ai_dialog.open",
      arguments: { prompt: "显示侧边栏" },
      source: "realtime",
      transcript: "显示侧边栏",
      commandTraceId: "trace_sidebar"
    });

    expect(result).toMatchObject({ status: "failed", errorCode: "APP_AI_DIALOG_EXPLICIT_INTENT_REQUIRED" });
    expect(opened).toEqual([]);
  });
});
