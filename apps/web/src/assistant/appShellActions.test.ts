import { describe, expect, it } from "vitest";
import { ActionRegistry } from "@xiaozhuoban/assistant-core";
import { createAppShellActions } from "./appShellActions";

const NOW = "2026-06-18T00:00:00.000Z";

function createRegistry(options: {
  sidebarOpen?: boolean;
  fullscreen?: boolean;
  opened?: string[];
} = {}) {
  let sidebarOpen = options.sidebarOpen ?? true;
  let fullscreen = options.fullscreen ?? false;
  const opened = options.opened ?? [];
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
    openAiDialog: (prompt) => {
      opened.push(prompt ? `ai_dialog:${prompt}` : "ai_dialog");
    }
  }).forEach((action) => registry.register(action));
  return {
    registry,
    opened,
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
    const { registry, opened } = createRegistry();

    await registry.execute({ id: "call_1", name: "app.settings.open", arguments: {}, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_2", name: "app.command_palette.open", arguments: {}, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_3", name: "app.command_palette.open", arguments: { query: "天气" }, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_4", name: "app.ai_dialog.open", arguments: {}, source: "test" }, { now: () => NOW });
    await registry.execute({ id: "call_5", name: "app.ai_dialog.open", arguments: { prompt: "每日摘要" }, source: "test" }, { now: () => NOW });

    expect(opened).toEqual(["settings", "command_palette", "command_palette:天气", "ai_dialog", "ai_dialog:每日摘要"]);
  });
});
