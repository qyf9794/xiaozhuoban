const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();

  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
  });

  const commandText = {
    "541": "把表盘时钟调暗一点，进入夜间模式",
    "542": "音乐封面太小了，把播放器面板放大",
    "543": "电视窗口太挡眼，缩小并放到右上角",
    "544": "隐藏侧栏让桌面更宽，但保留所有小工具",
    "545": "把音乐播放控件居中，登录按钮别挡封面",
    "546": "倒计时声音太像计时器，先暂停倒计时",
    "547": "把天气卡片放大一点方便读温度",
    "548": "把新闻窗口缩小，避免挡住便签",
    "549": "音乐窗口不要全屏，只把封面放大",
    "550": "把表盘放到中间并打开夜间模式",
    "551": "电视全屏时隐藏侧边栏",
    "552": "把世界时钟文字放大，显示北京伦敦纽约",
    "553": "让待办窗口宽一点，长文本不要折断",
    "554": "把剪贴板窗口移到右侧并缩窄",
    "555": "显示侧边栏，但不要压缩音乐封面",
    "556": "退出全屏后把音乐播放器恢复正常大小",
    "557": "让录音机窗口别盖住倒计时",
    "558": "把翻译窗口调宽，方便输入长英文",
    "559": "把桌面布局排紧凑一点",
    "560": "音乐登录按钮放右上角但不要覆盖封面"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|PLAN_VALIDATION/.test(await operation());

  const clickDockButton = async (label) => {
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(400);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn|待确认/.test(dockText)) {
      await clickDockButton("取消");
    }
  };

  const sendCommand = async (command, waitMs = 1_000) => {
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
          inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
            placeholder: input.getAttribute("placeholder"),
            ariaLabel: input.getAttribute("aria-label"),
            value: input.value
          })),
          dialNightMode: Boolean(el.querySelector(".dial-clock-widget.is-night-mode"))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        sidebarVisible: Boolean(document.querySelector(".sidebar-panel")),
        widgets,
        maxZ: Math.max(...widgets.map((widget) => widget.zIndex), 0),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        weather: find(["天气"]),
        headline: find(["重大新闻", "新闻"]),
        note: find(["便签"]),
        countdown: find(["倒计时"]),
        worldClock: find(["世界时钟"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        todo: find(["待办"]),
        clipboard: find(["剪贴板"]),
        recorder: find(["录音机", "开始录音", "停止录音", "正在录音"]),
        translate: find(["翻译"])
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

  const overlapArea = (a, b) => {
    if (!a || !b) return 0;
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  };

  const createTrack = (query, index = 0) => ({
    wrapperType: "track",
    kind: "song",
    trackId: 56_000 + index,
    trackName: query || "窗口测试音乐",
    artistName: "测试歌手",
    collectionName: "窗口调整测试",
    artworkUrl100: `https://example.test/window-state-${index}.jpg`,
    previewUrl: `https://example.test/window-state-${index}.m4a`,
    trackViewUrl: `https://example.test/window-state-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "窗口测试音乐";
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
        current: { temperature_2m: 23, weather_code: 1, is_day: 1, wind_speed_10m: 5 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"],
          weather_code: [1, 2, 3, 0],
          temperature_2m_max: [28, 29, 30, 27],
          temperature_2m_min: [20, 21, 22, 19]
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
    const existingOrPlanned = (type) => widgetId(type) ?? planned(type);
    const viewport = page.viewportSize() || { width: 1440, height: 1000 };
    const command = (tool, args = {}, risk = "safe") => ({
      tool,
      args,
      risk,
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}, risk = "safe") => [
      ...addIfNeeded(type),
      command(tool, { widgetId: existingOrPlanned(type), ...args }, risk)
    ];

    if (input === "seed:music") return withTarget("music", "music.search", { query: "窗口测试音乐" });
    if (input === "seed:tv") {
      return [
        ...withTarget("tv", "tv.play", { channelName: "CCTV1", channelUrl: "https://example.test/cctv1.m3u8" }),
        command("widget.resize", { widgetId: existingOrPlanned("tv"), w: 560, h: 360 })
      ];
    }
    if (input === "seed:dialClock") return addIfNeeded("dialClock");
    if (input === "seed:weather") return withTarget("weather", "weather.set_city", { cityCode: "beijing" });
    if (input === "seed:headline-note") {
      return [
        ...addIfNeeded("headline"),
        command("widget.resize", { widgetId: existingOrPlanned("headline"), w: 520, h: 360 }),
        ...addIfNeeded("note")
      ];
    }
    if (input === "seed:countdown") return withTarget("countdown", "countdown.set", { totalSeconds: 1500, start: true, label: "专注" });
    if (input === "seed:worldClock") return withTarget("worldClock", "worldClock.set_zones", { zones: ["Asia/Shanghai", "Europe/London", "America/New_York"] });
    if (input === "seed:todo") return withTarget("todo", "todo.add_item", { text: "这是一条很长很长的待办文本用于窗口宽度测试" });
    if (input === "seed:clipboard") {
      return [
        ...withTarget("clipboard", "clipboard.add_text", { text: "这是一条很长的剪贴板记录，用于窗口缩窄测试" }),
        command("widget.resize", { widgetId: existingOrPlanned("clipboard"), w: 440, h: 320 })
      ];
    }
    if (input === "seed:recorder-countdown") return [...addIfNeeded("recorder"), ...withTarget("countdown", "countdown.set", { totalSeconds: 900, start: true, label: "录音参照" })];
    if (input === "seed:translate") return withTarget("translate", "translate.set_draft", { sourceText: "This is a long English sentence for resize testing.", sourceLang: "en", targetLang: "zh-CN" });

    if (input === commandText["541"]) return withTarget("dialClock", "dialClock.set_night_mode", { enabled: true });
    if (input === commandText["542"]) return withTarget("music", "widget.resize", { w: 560, h: 640 });
    if (input === commandText["543"]) return [command("widget.resize", { widgetId: existingOrPlanned("tv"), w: 320, h: 220 }), command("widget.move", { widgetId: existingOrPlanned("tv"), x: 780, y: 24 })];
    if (input === commandText["544"]) return [command("app.sidebar.set", { mode: "hide" })];
    if (input === commandText["545"]) return [];
    if (input === commandText["546"]) return withTarget("countdown", "countdown.pause");
    if (input === commandText["547"]) return withTarget("weather", "widget.resize", { w: 420, h: 360 });
    if (input === commandText["548"]) return [command("widget.resize", { widgetId: existingOrPlanned("headline"), w: 280, h: 220 }), command("widget.move", { widgetId: existingOrPlanned("headline"), x: 760, y: 120 })];
    if (input === commandText["549"]) return [command("app.fullscreen.set", { mode: "exit" }), command("widget.resize", { widgetId: existingOrPlanned("music"), w: 560, h: 640 })];
    if (input === commandText["550"]) return [command("widget.move", { widgetId: existingOrPlanned("dialClock"), x: 560, y: 200 }), command("dialClock.set_night_mode", { widgetId: existingOrPlanned("dialClock"), enabled: true })];
    if (input === commandText["551"]) return [command("app.sidebar.set", { mode: "hide" }), command("tv.fullscreen", { widgetId: existingOrPlanned("tv") })];
    if (input === commandText["552"]) return [command("widget.resize", { widgetId: existingOrPlanned("worldClock"), w: 520, h: 360 }), command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["Asia/Shanghai", "Europe/London", "America/New_York"] })];
    if (input === commandText["553"]) return [command("widget.resize", { widgetId: existingOrPlanned("todo"), w: 560, h: 360 })];
    if (input === commandText["554"]) return [command("widget.move", { widgetId: existingOrPlanned("clipboard"), x: 780, y: 120 }), command("widget.resize", { widgetId: existingOrPlanned("clipboard"), w: 260, h: 320 })];
    if (input === commandText["555"]) return [command("app.sidebar.set", { mode: "show" }), command("widget.resize", { widgetId: existingOrPlanned("music"), w: 560, h: 640 })];
    if (input === commandText["556"]) return [command("app.fullscreen.set", { mode: "exit" }), command("widget.resize", { widgetId: existingOrPlanned("music"), w: 520, h: 560 })];
    if (input === commandText["557"]) return [command("widget.move", { widgetId: existingOrPlanned("recorder"), x: 920, y: 120 })];
    if (input === commandText["558"]) return [command("widget.resize", { widgetId: existingOrPlanned("translate"), w: 600, h: 360 })];
    if (input === commandText["559"]) return [command("board.auto_align", { viewportWidth: viewport.width }, "confirm")];
    if (input === commandText["560"]) return [];
    return null;
  };

  const hydrateMissingWidgetIds = async (commands) => {
    const fallbackByType = {
      music: ["音乐播放器", "Apple Music", "试听"],
      tv: ["电视播放", "CCTV", "央视"],
      dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
      countdown: ["倒计时"],
      weather: ["天气"],
      headline: ["重大新闻", "新闻"],
      worldClock: ["世界时钟"],
      todo: ["待办"],
      clipboard: ["剪贴板"],
      recorder: ["录音机", "开始录音", "停止录音", "正在录音"],
      translate: ["翻译"]
    };
    for (const item of commands) {
      const widgetId = typeof item.args?.widgetId === "string" ? item.args.widgetId : "";
      if (!widgetId.startsWith("planned_widget_")) continue;
      const type = widgetId.slice("planned_widget_".length);
      const fallback = fallbackByType[type];
      if (!fallback) continue;
      const existingWidgetId = await widgetIdFromDom(fallback);
      if (existingWidgetId) item.args.widgetId = existingWidgetId;
    }
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
    await hydrateMissingWidgetIds(commands);
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_plan_${Date.now()}`,
            sourceText: input,
            commands: plannedCommands,
            executionGroups: plannedCommands.map((item) => ({ mode: "sequential", commandIds: [item.id] })),
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

  const seedFor = async (id) => {
    const seeds = {
      "541": ["seed:dialClock"],
      "542": ["seed:music"],
      "543": ["seed:tv"],
      "544": ["seed:music", "seed:tv", "seed:weather"],
      "545": ["seed:music"],
      "546": ["seed:countdown"],
      "547": ["seed:weather"],
      "548": ["seed:headline-note"],
      "549": ["seed:music"],
      "550": ["seed:dialClock"],
      "551": ["seed:tv"],
      "552": ["seed:worldClock"],
      "553": ["seed:todo"],
      "554": ["seed:clipboard"],
      "555": ["seed:music"],
      "556": ["seed:music"],
      "557": ["seed:recorder-countdown"],
      "558": ["seed:translate"],
      "559": ["seed:music", "seed:tv", "seed:weather"],
      "560": ["seed:music"]
    }[id] ?? [];
    for (const seed of seeds) {
      await sendCommand(seed, 1_100);
    }
  };

  const push = async (id, passed, details) => {
    const command = commandText[id];
    const executeHit = realtimeHits.find((item) => item.input === command && item.phase === "plan_execute");
    const hit = executeHit ?? realtimeHits.find((item) => item.input === command);
    const realtimeOk = Boolean(hit);
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      tools: hit?.tools ?? [],
      details: `${details}${realtimeOk ? "" : "; missingRealtimeRoute=true"}`
    });
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    realtimeHits.length = 0;
    targetInputs.clear();
    await seedFor(id);
    await page.waitForTimeout(500);
    const before = await snapshot();
    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], id === "559" ? 1_100 : 1_300);
    const op = await operation();
    const ok = await noAssistantError();
    if (id === "559" && /待确认/.test(op)) {
      await clickDockButton("确认");
      await page.waitForTimeout(1_000);
    }
    const state = await snapshot();
    const maxZ = Math.max(...state.widgets.map((widget) => widget.zIndex), 0);

    if (id === "541") {
      await push(id, state.dialClock?.dialNightMode === true && ok, `dialClass=${state.dialClock?.className} night=${state.dialClock?.dialNightMode}`);
    } else if (id === "542") {
      await push(id, (state.music?.rect.w ?? 0) > (before.music?.rect.w ?? 0) + 120 && !/窗口测试音乐.*播放/.test(op) && ok, `before=${JSON.stringify(before.music?.rect)} after=${JSON.stringify(state.music?.rect)} op=${op}`);
    } else if (id === "543") {
      await push(id, Boolean(state.tv && state.tv.rect.w < (before.tv?.rect.w ?? 999) && state.tv.rect.x > 900 && ok), `tvBefore=${JSON.stringify(before.tv?.rect)} tvAfter=${JSON.stringify(state.tv?.rect)}`);
    } else if (id === "544") {
      await push(id, !state.sidebarVisible && state.widgets.length === before.widgets.length && ok, `sidebar=${state.sidebarVisible} widgets=${state.widgets.length}/${before.widgets.length}`);
    } else if (id === "545") {
      await push(id, Boolean(state.music) && !/music\.play|已播放|播放/.test(op) && ok, `op=${JSON.stringify(op)} music=${JSON.stringify(state.music?.rect)}`);
    } else if (id === "546") {
      const beforeText = before.countdown?.text ?? "";
      await page.waitForTimeout(1_200);
      const later = await snapshot();
      await push(id, Boolean(state.countdown && later.countdown?.text === state.countdown.text && beforeText !== "" && ok), `before=${JSON.stringify(beforeText.slice(0, 120))} after=${JSON.stringify(state.countdown?.text.slice(0, 120))} later=${JSON.stringify(later.countdown?.text.slice(0, 120))}`);
    } else if (id === "547") {
      await push(id, (state.weather?.rect.w ?? 0) > (before.weather?.rect.w ?? 0) + 100 && ok, `weatherBefore=${JSON.stringify(before.weather?.rect)} weatherAfter=${JSON.stringify(state.weather?.rect)}`);
    } else if (id === "548") {
      await push(id, Boolean(state.headline && state.note && state.headline.rect.w < (before.headline?.rect.w ?? 999) && overlapArea(state.headline.rect, state.note.rect) < overlapArea(before.headline?.rect, before.note?.rect) + 5 && ok), `headline=${JSON.stringify(state.headline?.rect)} note=${JSON.stringify(state.note?.rect)} overlap=${overlapArea(state.headline?.rect, state.note?.rect)}`);
    } else if (id === "549") {
      await push(id, (state.music?.rect.w ?? 0) > (before.music?.rect.w ?? 0) + 120 && /已退出全屏|完成|app\.fullscreen\.set/.test(op) && ok, `op=${JSON.stringify(op)} music=${JSON.stringify(state.music?.rect)}`);
    } else if (id === "550") {
      await push(id, Boolean(state.dialClock && state.dialClock.rect.x > 500 && state.dialClock.dialNightMode === true && ok), `dial=${JSON.stringify(state.dialClock?.rect)} class=${state.dialClock?.className} night=${state.dialClock?.dialNightMode}`);
    } else if (id === "551") {
      await push(id, !state.sidebarVisible && Boolean(state.tv && state.tv.zIndex === maxZ) && ok, `sidebar=${state.sidebarVisible} tvZ=${state.tv?.zIndex}/${maxZ} op=${JSON.stringify(op)}`);
    } else if (id === "552") {
      await push(id, Boolean(state.worldClock && state.worldClock.rect.w > (before.worldClock?.rect.w ?? 0) + 120 && /北京/.test(state.worldClock.text) && /伦敦/.test(state.worldClock.text) && /纽约/.test(state.worldClock.text) && ok), `world=${JSON.stringify(state.worldClock?.rect)} text=${JSON.stringify(state.worldClock?.text.slice(0, 500))}`);
    } else if (id === "553") {
      await push(id, (state.todo?.rect.w ?? 0) > (before.todo?.rect.w ?? 0) + 120 && ok, `todoBefore=${JSON.stringify(before.todo?.rect)} todoAfter=${JSON.stringify(state.todo?.rect)}`);
    } else if (id === "554") {
      await push(id, Boolean(state.clipboard && state.clipboard.rect.x > 900 && state.clipboard.rect.w < (before.clipboard?.rect.w ?? 999) && ok), `clipboardBefore=${JSON.stringify(before.clipboard?.rect)} clipboardAfter=${JSON.stringify(state.clipboard?.rect)}`);
    } else if (id === "555") {
      await push(id, state.sidebarVisible && (state.music?.rect.w ?? 0) >= (before.music?.rect.w ?? 0) && ok, `sidebar=${state.sidebarVisible} musicBefore=${JSON.stringify(before.music?.rect)} musicAfter=${JSON.stringify(state.music?.rect)}`);
    } else if (id === "556") {
      await push(id, Boolean(state.music && state.music.rect.w >= 500 && /已退出全屏|完成|app\.fullscreen\.set/.test(op) && ok), `op=${JSON.stringify(op)} music=${JSON.stringify(state.music?.rect)}`);
    } else if (id === "557") {
      await push(id, Boolean(state.recorder && state.countdown && overlapArea(state.recorder.rect, state.countdown.rect) < 20 && ok), `recorder=${JSON.stringify(state.recorder?.rect)} countdown=${JSON.stringify(state.countdown?.rect)} overlap=${overlapArea(state.recorder?.rect, state.countdown?.rect)}`);
    } else if (id === "558") {
      await push(id, (state.translate?.rect.w ?? 0) > (before.translate?.rect.w ?? 0) + 180 && ok, `translateBefore=${JSON.stringify(before.translate?.rect)} translateAfter=${JSON.stringify(state.translate?.rect)}`);
    } else if (id === "559") {
      await push(id, /已整理桌面|完成|board\.auto_align/.test(await operation()) && ok, `operation=${JSON.stringify(await operation())}`);
    } else if (id === "560") {
      await push(id, Boolean(state.music) && !/music\.play|已播放|播放/.test(op) && ok, `op=${JSON.stringify(op)} music=${JSON.stringify(state.music?.rect)}`);
    }
  }

  await page.evaluate((value) => {
    window.__xzRealPageWindowStateAdjustmentResults = value;
    let pre = document.getElementById("xz-real-page-window-state-adjustment-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-window-state-adjustment-results";
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
    throw new Error(`Window state adjustment real-page group failed: ${failed.length}/${results.length}`);
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
