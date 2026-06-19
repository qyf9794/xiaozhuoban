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
    "481": "播放陈奕迅十年，同时查上海天气并写到便签",
    "482": "打开电视 CCTV13，再刷新新闻，最后暂停音乐",
    "483": "查北京天气，如果适合出门就加待办买咖啡",
    "484": "打开市场行情、重大新闻和纽约时间，排成一列",
    "485": "开始录音，设四十五分钟倒计时，并打开会议便签",
    "486": "搜索轻松音乐但先不播放，然后打开待办",
    "487": "把 hello world 翻译成中文，再复制到剪贴板",
    "488": "新建旅行桌板，打开杭州天气和东京时间",
    "489": "关闭留言板，再把音乐播放器放最前",
    "490": "播放王菲红豆后，三分钟后提醒我检查是否试听",
    "491": "打开表盘时钟而不是世界时钟，然后隐藏侧栏",
    "492": "把电视切到 CCTV5，再把体育新闻刷新一下",
    "493": "清理剪贴板普通记录，再把项目口令固定",
    "494": "添加待办提交报告，同时明早九点提醒",
    "495": "计算两公斤是多少克，把结果发到留言板",
    "496": "天气改成武汉，世界时钟改成北京伦敦纽约",
    "497": "把音乐暂停，开始录音，然后打开倒计时",
    "498": "新建学习桌板并打开翻译、计算器、便签",
    "499": "刷新新闻后把摘要追加到便签并复制",
    "500": "退出全屏，显示侧边栏，再整理桌面"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MESSAGE_|RECORDER_/.test(await operation());

  const clickDockButton = async (label) => {
    await page.waitForFunction(
      () => Boolean(document.querySelector(".voice-assistant-dock__confirm button")),
      null,
      { timeout: 5_000 }
    ).catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text || button.textContent?.includes(text));
      target?.click();
    }, label);
    await page.waitForTimeout(900);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) {
      await clickDockButton("取消");
    }
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
        activeBoard: document.querySelector("[data-active-board-name]")?.getAttribute("data-active-board-name") || document.body.innerText,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        weather: find(["天气"]),
        note: find(["便签"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        headline: find(["重大新闻", "头条新闻", "财经新闻"]),
        market: find(["全球指数", "标普500", "上证指数", "恒生指数"]),
        worldClock: find(["世界时钟", "东京", "伦敦", "纽约"]),
        countdown: find(["倒计时"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        todo: find(["待办"]),
        translate: find(["翻译"]),
        clipboard: find(["剪贴板"]),
        messageBoard: find(["留言板"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        calculator: find(["计算器"]),
        converter: find(["换算", "单位"]),
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
    trackId: 10800 + index,
    trackName: query || "测试歌曲",
    artistName: query.includes("王菲") ? "王菲" : query.includes("陈奕迅") ? "陈奕迅" : "测试歌手",
    collectionName: "跨工具测试",
    artworkUrl100: `https://example.test/cross-tool-${index}.jpg`,
    previewUrl: `https://example.test/cross-tool-${index}.m4a`,
    trackViewUrl: `https://example.test/cross-tool-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "测试歌曲";
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
      risk: tool === "board.auto_align" || tool === "clipboard.clear" ? "confirm" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}) => [...addIfNeeded(type), command(tool, { widgetId: existingOrPlanned(type), ...args })];

    if (input === "seed:messageBoard") return [add("messageBoard")];
    if (input === "seed:music") return [add("music"), command("music.play", { widgetId: planned("music"), query: "测试歌曲", kind: "song" })];
    if (input === "seed:tv") return [add("tv"), command("tv.play", { widgetId: planned("tv"), channelName: "CCTV13", channelUrl: "https://example.test/cctv13.m3u8" })];
    if (input === "seed:clipboard") return [add("clipboard"), command("clipboard.add_text", { widgetId: planned("clipboard"), text: "普通测试记录" })];
    if (input === "seed:fullscreen") return [command("app.fullscreen.set", { mode: "enter" }), command("app.sidebar.set", { mode: "hide" })];

    if (input === commandText["481"]) return [
      ...withTarget("music", "music.play", { query: "陈奕迅 十年", kind: "song" }),
      ...withTarget("weather", "weather.set_city", { cityCode: "shanghai" }),
      ...withTarget("note", "note.write", { content: "上海天气摘要：22°C，多云；陈奕迅 十年已播放", mode: "append" })
    ];
    if (input === commandText["482"]) return [
      ...withTarget("tv", "tv.play", { channelName: "CCTV13", channelUrl: "https://example.test/cctv13.m3u8" }),
      ...withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T11:20:00.000Z" }),
      command("music.pause", { widgetId: existingOrPlanned("music") })
    ];
    if (input === commandText["483"]) return [
      ...withTarget("weather", "weather.set_city", { cityCode: "beijing" }),
      ...withTarget("todo", "todo.add_item", { text: "买咖啡" })
    ];
    if (input === commandText["484"]) return [
      ...withTarget("market", "market.set_indices", { indexCodes: ["usINX", "usNDX", "usDJI"] }),
      ...withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T11:20:00.000Z" }),
      ...withTarget("worldClock", "worldClock.set_zones", { zones: ["America/New_York"] }),
      command("widget.move", { widgetId: existingOrPlanned("market"), x: 460, y: 60 }),
      command("widget.move", { widgetId: existingOrPlanned("headline"), x: 460, y: 330 }),
      command("widget.move", { widgetId: existingOrPlanned("worldClock"), x: 460, y: 600 })
    ];
    if (input === commandText["485"]) return [
      ...withTarget("recorder", "recorder.start"),
      ...withTarget("countdown", "countdown.set", { totalSeconds: 2700, start: true, label: "会议" }),
      ...withTarget("note", "note.write", { content: "会议便签", mode: "append" })
    ];
    if (input === commandText["486"]) return [
      ...withTarget("music", "music.search", { query: "轻松音乐", kind: "song" }),
      ...addIfNeeded("todo")
    ];
    if (input === commandText["487"]) return [
      ...withTarget("translate", "translate.set_draft", { sourceText: "hello world", targetLang: "zh-CN" }),
      ...withTarget("clipboard", "clipboard.add_text", { text: "你好，世界" })
    ];
    if (input === commandText["488"]) return [
      command("board.create", { name: "旅行" }),
      add("weather"),
      command("weather.set_city", { widgetId: planned("weather"), cityCode: "hangzhou" }),
      add("worldClock"),
      command("worldClock.set_zones", { widgetId: planned("worldClock"), zones: ["Asia/Tokyo"] })
    ];
    if (input === commandText["489"]) return [
      command("widget.remove", { widgetId: existingOrPlanned("messageBoard") }),
      command("widget.bring_to_front", { widgetId: existingOrPlanned("music") })
    ];
    if (input === commandText["490"]) return [
      ...withTarget("music", "music.play", { query: "王菲 红豆", kind: "song" }),
      ...withTarget("countdown", "countdown.set", { totalSeconds: 180, start: true, label: "检查是否试听" }),
      ...withTarget("todo", "todo.add_item", { text: "检查是否试听" })
    ];
    if (input === commandText["491"]) return [add("dialClock"), command("app.sidebar.set", { mode: "hide" })];
    if (input === commandText["492"]) return [
      ...withTarget("tv", "tv.select_channel", { channelName: "CCTV5", channelUrl: "https://example.test/cctv5.m3u8" }),
      ...withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T11:20:00.000Z" })
    ];
    if (input === commandText["493"]) return [
      command("clipboard.clear", { widgetId: existingOrPlanned("clipboard"), preservePinned: true }),
      command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "项目口令 demo-token", pinned: true })
    ];
    if (input === commandText["494"]) return [
      ...withTarget("todo", "todo.add_item", { text: "提交报告；明早九点提醒" })
    ];
    if (input === commandText["495"]) return [
      ...withTarget("converter", "converter.set", { category: "weight", value: "2", fromUnit: "kg", toUnit: "g" }),
      ...withTarget("messageBoard", "messageBoard.send", { text: "两公斤 = 2000 克" })
    ];
    if (input === commandText["496"]) return [
      ...withTarget("weather", "weather.set_city", { cityCode: "wuhan" }),
      ...withTarget("worldClock", "worldClock.set_zones", { zones: ["北京", "Europe/London", "America/New_York"] })
    ];
    if (input === commandText["497"]) return [
      command("music.pause", { widgetId: existingOrPlanned("music") }),
      ...withTarget("recorder", "recorder.start"),
      ...withTarget("countdown", "countdown.set", { totalSeconds: 300, start: true, label: "录音" })
    ];
    if (input === commandText["498"]) return [command("board.create", { name: "学习" }), add("translate"), add("calculator"), add("note")];
    if (input === commandText["499"]) return [
      ...withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T11:20:00.000Z" }),
      ...withTarget("note", "note.write", { content: "新闻摘要：Realtime 分级加载继续验证", mode: "append" }),
      ...withTarget("clipboard", "clipboard.add_text", { text: "新闻摘要：Realtime 分级加载继续验证" })
    ];
    if (input === commandText["500"]) return [
      command("app.fullscreen.set", { mode: "exit" }),
      command("app.sidebar.set", { mode: "show" }),
      command("board.auto_align", {})
    ];
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
    const addedTypes = new Set(commands.filter((item) => item.tool === "board.add_widget").map((item) => String(item.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0]));
    const fallbackByType = {
      music: ["音乐播放器", "Apple Music", "试听"],
      weather: ["天气"],
      note: ["便签"],
      tv: ["电视播放", "CCTV", "央视"],
      headline: ["重大新闻", "头条新闻", "财经新闻"],
      market: ["全球指数", "标普500", "上证指数"],
      worldClock: ["世界时钟", "东京", "伦敦", "纽约"],
      countdown: ["倒计时"],
      recorder: ["录音机", "录音中", "录音 "],
      todo: ["待办"],
      translate: ["翻译"],
      clipboard: ["剪贴板"],
      messageBoard: ["留言板"],
      dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
      calculator: ["计算器"],
      converter: ["换算", "单位"]
    };
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) continue;
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) continue;
      const existingWidgetId = await widgetIdFromDom(fallbackByType[type] ?? []);
      if (existingWidgetId) item.args.widgetId = existingWidgetId;
    }
    if (targetInputs.has(input)) {
      realtimeHits.push({ input, phase, matched: true, tools: commands.map((item) => item.tool), args: commands.map((item) => item.args) });
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
      const plannedCommands = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, module: "cross-tool-workflow", ...item }));
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
    await route.continue();
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
    for (const key of ["music", "weather", "note", "tv", "headline", "market", "worldClock", "countdown", "recorder", "todo", "translate", "clipboard", "messageBoard", "dialClock", "calculator", "converter"]) {
      forcedWidgetIds[key] = state[key]?.id;
    }
  };

  const seedBase = async (id) => {
    if (["482", "489", "497"].includes(id)) await ensureWidget("seed:music", "music", 1_200);
    if (id === "489") await ensureWidget("seed:messageBoard", "messageBoard");
    if (id === "492") await ensureWidget("seed:tv", "tv", 1_200);
    if (id === "493") await ensureWidget("seed:clipboard", "clipboard");
    if (id === "500") await sendCommand("seed:fullscreen", 1_000);
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
    await sendCommand(commandText[id], ["493", "500"].includes(id) ? 1_200 : 1_700, { keepConfirmation: ["493", "500"].includes(id) });
    if (["493", "500"].includes(id)) await confirmPendingCommand();
    await page.waitForTimeout(700);
    const state = await snapshot();
    const ok = await noAssistantError();
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;

    if (id === "481") await push(id, /陈奕迅 十年|十年/.test(state.music?.text ?? "") && /上海/.test(state.weather?.text ?? "") && /上海天气摘要/.test(noteText) && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 400))}; weather=${JSON.stringify((state.weather?.text || "").slice(0, 400))}; note=${JSON.stringify(noteText.slice(0, 400))}`);
    else if (id === "482") await push(id, /CCTV13|CCTV-13|新闻/.test(state.tv?.text ?? "") && Boolean(state.headline) && Boolean(state.music) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 400))}; headline=${Boolean(state.headline)}; music=${Boolean(state.music)}`);
    else if (id === "483") await push(id, /北京/.test(state.weather?.text ?? "") && /买咖啡/.test(state.todo?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 400))}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 400))}`);
    else if (id === "484") await push(id, Boolean(state.market) && Boolean(state.headline) && /纽约|New York/.test(state.worldClock?.text ?? "") && (state.market?.rect.x ?? 0) > 350 && ok, `market=${JSON.stringify(state.market?.rect)}; headline=${JSON.stringify(state.headline?.rect)}; worldClock=${JSON.stringify(state.worldClock?.rect)}`);
    else if (id === "485") await push(id, /录音中|停止录音/.test(state.recorder?.text ?? "") && /45:00|44:/.test(state.countdown?.text ?? "") && /会议便签/.test(noteText) && ok, `recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 300))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}; note=${JSON.stringify(noteText.slice(0, 300))}`);
    else if (id === "486") await push(id, /轻松音乐/.test(state.music?.text ?? "") && Boolean(state.todo) && !/正在播放|暂停/.test(state.music?.text ?? "") && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 500))}; todo=${Boolean(state.todo)}`);
    else if (id === "487") await push(id, /hello world|你好/.test(JSON.stringify(state.translate?.inputs ?? []) + (state.translate?.text ?? "")) && /你好，世界/.test(state.clipboard?.text ?? "") && ok, `translate=${JSON.stringify((state.translate?.text || "").slice(0, 400))}; clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 400))}`);
    else if (id === "488") await push(id, /旅行/.test(state.bodyText) && /杭州/.test(state.weather?.text ?? "") && /东京/.test(state.worldClock?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 400))}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 400))}`);
    else if (id === "489") await push(id, !state.messageBoard && state.music?.zIndex === state.maxZ && ok, `messageBoard=${Boolean(state.messageBoard)}; musicZ=${state.music?.zIndex}/${state.maxZ}`);
    else if (id === "490") await push(id, /王菲 红豆|红豆/.test(state.music?.text ?? "") && /03:00|02:/.test(state.countdown?.text ?? "") && /检查是否试听/.test(state.todo?.text ?? "") && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 400))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    else if (id === "491") await push(id, Boolean(state.dialClock) && !state.worldClock && /隐藏侧栏|侧边栏已隐藏|已隐藏|完成/.test(await operation()) && ok, `dial=${Boolean(state.dialClock)}; worldClock=${Boolean(state.worldClock)}; operation=${JSON.stringify(await operation())}`);
    else if (id === "492") await push(id, /CCTV5|体育/.test(state.tv?.text ?? "") && Boolean(state.headline) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 400))}; headline=${Boolean(state.headline)}`);
    else if (id === "493") await push(id, /项目口令 demo-token/.test(state.clipboard?.text ?? "") && !/普通测试记录/.test(state.clipboard?.text ?? "") && ok, `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 500))}`);
    else if (id === "494") await push(id, /提交报告/.test(state.todo?.text ?? "") && /明早九点/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    else if (id === "495") await push(id, /2000|2,000/.test(state.converter?.text ?? "") && /两公斤 = 2000 克/.test(state.messageBoard?.text ?? "") && ok, `converter=${JSON.stringify((state.converter?.text || "").slice(0, 400))}; messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 400))}`);
    else if (id === "496") await push(id, /武汉/.test(state.weather?.text ?? "") && /北京/.test(state.worldClock?.text ?? "") && /伦敦/.test(state.worldClock?.text ?? "") && /纽约/.test(state.worldClock?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 400))}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 500))}`);
    else if (id === "497") await push(id, Boolean(state.music) && /录音中|停止录音/.test(state.recorder?.text ?? "") && Boolean(state.countdown) && ok, `music=${Boolean(state.music)}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 300))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}`);
    else if (id === "498") await push(id, /学习/.test(state.bodyText) && Boolean(state.translate) && Boolean(state.calculator) && Boolean(state.note) && ok, `translate=${Boolean(state.translate)}; calculator=${Boolean(state.calculator)}; note=${Boolean(state.note)}`);
    else if (id === "499") await push(id, Boolean(state.headline) && /新闻摘要/.test(noteText) && /新闻摘要/.test(state.clipboard?.text ?? "") && ok, `headline=${Boolean(state.headline)}; note=${JSON.stringify(noteText.slice(0, 400))}; clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 400))}`);
    else if (id === "500") await push(id, /已整理桌面|完成|board\.auto_align/.test(await operation()) && ok, `operation=${JSON.stringify(await operation())}; body=${JSON.stringify(state.bodyText.slice(0, 400))}`);
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageCrossToolWorkflowResults = value;
    let pre = document.getElementById("xz-real-page-cross-tool-workflow-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-cross-tool-workflow-results";
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
  if (failed.length > 0) throw new Error(`Cross-tool workflow real-page group failed: ${failed.length}/${results.length}`);
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
