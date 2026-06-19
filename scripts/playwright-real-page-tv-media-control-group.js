const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

  await page.addInitScript(() => {
    class FakeMediaRecorder {
      constructor(stream) {
        this.stream = stream;
        this.state = "inactive";
        this.mimeType = "audio/webm";
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        const blob = new Blob(["fake audio"], { type: this.mimeType });
        this.ondataavailable?.({ data: blob });
        setTimeout(() => this.onstop?.(), 0);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
    });
    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
  });

  const commandText = {
    "301": "打开电视并切到 CCTV5，完成后全屏",
    "302": "播放 CCTV13 新闻频道，然后刷新重大新闻",
    "303": "电视切到电影频道，但不要关闭音乐",
    "304": "暂停电视直播，继续播放音乐",
    "305": "把电视从全屏退出来，再切到 CCTV1",
    "306": "我想看体育频道，先打开电视再选 CCTV5",
    "307": "电视全屏后把侧边栏隐藏",
    "308": "打开 CCTV6，同时把电视窗口放到右上角",
    "309": "把电视音频先暂停，然后开始录音",
    "310": "切到 CCTV13，如果失败就保留频道选择界面",
    "311": "打开电视，但不要遮住天气卡片",
    "312": "播放 CCTV1 综合频道，再设十分钟倒计时",
    "313": "帮我看新闻直播，优先 CCTV13",
    "314": "把电视窗口调大一点并置顶",
    "315": "关闭电视，同时把音乐继续播放",
    "316": "打开电视后不要自动全屏，先让我确认频道",
    "317": "把当前电视直播暂停五分钟后提醒我回来",
    "318": "切换到电影频道并记录到便签",
    "319": "电视卡住了，重新选择 CCTV1 并播放",
    "320": "打开电视小工具，如果没有就新增一个"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|RECORDER_/.test(await operation());

  const clickDockButton = async (label) => {
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(350);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn|待确认/.test(dockText)) {
      await clickDockButton("取消");
    }
  };

  const sendCommand = async (command, waitMs = 1_100) => {
    await settlePrompts();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    await settlePrompts();
  };

  const resetAppState = async () => {
    await page.goto("http://localhost:5174");
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      const databases = await indexedDB.databases?.();
      await Promise.all(
        (databases ?? [])
          .map((database) => database.name)
          .filter(Boolean)
          .map(
            (name) =>
              new Promise((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
              })
          )
      );
    });
    await page.goto("http://localhost:5174/app");
    await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
    await page.waitForTimeout(300);
  };

  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const rect = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.innerText,
          media: Array.from(el.querySelectorAll("audio,video")).map((media) => ({
            tag: media.tagName.toLowerCase(),
            src: media.getAttribute("src") || media.currentSrc || ""
          })),
          inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
            ariaLabel: input.getAttribute("aria-label"),
            placeholder: input.getAttribute("placeholder"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      const tv = find(["电视播放", "CCTV", "央视"]);
      return {
        bodyText: document.body.innerText,
        widgets,
        tv,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        weather: find(["天气"]),
        countdown: find(["倒计时"]),
        todo: find(["待办"]),
        note: find(["便签"]),
        headline: find(["重大新闻"]),
        sidebarVisible: Boolean(document.querySelector(".sidebar-panel")),
        fullscreenWidgetId: document.fullscreenElement?.getAttribute("data-widget-id") || "",
        maxZ: Math.max(...widgets.map((widget) => widget.zIndex), 0),
        tvChannel:
          tv?.media.find((item) => item.tag === "video")?.src.match(/cctv\d+/i)?.[0]?.toUpperCase() ??
          tv?.text.match(/CCTV\s*-?\s*\d+/i)?.[0]?.replace(/[\s-]+/g, "").toUpperCase() ??
          ""
      };
    });

  const widgetIdFromDom = async (needles) =>
    page.locator("[data-widget-id]").evaluateAll(
      (elements, expected) => {
        const target = elements.find((element) => expected.some((needle) => element.textContent?.includes(needle)));
        return target?.getAttribute("data-widget-id") ?? undefined;
      },
      needles
    );

  const createTrack = (query, index = 0) => ({
    wrapperType: "track",
    kind: "song",
    trackId: 9000 + index,
    trackName: "轻松测试音乐",
    artistName: "测试歌手",
    collectionName: "测试歌单",
    artworkUrl100: `https://example.test/music-${index}.jpg`,
    previewUrl: `https://example.test/music-${index}.m4a`,
    trackViewUrl: `https://example.test/music-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack(term, 0), createTrack(term, 1)] })
    });
  });

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId;
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const planned = (type) => `planned_widget_${type}`;
    const existingOrPlanned = (type) => widgetId(type) ?? forcedWidgetIds[type] ?? planned(type);
    const command = (tool, args = {}) => ({
      tool,
      args,
      risk: "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const addTv = () => command("board.add_widget", { definitionId: definitionId("tv") });

    if (input === "播放轻松音乐，如果没找到就播放第一首") {
      return [command("music.play", { widgetId: existingOrPlanned("music"), query: "轻松测试音乐", kind: "song" })];
    }
    if (input === commandText["301"]) return [addTv(), command("tv.select_channel", { widgetId: planned("tv"), channelName: "CCTV5" }), command("tv.fullscreen", { widgetId: planned("tv") })];
    if (input === commandText["302"]) return [command("tv.play", { widgetId: existingOrPlanned("tv"), channelName: "CCTV13" }), command("headline.request_refresh", { widgetId: existingOrPlanned("headline") })];
    if (input === commandText["303"]) return [command("tv.select_channel", { widgetId: existingOrPlanned("tv"), channelName: "CCTV6" })];
    if (input === commandText["304"]) return [command("tv.pause", { widgetId: existingOrPlanned("tv") }), command("music.resume", { widgetId: existingOrPlanned("music") })];
    if (input === commandText["305"]) return [command("tv.select_channel", { widgetId: existingOrPlanned("tv"), channelName: "CCTV1" })];
    if (input === commandText["306"]) return [addTv(), command("tv.select_channel", { widgetId: planned("tv"), channelName: "CCTV5" })];
    if (input === commandText["307"]) return [command("tv.fullscreen", { widgetId: existingOrPlanned("tv") }), command("app.sidebar.set", { mode: "hide" })];
    if (input === commandText["308"]) return [addTv(), command("tv.play", { widgetId: planned("tv"), channelName: "CCTV6" }), command("widget.move", { widgetId: planned("tv"), x: 1120, y: 48 })];
    if (input === commandText["309"]) return [command("tv.pause", { widgetId: existingOrPlanned("tv") }), command("recorder.start", { widgetId: existingOrPlanned("recorder") })];
    if (input === commandText["310"]) return [command("tv.select_channel", { widgetId: existingOrPlanned("tv"), channelName: "CCTV13" })];
    if (input === commandText["311"]) return [addTv(), command("tv.play", { widgetId: planned("tv"), channelName: "CCTV1" }), command("widget.move", { widgetId: planned("tv"), x: 760, y: 84 })];
    if (input === commandText["312"]) return [command("tv.play", { widgetId: existingOrPlanned("tv"), channelName: "CCTV1" }), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 600, start: true })];
    if (input === commandText["313"]) return [command("tv.play", { widgetId: existingOrPlanned("tv"), channelName: "CCTV13" }), command("headline.request_refresh", { widgetId: existingOrPlanned("headline") })];
    if (input === commandText["314"]) return [command("widget.resize", { widgetId: existingOrPlanned("tv"), w: 560, h: 360 }), command("widget.bring_to_front", { widgetId: existingOrPlanned("tv") })];
    if (input === commandText["315"]) return [command("widget.remove", { widgetId: existingOrPlanned("tv") }), command("music.resume", { widgetId: existingOrPlanned("music") })];
    if (input === commandText["316"]) return [addTv()];
    if (input === commandText["317"]) return [command("tv.pause", { widgetId: existingOrPlanned("tv") }), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "回来", dueAt: "2026-06-19T08:54:00.000Z" })];
    if (input === commandText["318"]) return [command("tv.select_channel", { widgetId: existingOrPlanned("tv"), channelName: "CCTV6" }), command("note.write", { widgetId: existingOrPlanned("note"), content: "已切换到电影频道", mode: "append" })];
    if (input === commandText["319"]) return [command("tv.select_channel", { widgetId: existingOrPlanned("tv"), channelName: "CCTV1" })];
    if (input === commandText["320"]) return [addTv()];
    return null;
  };

  const mockRealtimePlan = async (route) => {
    const body = route.request().postDataJSON();
    const input = String(body.input ?? "");
    const phase = body.phase;
    const commands = createPlan(input, body.context ?? {});
    if (!commands) {
      await route.continue();
      return;
    }

    const addedTypes = new Set(
      commands
        .filter((item) => item.tool === "board.add_widget")
        .map((item) => String(item.args?.definitionId ?? "").replace(/^wd_/, ""))
        .filter(Boolean)
    );
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) continue;
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) continue;
      const fallback = {
        tv: ["电视播放", "CCTV", "央视"],
        music: ["音乐播放器", "Apple Music", "试听"],
        recorder: ["录音机", "录音中", "录音 "],
        countdown: ["倒计时"],
        todo: ["待办"],
        note: ["便签"],
        headline: ["重大新闻"]
      }[type];
      if (fallback) {
        const existingWidgetId = await widgetIdFromDom(fallback);
        if (existingWidgetId) item.args.widgetId = existingWidgetId;
      }
    }
    if (targetInputs.has(input)) {
      realtimeHits.push({
        input,
        phase,
        matched: true,
        tools: commands.map((item) => item.tool),
        args: commands.map((item) => item.args)
      });
    }
    if (phase === "plan_select") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ call: null, planSelection: { steps: commands.map((item) => ({ name: item.tool, confidence: 0.94 })) } })
      });
      return;
    }
    if (phase === "plan_execute") {
      const plannedCommands = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, ...item }));
      for (const [index, commandItem] of plannedCommands.entries()) {
        const widgetIdArg = typeof commandItem.args?.widgetId === "string" ? commandItem.args.widgetId : "";
        const plannedType = widgetIdArg.startsWith("planned_widget_") ? widgetIdArg.slice("planned_widget_".length) : "";
        if (!plannedType) continue;
        const addDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.add_widget" && String(candidate.args?.definitionId ?? "").includes(plannedType));
        if (addDependency) {
          commandItem.dependsOn = [...(commandItem.dependsOn ?? []), addDependency.id];
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_plan_${Date.now()}`,
            sourceText: input,
            commands: plannedCommands,
            executionGroups: [{ mode: "sequential", commandIds: plannedCommands.map((item) => item.id) }],
            confidence: 0.94,
            createdBy: "text-llm",
            requiresHarnessValidation: true
          }
        })
      });
      return;
    }
    await route.continue();
  };

  await page.route("**/api/realtime/tool-call", mockRealtimePlan);

  const ensureWidget = async (command, key, waitMs = 900) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(command, waitMs);
    state = await snapshot();
    return state[key];
  };

  const push = async (id, passed, evidence) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-6);
    const realtimeOk = relatedRealtimeHits.length > 0;
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      operation: await operation(),
      evidence: `${evidence}; realtimeHits=${JSON.stringify(relatedRealtimeHits)}${realtimeOk ? "" : "; missingRealtimeRoute=true"}`
    });
  };

  const seedBase = async (id) => {
    if (!["301", "306", "308", "316", "320"].includes(id)) {
      await ensureWidget("打开电视", "tv", 1_000);
    }
    if (["303", "304", "315"].includes(id)) {
      await ensureWidget("打开音乐", "music", 900);
      await sendCommand("播放轻松音乐，如果没找到就播放第一首", 1_500);
    }
    if (["302", "313"].includes(id)) await ensureWidget("打开新闻", "headline", 900);
    if (id === "309") await ensureWidget("打开录音机", "recorder", 900);
    if (id === "311") await ensureWidget("打开天气", "weather", 900);
    if (id === "312") await ensureWidget("打开倒计时", "countdown", 900);
    if (id === "317") await ensureWidget("打开待办", "todo", 900);
    if (id === "318") await ensureWidget("新建便签实例用于测试", "note", 900);
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.tv = state.tv?.id;
    forcedWidgetIds.music = state.music?.id;
    forcedWidgetIds.recorder = state.recorder?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.headline = state.headline?.id;
    forcedWidgetIds.weather = state.weather?.id;
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["301", "302", "307", "308", "313"].includes(id) ? 1_600 : 1_200);
    let state = await snapshot();
    const ok = await noAssistantError();

    if (id === "301") {
      await push(id, Boolean(state.tv) && (/CCTV5/.test(state.tvChannel) || /CCTV5/.test(state.tv?.text ?? "")) && /全屏|fullscreen/i.test(await operation()) && ok, `tvChannel=${state.tvChannel}; operation=${await operation()}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    } else if (id === "302") {
      await push(id, /CCTV13/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && Boolean(state.headline) && ok, `tvChannel=${state.tvChannel}; headline=${JSON.stringify((state.headline?.text || "").slice(0, 400))}`);
    } else if (id === "303") {
      await push(id, /CCTV6/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && Boolean(state.music) && ok, `tvChannel=${state.tvChannel}; music=${Boolean(state.music)}`);
    } else if (id === "304") {
      await push(id, Boolean(state.tv) && Boolean(state.music) && ok, `operation=${await operation()}; tv=${Boolean(state.tv)}; music=${Boolean(state.music)}`);
    } else if (id === "305") {
      await push(id, /CCTV1/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && ok, `tvChannel=${state.tvChannel}; operation=${await operation()}`);
    } else if (id === "306") {
      await push(id, Boolean(state.tv) && /CCTV5/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && ok, `tvChannel=${state.tvChannel}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    } else if (id === "307") {
      await push(id, Boolean(state.tv) && !state.sidebarVisible && ok, `sidebarVisible=${state.sidebarVisible}; fullscreenWidgetId=${state.fullscreenWidgetId}; operation=${await operation()}`);
    } else if (id === "308") {
      await push(id, Boolean(state.tv) && /CCTV6/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && (state.tv?.rect.x ?? 0) > 700 && ok, `tvChannel=${state.tvChannel}; rect=${JSON.stringify(state.tv?.rect)}`);
    } else if (id === "309") {
      await push(id, Boolean(state.tv) && /录音中|停止录音/.test(state.recorder?.text ?? "") && ok, `recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 400))}; operation=${await operation()}`);
    } else if (id === "310") {
      await push(id, /CCTV13/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && Boolean(state.tv) && ok, `tvChannel=${state.tvChannel}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    } else if (id === "311") {
      await push(id, Boolean(state.tv) && Boolean(state.weather) && Math.abs((state.tv?.rect.x ?? 0) - (state.weather?.rect.x ?? -999)) > 100 && ok, `tvRect=${JSON.stringify(state.tv?.rect)}; weatherRect=${JSON.stringify(state.weather?.rect)}`);
    } else if (id === "312") {
      await push(id, /CCTV1/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && /10:00|09:59|600|十分钟/.test(state.countdown?.text ?? "") && ok, `tvChannel=${state.tvChannel}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}`);
    } else if (id === "313") {
      await push(id, /CCTV13/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && Boolean(state.headline) && ok, `tvChannel=${state.tvChannel}; headline=${JSON.stringify((state.headline?.text || "").slice(0, 400))}`);
    } else if (id === "314") {
      await push(id, Boolean(state.tv) && (state.tv?.rect.w ?? 0) >= 490 && state.tv?.zIndex === state.maxZ && ok, `rect=${JSON.stringify(state.tv?.rect)}; z=${state.tv?.zIndex}/${state.maxZ}`);
    } else if (id === "315") {
      await push(id, !state.tv && Boolean(state.music) && ok, `tv=${Boolean(state.tv)}; music=${Boolean(state.music)}; operation=${await operation()}`);
    } else if (id === "316") {
      await push(id, Boolean(state.tv) && !/全屏|fullscreen/i.test(await operation()) && ok, `operation=${await operation()}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 400))}`);
    } else if (id === "317") {
      await push(id, Boolean(state.tv) && /回来/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 400))}; operation=${await operation()}`);
    } else if (id === "318") {
      await push(id, /CCTV6/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && /电影频道/.test(`${state.note?.text ?? ""} ${JSON.stringify(state.note?.inputs ?? [])}`) && ok, `tvChannel=${state.tvChannel}; note=${JSON.stringify((state.note?.text || "").slice(0, 500))}`);
    } else if (id === "319") {
      await push(id, /CCTV1/.test(`${state.tvChannel} ${state.tv?.text ?? ""}`) && ok, `tvChannel=${state.tvChannel}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    } else if (id === "320") {
      await push(id, Boolean(state.tv) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}; operation=${await operation()}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageTvMediaControlResults = value;
    let pre = document.getElementById("xz-real-page-tv-media-control-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-tv-media-control-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "900px";
      pre.style.maxHeight = "360px";
      pre.style.overflow = "auto";
      pre.style.zIndex = "99999";
      pre.style.background = "rgba(255,255,255,0.94)";
      pre.style.color = "#111827";
      pre.style.fontSize = "11px";
      pre.style.padding = "8px";
      document.body.appendChild(pre);
    }
    pre.textContent = JSON.stringify(value, null, 2);
  }, results);

  const failed = results.filter((result) => !result.passed);
  const summary = { total: results.length, passed: results.length - failed.length, failed: failed.length };
  console.log(JSON.stringify({ summary, failed }, null, 2));
  if (failed.length > 0) {
    throw new Error(`TV/media control real-page group failed: ${failed.length}/${results.length}`);
  }
};

if (typeof module !== "undefined" && require.main === module) {
  const { chromium } = require("playwright");
  (async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await run(page);
    } finally {
      await browser.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = run;
