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
        this.ondataavailable?.({ data: new Blob(["fake audio"], { type: this.mimeType }) });
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
    "501": "打开时钟，啊不是世界时钟，是那个表盘时钟",
    "502": "播放十年，不对，是陈奕迅的十年",
    "503": "关闭留言，准确说关闭留言板窗口",
    "504": "我想听轻松音乐，别继续上一首，重新搜",
    "505": "打开天气，城市先用北京，刚才说错了不是上海",
    "506": "把电视全屏，等下先别全屏，先切 CCTV5",
    "507": "添加待办买票，哦再加一条订酒店",
    "508": "翻译 close message board，只翻译不要执行",
    "509": "搜索王菲红豆，如果识别成王飞请改成王菲",
    "510": "打开表盘时钟，别打开全球时钟列表",
    "511": "我刚说关闭，其实是关闭留言板",
    "512": "音乐上一首不是我要的，重新搜周杰伦晴天",
    "513": "把天气改成杭州，不是广州",
    "514": "我要整理桌面，记得需要弹确认",
    "515": "录音先暂停，不对，是暂停回放",
    "516": "新闻别打开全球指数，只要重大新闻",
    "517": "把计算器放大，算了先聚焦就行",
    "518": "播放 CCTV1，不是 CCTV13",
    "519": "写到便签：关闭留言板，不要真的关闭",
    "520": "如果你没把握，交给 realtime 解析"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MESSAGE_|RECORDER_/.test(await operation());

  const clickDockButton = async (label) => {
    await page.waitForFunction(() => Boolean(document.querySelector(".voice-assistant-dock__confirm button")), null, { timeout: 5_000 }).catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text || button.textContent?.includes(text));
      target?.click();
    }, label);
    await page.waitForTimeout(900);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) await clickDockButton("取消");
  };

  const sendCommand = async (command, waitMs = 1_150, options = {}) => {
    await settlePrompts();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    if (!options.keepConfirmation) await settlePrompts();
  };

  const confirmPendingCommand = async () => {
    await page.getByTestId("voice-assistant-command-input").fill("确认");
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(1_200);
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
          .map((name) => new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
          }))
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
        const noteInput = Array.from(el.querySelectorAll("textarea,input")).find(
          (input) => input.getAttribute("placeholder") === "在这里记录你的想法..."
        );
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.innerText,
          noteContent: noteInput ? noteInput.value : "",
          inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
            placeholder: input.getAttribute("placeholder"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        worldClock: find(["世界时钟", "东京", "伦敦", "纽约"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        messageBoard: find(["留言板"]),
        weather: find(["天气"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        todo: find(["待办"]),
        translate: find(["翻译"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        headline: find(["重大新闻", "头条新闻", "财经新闻"]),
        market: find(["全球指数", "标普500", "上证指数", "恒生指数"]),
        calculator: find(["计算器"]),
        note: find(["便签"]),
        maxZ: Math.max(...widgets.map((widget) => widget.zIndex), 0)
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
    trackId: 11800 + index,
    trackName: query || "纠正测试音乐",
    artistName: query.includes("王菲") ? "王菲" : query.includes("陈奕迅") ? "陈奕迅" : query.includes("周杰伦") ? "周杰伦" : "测试歌手",
    collectionName: "口误纠正测试",
    artworkUrl100: `https://example.test/correction-${index}.jpg`,
    previewUrl: `https://example.test/correction-${index}.m4a`,
    trackViewUrl: `https://example.test/correction-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "纠正测试音乐";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack(term, 0), createTrack(term, 1)] })
    });
  });

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, weather_code: 3, is_day: 1, wind_speed_10m: 9 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21"],
          weather_code: [3, 61, 0],
          temperature_2m_max: [28, 27, 29],
          temperature_2m_min: [19, 18, 20]
        }
      })
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
      risk: tool === "board.auto_align" ? "confirm" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}) => [...addIfNeeded(type), command(tool, { widgetId: existingOrPlanned(type), ...args })];

    if (input === "seed:messageBoard") return addIfNeeded("messageBoard");
    if (input === "seed:music") return [add("music"), command("music.play", { widgetId: planned("music"), query: "上一首测试音乐", kind: "song" })];
    if (input === "seed:recorder") return addIfNeeded("recorder");
    if (input === "seed:recording-start") return withTarget("recorder", "recorder.start");
    if (input === "seed:recording-stop") return withTarget("recorder", "recorder.stop");
    if (input === "seed:recording-play") return withTarget("recorder", "recorder.play");
    if (input === "seed:calculator") return addIfNeeded("calculator");

    if (input === commandText["501"]) return [add("dialClock")];
    if (input === commandText["502"]) return withTarget("music", "music.play", { query: "陈奕迅 十年", kind: "song" });
    if (input === commandText["503"]) return [command("widget.remove", { widgetId: existingOrPlanned("messageBoard") })];
    if (input === commandText["504"]) return withTarget("music", "music.search", { query: "轻松音乐", kind: "song" });
    if (input === commandText["505"]) return [add("weather"), command("weather.set_city", { widgetId: planned("weather"), cityCode: "beijing" })];
    if (input === commandText["506"]) return withTarget("tv", "tv.select_channel", { channelName: "CCTV5", channelUrl: "https://example.test/cctv5.m3u8" });
    if (input === commandText["507"]) return withTarget("todo", "todo.add_item", { text: "买票" }).concat(command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "订酒店" }));
    if (input === commandText["508"]) return withTarget("translate", "translate.set_draft", { sourceText: "close message board", targetLang: "zh-CN" });
    if (input === commandText["509"]) return withTarget("music", "music.search", { query: "王菲 红豆", kind: "song" });
    if (input === commandText["510"]) return [add("dialClock")];
    if (input === commandText["511"]) return [command("widget.remove", { widgetId: existingOrPlanned("messageBoard") })];
    if (input === commandText["512"]) return withTarget("music", "music.search", { query: "周杰伦 晴天", kind: "song" });
    if (input === commandText["513"]) return withTarget("weather", "weather.set_city", { cityCode: "hangzhou" });
    if (input === commandText["514"]) return [command("board.auto_align", {})];
    if (input === commandText["515"]) return withTarget("recorder", "recorder.pause");
    if (input === commandText["516"]) return withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T11:45:00.000Z" });
    if (input === commandText["517"]) return [command("widget.focus", { widgetId: existingOrPlanned("calculator") })];
    if (input === commandText["518"]) return withTarget("tv", "tv.play", { channelName: "CCTV1", channelUrl: "https://example.test/cctv1.m3u8" });
    if (input === commandText["519"]) return withTarget("note", "note.write", { content: "关闭留言板", mode: "append" });
    if (input === commandText["520"]) return [];
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
    if (targetInputs.has(input)) {
      realtimeHits.push({ input, phase, matched: true, tools: commands.map((item) => item.tool), args: commands.map((item) => item.args) });
    }
    if (commands.length === 0) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ call: null, selection: null, planSelection: { steps: [] } }) });
      return;
    }

    const addedTypes = new Set(commands.filter((item) => item.tool === "board.add_widget").map((item) => String(item.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0]));
    const fallbackByType = {
      dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
      music: ["音乐播放器", "Apple Music", "试听"],
      messageBoard: ["留言板"],
      weather: ["天气"],
      tv: ["电视播放", "CCTV", "央视"],
      todo: ["待办"],
      translate: ["翻译"],
      recorder: ["录音机", "录音中", "录音 "],
      headline: ["重大新闻", "头条新闻", "财经新闻"],
      calculator: ["计算器"],
      note: ["便签"]
    };
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) continue;
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) continue;
      const existingWidgetId = await widgetIdFromDom(fallbackByType[type] ?? []);
      if (existingWidgetId) item.args.widgetId = existingWidgetId;
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
      const plannedCommands = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, module: "correction-negation", ...item }));
      for (const [index, commandItem] of plannedCommands.entries()) {
        const widgetIdArg = typeof commandItem.args?.widgetId === "string" ? commandItem.args.widgetId : "";
        const plannedType = widgetIdArg.startsWith("planned_widget_") ? widgetIdArg.slice("planned_widget_".length) : "";
        if (!plannedType) continue;
        const addDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.add_widget" && String(candidate.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0] === plannedType);
        if (addDependency) commandItem.dependsOn = [...(commandItem.dependsOn ?? []), addDependency.id];
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_plan_${Date.now()}`,
            sourceText: input,
            normalizedText: input,
            commands: plannedCommands,
            dependencies: [],
            executionGroups: plannedCommands.map((item, index) => ({ id: `group_${index + 1}`, mode: "sequential", commandIds: [item.id] })),
            confidence: 0.94,
            needsConfirmation: plannedCommands.some((item) => item.risk !== "safe"),
            createdBy: "text-llm",
            requiresHarnessValidation: true
          }
        })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ call: null, selection: null }) });
  };

  await page.route("**/api/realtime/tool-call", mockRealtimePlan);

  const ensureWidget = async (seedCommand, key, waitMs = 1_000) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(seedCommand, waitMs);
    state = await snapshot();
    return state[key];
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    for (const key of ["dialClock", "music", "messageBoard", "weather", "tv", "todo", "translate", "recorder", "headline", "calculator", "note"]) {
      forcedWidgetIds[key] = state[key]?.id;
    }
  };

  const waitForRecordingItem = async () => {
    await page.waitForFunction(() => /录音\s+\d|录音\s+[0-9:]/.test(document.body.innerText), null, { timeout: 4_000 }).catch(() => undefined);
  };

  const seedRecordingPlayback = async () => {
    await ensureWidget("seed:recorder", "recorder");
    await captureForcedIds();
    await sendCommand("seed:recording-start", 1_200);
    await sendCommand("seed:recording-stop", 1_500);
    await waitForRecordingItem();
    await captureForcedIds();
    await sendCommand("seed:recording-play", 900);
  };

  const seedBase = async (id) => {
    if (["503", "508", "511", "519"].includes(id)) await ensureWidget("seed:messageBoard", "messageBoard");
    if (["504", "512"].includes(id)) await ensureWidget("seed:music", "music", 1_200);
    if (id === "515") await seedRecordingPlayback();
    if (id === "517") await ensureWidget("seed:calculator", "calculator");
  };

  const push = async (id, passed, evidence) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-6);
    const realtimeOk = relatedRealtimeHits.length > 0;
    results.push({ id, command, passed: Boolean(passed && realtimeOk), operation: await operation(), evidence: `${evidence}; realtimeHits=${JSON.stringify(relatedRealtimeHits)}${realtimeOk ? "" : "; missingRealtimeRoute=true"}` });
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], id === "514" ? 1_200 : 1_500, { keepConfirmation: id === "514" });
    if (id === "514") await confirmPendingCommand();
    await page.waitForTimeout(500);
    const state = await snapshot();
    const ok = await noAssistantError();
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;
    const op = await operation();

    if (id === "501") await push(id, Boolean(state.dialClock) && !state.worldClock && ok, `dial=${Boolean(state.dialClock)}; worldClock=${Boolean(state.worldClock)}`);
    else if (id === "502") await push(id, /陈奕迅 十年|十年/.test(state.music?.text ?? "") && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 400))}`);
    else if (id === "503") await push(id, !state.messageBoard && ok, `messageBoard=${Boolean(state.messageBoard)}`);
    else if (id === "504") await push(id, /轻松音乐/.test(state.music?.text ?? "") && !/上一首/.test(op) && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 500))}; operation=${JSON.stringify(op)}`);
    else if (id === "505") await push(id, /北京/.test(state.weather?.text ?? "") && !/上海/.test(state.weather?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    else if (id === "506") await push(id, /CCTV5|体育/.test(state.tv?.text ?? "") && !/全屏/.test(op) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}; operation=${JSON.stringify(op)}`);
    else if (id === "507") await push(id, /买票/.test(state.todo?.text ?? "") && /订酒店/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    else if (id === "508") await push(id, /close message board|关闭留言板/.test(JSON.stringify(state.translate?.inputs ?? []) + (state.translate?.text ?? "")) && Boolean(state.messageBoard) && ok, `translate=${JSON.stringify((state.translate?.text || "").slice(0, 500))}; messageBoard=${Boolean(state.messageBoard)}`);
    else if (id === "509") await push(id, /王菲 红豆|王菲|红豆/.test(state.music?.text ?? "") && !/王飞/.test(state.music?.text ?? "") && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`);
    else if (id === "510") await push(id, Boolean(state.dialClock) && !state.worldClock && !state.market && ok, `dial=${Boolean(state.dialClock)}; worldClock=${Boolean(state.worldClock)}; market=${Boolean(state.market)}`);
    else if (id === "511") await push(id, !state.messageBoard && ok, `messageBoard=${Boolean(state.messageBoard)}`);
    else if (id === "512") await push(id, /周杰伦 晴天|周杰伦|晴天/.test(state.music?.text ?? "") && !/上一首/.test(op) && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 500))}; operation=${JSON.stringify(op)}`);
    else if (id === "513") await push(id, /杭州/.test(state.weather?.text ?? "") && !/广州/.test(state.weather?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    else if (id === "514") await push(id, /已整理桌面|完成|board\.auto_align/.test(op) && ok, `operation=${JSON.stringify(op)}`);
    else if (id === "515") await push(id, /已暂停录音|完成/.test(op) && ok, `operation=${JSON.stringify(op)}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 500))}`);
    else if (id === "516") await push(id, Boolean(state.headline) && !state.market && ok, `headline=${Boolean(state.headline)}; market=${Boolean(state.market)}`);
    else if (id === "517") await push(id, /is-focused/.test(state.calculator?.className ?? "") && ok, `calculatorClass=${state.calculator?.className}; operation=${JSON.stringify(op)}`);
    else if (id === "518") await push(id, /CCTV1|综合/.test(state.tv?.text ?? "") && !/CCTV13|CCTV-13/.test(state.tv?.text ?? "") && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    else if (id === "519") await push(id, /关闭留言板/.test(noteText) && Boolean(state.messageBoard) && ok, `note=${JSON.stringify(noteText.slice(0, 500))}; messageBoard=${Boolean(state.messageBoard)}`);
    else if (id === "520") await push(id, /没听懂|再说短一点|需要/.test(op) && ok, `operation=${JSON.stringify(op)}; widgets=${state.widgets.length}`);
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageCorrectionNegationResults = value;
    let pre = document.getElementById("xz-real-page-correction-negation-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-correction-negation-results";
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
  if (failed.length > 0) throw new Error(`Correction/negation real-page group failed: ${failed.length}/${results.length}`);
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
