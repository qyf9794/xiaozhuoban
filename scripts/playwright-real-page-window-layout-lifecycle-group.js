const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();

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
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }]
        })
      }
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
    "241": "把音乐播放器移到左下角，再把封面区域放大一点",
    "242": "把天气卡片缩小，电视窗口放到右上角并置顶",
    "243": "关闭留言板，然后打开一个新的便签实例",
    "244": "把电视窗口全屏，退出后仍然放在最前面",
    "245": "把录音机移到音乐旁边，两个窗口都不要遮住",
    "246": "把世界时钟放到右侧，把表盘时钟放到中间",
    "247": "把行情窗口调宽，同时刷新重大新闻",
    "248": "再打开一个倒计时，用完后把旧的倒计时关闭",
    "249": "把计算器和换算器并排放，宽度都调小",
    "250": "把翻译窗口拖到便签下面，并聚焦翻译输入框",
    "251": "把待办窗口放大，完成后把便签放到最前",
    "252": "关闭天气和新闻，只保留音乐、电视、待办",
    "253": "打开剪贴板后把它固定在屏幕右侧",
    "254": "把表盘时钟调小一点，别挡住音乐封面",
    "255": "把电视从右上角移到左侧，再打开全屏预览",
    "256": "关闭所有临时小工具，但保留音乐播放器",
    "257": "把留言板打开，移动到桌面底部居中",
    "258": "再开一个天气窗口用于对比北京和上海",
    "259": "把音乐窗口退出全屏，然后调整到宽度 520",
    "260": "把所有打开的小工具重新排版，确认后执行"
  };

  const labels = {
    music: "音乐播放器",
    weather: "天气",
    tv: "电视",
    note: "便签",
    recorder: "录音机",
    worldClock: "世界时钟",
    dialClock: "表盘时钟",
    market: "行情",
    headline: "重大新闻",
    countdown: "倒计时",
    calculator: "计算器",
    converter: "换算器",
    translate: "翻译",
    todo: "待办",
    clipboard: "剪贴板",
    messageBoard: "留言板"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|WIDGET_NOT_FOUND|未声明参数/.test(
      await operation()
    );
  const push = async (id, passed, evidence, requireRealtime = true) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-6);
    const realtimeOk = !requireRealtime || relatedRealtimeHits.length > 0;
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      operation: await operation(),
      evidence: `${evidence}; realtimeHits=${JSON.stringify(relatedRealtimeHits)}${
        realtimeOk ? "" : "; missingRealtimeRoute=true"
      }`
    });
  };

  const clickDockButton = async (label) => {
    await page
      .locator(".voice-assistant-dock__confirm button", { hasText: new RegExp(`^${label}$`) })
      .first()
      .waitFor({ state: "visible", timeout: 1_200 })
      .catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(500);
  };

  const settleLearningPrompt = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) {
      await clickDockButton("取消");
    }
  };

  const clearPendingConfirmation = async () => {
    if (!/待确认/.test(await operation())) return;
    await clickDockButton("取消");
    if (/待确认/.test(await operation())) {
      await page.getByTestId("voice-assistant-command-input").fill("取消");
      await page.getByTestId("voice-assistant-send").click({ force: true });
      await page.waitForTimeout(500);
    }
  };

  const sendCommand = async (command, waitMs = 950) => {
    await clearPendingConfirmation();
    await settleLearningPrompt();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
  };

  const closeDialogIfPresent = async () => {
    const overlay = page.locator(".modal-overlay").first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 4, y: 4 } }).catch(() => undefined);
      await page.waitForTimeout(200);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
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
          inputFocused: Array.from(el.querySelectorAll("input,textarea")).some((input) => input === document.activeElement)
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      const all = (needles) => widgets.filter((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        weather: find(["天气"]),
        weatherAll: all(["天气"]),
        todo: find(["待办"]),
        note: find(["便签"]),
        messageBoard: find(["留言板"]),
        messageBoardAll: all(["留言板"]),
        countdown: find(["倒计时"]),
        countdownAll: all(["倒计时"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
        converter: find(["单位换算", "换算"]),
        clipboard: find(["剪贴板"]),
        market: find(["全球指数", "标普500", "纳斯达克", "上证指数"]),
        headline: find(["重大新闻", "新闻"]),
        worldClock: find(["世界时钟", "东京"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        recorder: find(["录音机", "开始录音", "停止录音", "正在录音"])
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

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId;
    const planned = (type) => `planned_widget_${type}`;
    const existingOrPlanned = (type) => widgetId(type) ?? planned(type);
    const viewport = page.viewportSize() || { width: 1440, height: 1000 };
    const command = (tool, args = {}, risk = "safe") => ({
      tool,
      args,
      risk,
      confidence: 0.93,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });

    if (input.includes("音乐播放器移到左下角")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("music"), x: 36, y: 560 }),
        command("widget.resize", { widgetId: existingOrPlanned("music"), w: 520, h: 560 })
      ];
    }
    if (input.includes("天气卡片缩小")) {
      return [
        command("widget.resize", { widgetId: existingOrPlanned("weather"), w: 200, h: 180 }),
        command("widget.move", { widgetId: existingOrPlanned("tv"), x: Math.max(340, viewport.width - 380), y: 0 }),
        command("widget.bring_to_front", { widgetId: existingOrPlanned("tv") })
      ];
    }
    if (input.includes("关闭留言板")) {
      return [command("widget.remove", { widgetId: existingOrPlanned("messageBoard") }), add("note")];
    }
    if (input.includes("电视窗口全屏")) {
      return [
        command("widget.fullscreen_focus", { widgetId: existingOrPlanned("tv") }),
        command("widget.bring_to_front", { widgetId: existingOrPlanned("tv") })
      ];
    }
    if (input.includes("录音机移到音乐旁边")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("music"), x: 40, y: 140 }),
        command("widget.move", { widgetId: existingOrPlanned("recorder"), x: 600, y: 140 })
      ];
    }
    if (input.includes("世界时钟放到右侧")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("worldClock"), x: 1010, y: 120 }),
        command("widget.move", { widgetId: existingOrPlanned("dialClock"), x: 540, y: 220 })
      ];
    }
    if (input.includes("行情窗口调宽")) {
      return [
        command("widget.resize", { widgetId: existingOrPlanned("market"), w: 560, h: 360 }),
        command("headline.request_refresh", { widgetId: existingOrPlanned("headline"), requestedAt: new Date().toISOString() })
      ];
    }
    if (input.includes("旧的倒计时关闭")) {
      return [add("countdown"), command("widget.remove", { widgetId: widgetId("countdown") })];
    }
    if (input.includes("计算器和换算器并排")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("calculator"), x: 80, y: 160 }),
        command("widget.resize", { widgetId: existingOrPlanned("calculator"), w: 220, h: 180 }),
        command("widget.move", { widgetId: existingOrPlanned("converter"), x: 330, y: 160 }),
        command("widget.resize", { widgetId: existingOrPlanned("converter"), w: 220, h: 180 })
      ];
    }
    if (input.includes("翻译窗口拖到便签下面")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("note"), x: 80, y: 80 }),
        command("widget.move", { widgetId: existingOrPlanned("translate"), x: 80, y: 330 }),
        command("widget.focus", { widgetId: existingOrPlanned("translate") })
      ];
    }
    if (input.includes("待办窗口放大")) {
      return [
        command("widget.resize", { widgetId: existingOrPlanned("todo"), w: 520, h: 420 }),
        command("widget.bring_to_front", { widgetId: existingOrPlanned("note") })
      ];
    }
    if (input.includes("关闭天气和新闻")) {
      return [
        command("widget.remove", { widgetId: existingOrPlanned("weather") }),
        command("widget.remove", { widgetId: existingOrPlanned("headline") })
      ];
    }
    if (input.includes("剪贴板")) {
      return [
        add("clipboard"),
        command("widget.move", { widgetId: planned("clipboard"), x: Math.max(420, viewport.width - 360), y: 120 })
      ];
    }
    if (input.includes("表盘时钟调小")) {
      return [
        command("widget.resize", { widgetId: existingOrPlanned("dialClock"), w: 180, h: 180 }),
        command("widget.move", { widgetId: existingOrPlanned("dialClock"), x: 640, y: 140 }),
        command("widget.move", { widgetId: existingOrPlanned("music"), x: 40, y: 120 })
      ];
    }
    if (input.includes("电视从右上角移到左侧")) {
      return [
        command("widget.move", { widgetId: existingOrPlanned("tv"), x: 40, y: 80 }),
        command("widget.fullscreen_focus", { widgetId: existingOrPlanned("tv") })
      ];
    }
    if (input.includes("关闭所有临时小工具")) {
      return [
        command("widget.remove", { widgetId: existingOrPlanned("weather") }),
        command("widget.remove", { widgetId: existingOrPlanned("headline") }),
        command("widget.remove", { widgetId: existingOrPlanned("note") }),
        command("widget.remove", { widgetId: existingOrPlanned("tv") }),
        command("widget.remove", { widgetId: existingOrPlanned("todo") })
      ];
    }
    if (input.includes("留言板打开")) {
      return [add("messageBoard"), command("widget.move", { widgetId: planned("messageBoard"), x: 540, y: 640 })];
    }
    if (input.includes("对比北京和上海")) {
      return [
        add("weather"),
        command("weather.set_city", { widgetId: planned("weather"), city: "上海" }),
        command("weather.set_city", { widgetId: existingOrPlanned("weather"), city: "北京" })
      ];
    }
    if (input.includes("音乐窗口退出全屏")) {
      return [command("app.fullscreen.set", { mode: "exit" }), command("widget.resize", { widgetId: existingOrPlanned("music"), w: 520, h: 560 })];
    }
    if (input.includes("重新排版")) {
      return [command("board.auto_align", { viewportWidth: viewport.width }, "confirm")];
    }
    return null;
  };

  const hydrateMissingWidgetIds = async (input, commands) => {
    const fallbackByTool = {
      "widget.move": input.includes("音乐")
        ? ["音乐播放器", "Apple Music", "试听"]
        : input.includes("天气")
          ? ["天气"]
          : input.includes("电视")
            ? ["电视播放", "CCTV", "央视"]
            : undefined,
      "widget.resize": input.includes("音乐")
        ? ["音乐播放器", "Apple Music", "试听"]
        : input.includes("天气")
          ? ["天气"]
          : input.includes("行情")
            ? ["全球指数", "标普500", "纳斯达克", "上证指数"]
            : input.includes("表盘")
              ? ["BALMUDA", "进入夜间模式", "退出夜间模式"]
              : undefined,
      "widget.remove": input.includes("留言板") ? ["留言板"] : undefined,
      "widget.fullscreen_focus": ["电视播放", "CCTV", "央视"],
      "widget.bring_to_front": input.includes("电视") ? ["电视播放", "CCTV", "央视"] : ["便签"],
      "weather.set_city": ["天气"],
      "headline.request_refresh": ["重大新闻", "新闻"]
    };
    for (const item of commands) {
      if (!item.args || item.args.widgetId || String(item.args.widgetId ?? "").startsWith("planned_widget_")) continue;
      const needles = fallbackByTool[item.tool];
      if (!needles) continue;
      item.args.widgetId = await widgetIdFromDom(needles);
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
    await hydrateMissingWidgetIds(input, commands);
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
        body: JSON.stringify({ call: null, planSelection: { steps: commands.map((item) => ({ name: item.tool, confidence: 0.93 })) } })
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
            confidence: 0.93,
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

  const seedWidgets = async (types) => {
    for (const type of types) {
      await sendCommand(`打开${labels[type] ?? type}`, 700);
    }
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    const seed = {
      "241": ["music"],
      "242": ["weather", "tv"],
      "243": [],
      "244": ["tv"],
      "245": ["music", "recorder"],
      "246": ["worldClock", "dialClock"],
      "247": ["market", "headline"],
      "248": ["countdown"],
      "249": ["calculator", "converter"],
      "250": ["note", "translate"],
      "251": ["todo", "note"],
      "252": ["weather", "headline", "music", "tv", "todo"],
      "253": [],
      "254": ["music", "dialClock"],
      "255": ["tv"],
      "256": ["music", "weather", "headline", "note", "tv", "todo"],
      "257": [],
      "258": ["weather"],
      "259": ["music"],
      "260": ["music", "weather", "tv", "todo", "note"]
    }[id];
    await seedWidgets(seed ?? []);
    if (id === "242" || id === "255") {
      await sendCommand("把电视拖到右上角", 800);
    }
    await closeDialogIfPresent();

    const before = await snapshot();
    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], id === "244" || id === "255" ? 1_300 : 1_050);
    const state = await snapshot();
    const ok = await noAssistantError();
    const maxZ = Math.max(...state.widgets.map((widget) => widget.zIndex), 0);

    if (id === "241") {
      await push(
        id,
        Boolean(state.music && state.music.rect.x < (before.music?.rect.x ?? 999) + 24 && state.music.rect.y > 470 && state.music.rect.w > (before.music?.rect.w ?? 0) + 120 && ok),
        `music before=${JSON.stringify(before.music?.rect)} after=${JSON.stringify(state.music?.rect)}`
      );
    } else if (id === "242") {
      await push(
        id,
        Boolean(
          state.weather &&
            state.tv &&
            state.weather.rect.w < (before.weather?.rect.w ?? 999) &&
            state.tv.rect.x > 900 &&
            state.tv.rect.y < 120 &&
            state.tv.zIndex === maxZ &&
            ok
        ),
        `weather before=${JSON.stringify(before.weather?.rect)} after=${JSON.stringify(state.weather?.rect)} tv=${JSON.stringify(state.tv?.rect)} z=${state.tv?.zIndex}/${maxZ}`
      );
    } else if (id === "243") {
      await push(id, Boolean(!state.messageBoard && state.note && ok), `messageBoard=${Boolean(state.messageBoard)} note=${Boolean(state.note)}`);
    } else if (id === "244") {
      await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => undefined);
      await page.waitForTimeout(250);
      const afterExit = await snapshot();
      const afterMaxZ = Math.max(...afterExit.widgets.map((widget) => widget.zIndex), 0);
      await push(
        id,
        Boolean(afterExit.tv && afterExit.tv.zIndex === afterMaxZ && ok),
        `tvClass=${afterExit.tv?.className} tvZ=${afterExit.tv?.zIndex}/${afterMaxZ}`
      );
    } else if (id === "245") {
      await push(
        id,
        Boolean(state.music && state.recorder && Math.abs(state.recorder.rect.x - state.music.rect.x) > 260 && overlapArea(state.music.rect, state.recorder.rect) < 20 && ok),
        `music=${JSON.stringify(state.music?.rect)} recorder=${JSON.stringify(state.recorder?.rect)} overlap=${overlapArea(state.music?.rect, state.recorder?.rect)}`
      );
    } else if (id === "246") {
      await push(
        id,
        Boolean(state.worldClock && state.dialClock && state.worldClock.rect.x > 900 && state.dialClock.rect.x > 760 && state.dialClock.rect.x < 900 && ok),
        `world=${JSON.stringify(state.worldClock?.rect)} dial=${JSON.stringify(state.dialClock?.rect)}`
      );
    } else if (id === "247") {
      await push(
        id,
        Boolean(state.market && state.headline && state.market.rect.w > (before.market?.rect.w ?? 0) + 180 && /刷新新闻|请求刷新新闻|headline\.request_refresh/.test(await operation()) && ok),
        `market before=${JSON.stringify(before.market?.rect)} after=${JSON.stringify(state.market?.rect)} operation=${await operation()}`
      );
    } else if (id === "248") {
      const beforeIds = new Set(before.countdownAll.map((widget) => widget.id));
      const afterIds = state.countdownAll.map((widget) => widget.id);
      await push(
        id,
        Boolean(state.countdownAll.length === 1 && afterIds.some((widgetId) => !beforeIds.has(widgetId)) && ok),
        `beforeCountdowns=${JSON.stringify([...beforeIds])} afterCountdowns=${JSON.stringify(afterIds)}`
      );
    } else if (id === "249") {
      await push(
        id,
        Boolean(
          state.calculator &&
            state.converter &&
            state.calculator.rect.w <= 260 &&
            state.converter.rect.w <= 260 &&
            state.converter.rect.x > state.calculator.rect.x + state.calculator.rect.w - 20 &&
            ok
        ),
        `calculator=${JSON.stringify(state.calculator?.rect)} converter=${JSON.stringify(state.converter?.rect)}`
      );
    } else if (id === "250") {
      await push(
        id,
        Boolean(state.note && state.translate && state.translate.rect.y > state.note.rect.y + 160 && state.translate.className.includes("is-focused") && ok),
        `note=${JSON.stringify(state.note?.rect)} translate=${JSON.stringify(state.translate?.rect)} class=${state.translate?.className}`
      );
    } else if (id === "251") {
      await push(
        id,
        Boolean(state.todo && state.note && state.todo.rect.w > (before.todo?.rect.w ?? 0) + 180 && state.note.zIndex === maxZ && ok),
        `todo before=${JSON.stringify(before.todo?.rect)} after=${JSON.stringify(state.todo?.rect)} noteZ=${state.note?.zIndex}/${maxZ}`
      );
    } else if (id === "252") {
      await push(
        id,
        Boolean(!state.weather && !state.headline && state.music && state.tv && state.todo && ok),
        `weather=${Boolean(state.weather)} headline=${Boolean(state.headline)} music=${Boolean(state.music)} tv=${Boolean(state.tv)} todo=${Boolean(state.todo)}`
      );
    } else if (id === "253") {
      await push(id, Boolean(state.clipboard && state.clipboard.rect.x > 900 && ok), `clipboard=${JSON.stringify(state.clipboard?.rect)}`);
    } else if (id === "254") {
      await push(
        id,
        Boolean(
          state.dialClock &&
            state.music &&
            state.dialClock.rect.w < (before.dialClock?.rect.w ?? 999) &&
            overlapArea(state.dialClock.rect, state.music.rect) < 20 &&
            ok
        ),
        `dial before=${JSON.stringify(before.dialClock?.rect)} after=${JSON.stringify(state.dialClock?.rect)} music=${JSON.stringify(state.music?.rect)} overlap=${overlapArea(state.dialClock?.rect, state.music?.rect)}`
      );
    } else if (id === "255") {
      await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => undefined);
      await page.waitForTimeout(250);
      const afterExit = await snapshot();
      await push(
        id,
        Boolean(afterExit.tv && afterExit.tv.rect.x < 420 && afterExit.tv.className.includes("is-focused") && ok),
        `tv=${JSON.stringify(afterExit.tv?.rect)} class=${afterExit.tv?.className}`
      );
    } else if (id === "256") {
      await push(
        id,
        Boolean(state.music && !state.weather && !state.headline && !state.note && !state.tv && !state.todo && ok),
        `music=${Boolean(state.music)} weather=${Boolean(state.weather)} headline=${Boolean(state.headline)} note=${Boolean(state.note)} tv=${Boolean(state.tv)} todo=${Boolean(state.todo)}`
      );
    } else if (id === "257") {
      const movedMessageBoard = state.messageBoardAll.find(
        (widget) => widget.rect.x > 760 && widget.rect.x < 900 && widget.rect.y > 540
      );
      await push(
        id,
        Boolean(movedMessageBoard && ok),
        `messageBoards=${JSON.stringify(state.messageBoardAll.map((widget) => widget.rect))}`
      );
    } else if (id === "258") {
      const weatherText = state.weatherAll.map((widget) => widget.text).join(" ");
      await push(
        id,
        Boolean(state.weatherAll.length >= 2 && /北京/.test(weatherText) && /上海/.test(weatherText) && ok),
        `weatherCount=${state.weatherAll.length} text=${JSON.stringify(weatherText.slice(0, 300))}`
      );
    } else if (id === "259") {
      await push(
        id,
        Boolean(state.music && Math.abs(state.music.rect.w - 520) <= 12 && !/待确认/.test(await operation()) && ok),
        `music=${JSON.stringify(state.music?.rect)} operation=${await operation()}`
      );
    } else if (id === "260") {
      await push(
        id,
        Boolean(/待确认：board\.auto_align|已整理桌面小工具/.test(await operation()) && ok),
        `operation=${await operation()} widgets=${state.widgets.length}`
      );
    }
  }

  await page.evaluate((value) => {
    window.__xzRealPageWindowLayoutLifecycleResults = value;
    let pre = document.getElementById("xz-real-page-window-layout-lifecycle-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-window-layout-lifecycle-results";
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
    throw new Error(`Window layout lifecycle real-page group failed: ${failed.length}/${results.length}`);
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
