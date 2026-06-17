import { describe, expect, it } from "vitest";
import { ActionRegistry, ToolScopeManager, type ResolvedWidgetTarget } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import {
  WidgetCapabilityBridge,
  createWidgetCapabilityActions,
  type WidgetCapabilityStore
} from "./widgetCapabilityBridge";

const NOW = "2026-06-16T12:00:00.000Z";

function createDefinition(type: string, kind: WidgetDefinition["kind"] = "system"): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind,
    type,
    name: type,
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" },
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createWidget(type: string, state: Record<string, unknown> = {}): WidgetInstance {
  return {
    id: `wi_${type}`,
    boardId: "board_1",
    definitionId: `wd_${type}`,
    state,
    bindings: [],
    position: { x: 0, y: 0 },
    size: { w: 240, h: 180 },
    zIndex: 1,
    locked: false,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createStore(options?: { includeGames?: boolean; includeAiDefinition?: boolean }) {
  const definitions = ["music", "tv", "recorder", "dialClock", "messageBoard"].map((type) => createDefinition(type));
  if (options?.includeGames) {
    definitions.push(createDefinition("gomoku"), createDefinition("monopoly"), createDefinition("guandan"));
  }
  if (options?.includeAiDefinition) {
    definitions.push(createDefinition("aiForm", "ai"));
  }
  let widgets = definitions
    .filter((definition) => definition.kind === "system")
    .map((definition) => createWidget(definition.type));

  const store: WidgetCapabilityStore = {
    getWidgetDefinitions: () => definitions,
    getWidgetInstances: () => widgets,
    updateWidgetState(widgetId, state) {
      widgets = widgets.map((widget) => (widget.id === widgetId ? { ...widget, state } : widget));
    }
  };

  return {
    store,
    getWidget: (type: string) => widgets.find((widget) => widget.id === `wi_${type}`)
  };
}

function targetFor(type: string): ResolvedWidgetTarget {
  return {
    widgetId: `wi_${type}`,
    definitionId: `wd_${type}`,
    type,
    name: type,
    confidence: 1,
    reason: "test"
  };
}

function createRegistry(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge) {
  const registry = new ActionRegistry();
  createWidgetCapabilityActions(store, bridge).forEach((action) => registry.register(action));
  return registry;
}

describe("WidgetCapabilityBridge", () => {
  it("registers, invokes, and unregisters mounted widget capabilities", async () => {
    const bridge = new WidgetCapabilityBridge();
    const calls: string[] = [];
    const unregister = bridge.register("wi_tv", {
      play(args) {
        calls.push(`play:${String(args.channelName ?? "")}`);
      }
    });

    expect(bridge.has("wi_tv", "play")).toBe(true);
    const result = await bridge.invoke("wi_tv", "play", { channelName: "CCTV1" }, { now: () => NOW });

    expect(result.status).toBe("success");
    expect(calls).toEqual(["play:CCTV1"]);

    unregister();
    expect(bridge.has("wi_tv", "play")).toBe(false);
  });

  it("returns safe fallback results for unmounted or missing capabilities", async () => {
    const bridge = new WidgetCapabilityBridge();

    const unmounted = await bridge.invoke("wi_tv", "play", {}, { now: () => NOW });
    bridge.register("wi_tv", {});
    const missing = await bridge.invoke("wi_tv", "fullscreen", {}, { now: () => NOW });

    expect(unmounted).toMatchObject({ status: "failed", errorCode: "WIDGET_NOT_MOUNTED" });
    expect(missing).toMatchObject({ status: "failed", errorCode: "WIDGET_CAPABILITY_UNAVAILABLE" });
  });

  it("registers only stage-one capability widgets and scopes detail actions", () => {
    const { store } = createStore({ includeAiDefinition: true, includeGames: true });
    const bridge = new WidgetCapabilityBridge();
    const actions = createWidgetCapabilityActions(store, bridge);
    const names = actions.map((action) => action.spec.name);
    const manager = new ToolScopeManager(actions.map((action) => action.spec));

    expect(names).toEqual([
      "music.search",
      "music.play",
      "music.pause",
      "music.resume",
      "music.next",
      "music.previous",
      "tv.play",
      "tv.pause",
      "tv.fullscreen",
      "tv.select_channel",
      "recorder.start",
      "recorder.stop",
      "recorder.play",
      "recorder.pause",
      "dialClock.set_night_mode",
      "messageBoard.send"
    ]);
    expect(names.some((name) => name.includes("gomoku") || name.includes("monopoly") || name.includes("guandan"))).toBe(false);
    expect(names.some((name) => name.includes("ai"))).toBe(false);
    expect(manager.getInitialTools()).toEqual([]);
    expect(manager.getWidgetDetailTools("tv").map((tool) => tool.name)).toEqual([
      "tv.play",
      "tv.pause",
      "tv.fullscreen",
      "tv.select_channel"
    ]);
  });

  it("registers capability actions even before widget definitions are loaded", () => {
    const bridge = new WidgetCapabilityBridge();
    const actions = createWidgetCapabilityActions(
      {
        getWidgetInstances: () => [],
        getWidgetDefinitions: () => []
      },
      bridge
    );

    expect(actions.map((action) => action.spec.name)).toContain("music.play");
    expect(actions.map((action) => action.spec.name)).toContain("music.next");
  });

  it("runs TV channel selection and fullscreen through mounted capabilities", async () => {
    const { store, getWidget } = createStore();
    const bridge = new WidgetCapabilityBridge();
    const calls: string[] = [];
    bridge.register("wi_tv", {
      selectChannel(args) {
        calls.push(`select:${String(args.channelName)}`);
      },
      fullscreen() {
        calls.push("fullscreen");
      }
    });
    const registry = createRegistry(store, bridge);

    const selectResult = await registry.execute(
      {
        id: "call_1",
        name: "tv.select_channel",
        arguments: { channelName: "CCTV1", channelUrl: "https://example.com/cctv1.m3u8" },
        source: "test"
      },
      { target: targetFor("tv"), now: () => NOW }
    );
    const fullscreenResult = await registry.execute(
      { id: "call_2", name: "tv.fullscreen", arguments: {}, source: "test" },
      { target: targetFor("tv"), now: () => NOW }
    );

    expect(selectResult.status).toBe("success");
    expect(fullscreenResult.status).toBe("success");
    expect(calls).toEqual(["select:CCTV1", "fullscreen"]);
    expect(getWidget("tv")?.state).toMatchObject({
      selectedChannelName: "CCTV1",
      selectedChannelUrl: "https://example.com/cctv1.m3u8"
    });
  });

  it("runs recorder start and stop with state updates", async () => {
    const { store, getWidget } = createStore();
    const bridge = new WidgetCapabilityBridge();
    const calls: string[] = [];
    bridge.register("wi_recorder", {
      start() {
        calls.push("start");
      },
      stop() {
        calls.push("stop");
      }
    });
    const registry = createRegistry(store, bridge);

    const startResult = await registry.execute(
      { id: "call_1", name: "recorder.start", arguments: {}, source: "test" },
      { target: targetFor("recorder"), now: () => NOW }
    );
    const stopResult = await registry.execute(
      { id: "call_2", name: "recorder.stop", arguments: {}, source: "test" },
      { target: targetFor("recorder"), now: () => NOW }
    );

    expect(startResult.status).toBe("success");
    expect(stopResult.status).toBe("success");
    expect(calls).toEqual(["start", "stop"]);
    expect(getWidget("recorder")?.state.recording).toBe(false);
  });

  it("runs music playback controls and writes search query as state", async () => {
    const { store, getWidget } = createStore();
    const bridge = new WidgetCapabilityBridge();
    const calls: string[] = [];
    bridge.register("wi_music", {
      search(args) {
        calls.push(`search:${String(args.query ?? "")}:${String(args.kind ?? "")}`);
      },
      play(args) {
        calls.push(`play:${String(args.query ?? "")}`);
      },
      pause() {
        calls.push("pause");
      },
      resume() {
        calls.push("resume");
      },
      next() {
        calls.push("next");
      },
      previous() {
        calls.push("previous");
      }
    });
    const registry = createRegistry(store, bridge);

    await registry.execute(
      { id: "call_1", name: "music.search", arguments: { query: "Miles Davis", kind: "album" }, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_2", name: "music.play", arguments: { query: "Miles Davis" }, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_3", name: "music.pause", arguments: {}, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_4", name: "music.resume", arguments: {}, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_5", name: "music.next", arguments: {}, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_6", name: "music.previous", arguments: {}, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );

    expect(calls).toEqual(["search:Miles Davis:album", "play:Miles Davis", "pause", "resume", "next", "previous"]);
    expect(getWidget("music")?.state.query).toBe("Miles Davis");
  });

  it("sets dial clock night mode through capability and state patch", async () => {
    const { store, getWidget } = createStore();
    const bridge = new WidgetCapabilityBridge();
    const calls: boolean[] = [];
    bridge.register("wi_dialClock", {
      setNightMode(args) {
        calls.push(args.enabled === true);
      }
    });
    const registry = createRegistry(store, bridge);

    const result = await registry.execute(
      { id: "call_1", name: "dialClock.set_night_mode", arguments: { enabled: true }, source: "test" },
      { target: targetFor("dialClock"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(calls).toEqual([true]);
    expect(getWidget("dialClock")?.state.nightMode).toBe(true);
  });

  it("sends message board text through mounted capability", async () => {
    const { store } = createStore();
    const bridge = new WidgetCapabilityBridge();
    const calls: string[] = [];
    bridge.register("wi_messageBoard", {
      send(args) {
        calls.push(String(args.text ?? ""));
        return { status: "success", message: "已发送留言" };
      }
    });
    const registry = createRegistry(store, bridge);

    const result = await registry.execute(
      { id: "call_1", name: "messageBoard.send", arguments: { text: "M9 测试留言" }, source: "test" },
      { target: targetFor("messageBoard"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(calls).toEqual(["M9 测试留言"]);
  });

  it("refuses a capability action for a mismatched widget target", async () => {
    const { store } = createStore();
    const bridge = new WidgetCapabilityBridge();
    bridge.register("wi_tv", { play() {} });
    const registry = createRegistry(store, bridge);

    const result = await registry.execute(
      { id: "call_1", name: "tv.play", arguments: {}, source: "test" },
      { target: targetFor("music"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "failed", errorCode: "WIDGET_TYPE_MISMATCH" });
  });
});
