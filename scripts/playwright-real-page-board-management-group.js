const run = async (page) => {
  const results = [];
  const realtimeHits = [];

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
    "221": "新建一个叫晨间复盘的桌板，然后切过去",
    "222": "把当前桌板改名成项目冲刺，并整理所有小工具",
    "223": "切到工作台桌板后打开新闻和行情",
    "224": "新开旅行计划桌板，把天气、世界时钟和待办都放上去",
    "225": "回到夜间工作桌板，同时把表盘时钟调成夜间模式",
    "226": "创建一个音乐练习桌板，再打开音乐和录音机",
    "227": "把当前桌板改成语音回归测试，不要删除任何小工具",
    "228": "切回工作台，再把电视窗口移动到右上角",
    "229": "新建家庭事务桌板，添加待办、便签和留言板",
    "230": "把桌面自动整理一下，确认后再聚焦音乐播放器",
    "231": "切到学习桌板，打开翻译和计算器",
    "232": "创建一个市场观察桌板，同时打开行情和重大新闻",
    "233": "把当前桌板重命名为今晚直播，然后打开电视",
    "234": "回到默认工作台，把天气卡片调到左上角",
    "235": "新建一个临时桌板，只放倒计时和便签",
    "236": "切到项目桌板后把所有窗口按网格排列",
    "237": "把当前桌板命名为会议记录，然后开始录音",
    "238": "创建阅读桌板，打开便签、翻译和世界时钟",
    "239": "切回上一个桌板，如果找不到就打开命令面板",
    "240": "整理桌板之后把留言板关闭，不要发送留言"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () => !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数/.test(await operation());
  const bodyText = async () => page.locator("body").innerText().catch(() => "");
  const activeBoardName = async () =>
    page.locator(".sidebar-board-row.is-active .sidebar-board-button").first().innerText().catch(() => "");
  const paletteVisible = async () => /全局搜索|添加小工具|添加 Widget/.test(await bodyText());
  const push = async (id, passed, evidence, requireRealtime = true) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-4);
    const realtimeOk = !requireRealtime || relatedRealtimeHits.length > 0;
    const realtimeEvidence = relatedRealtimeHits.length ? `; realtimeHits=${JSON.stringify(relatedRealtimeHits)}` : "; realtimeHits=[]";
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      operation: await operation(),
      evidence: `${evidence}; activeBoard=${await activeBoardName()}${realtimeEvidence}${realtimeOk ? "" : "; missingRealtimeRoute=true"}`
    });
  };

  const clickDockButton = async (label) => {
    await page
      .locator(".voice-assistant-dock__confirm button", { hasText: new RegExp(`^${label}$`) })
      .first()
      .waitFor({ state: "visible", timeout: 1_500 })
      .catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(900);
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
      await page.waitForTimeout(700);
    }
  };

  const sendCommand = async (command, waitMs = 1100) => {
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

  const reloadApp = async () => {
    await page.goto("http://localhost:5174/app");
    await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
    await page.waitForTimeout(500);
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
            ariaLabel: input.getAttribute("aria-label"),
            placeholder: input.getAttribute("placeholder"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        weather: find(["天气"]),
        todo: find(["待办"]),
        note: find(["便签"]),
        messageBoard: find(["留言板"]),
        countdown: find(["倒计时"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
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

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const boards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const activeBoardId = context.boardId;
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const boardId = (name) => boards.find((board) => String(board.name ?? "").includes(name))?.boardId ?? activeBoardId;
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId;
    const command = (tool, args = {}) => ({
      tool,
      args,
      risk: tool === "board.auto_align" ? "confirm" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const planned = (type) => `planned_widget_${type}`;
    const existingOrPlanned = (type) => widgetId(type) ?? planned(type);

    if (/新开一个工作台桌板|新建工作台桌板/.test(input)) return [command("board.create", { name: "工作台桌板" })];
    if (/新开一个夜间工作桌板|新建夜间工作桌板/.test(input)) return [command("board.create", { name: "夜间工作桌板" })];
    if (/新开一个学习桌板|新建学习桌板/.test(input)) return [command("board.create", { name: "学习桌板" })];
    if (/新开一个项目桌板|新建项目桌板/.test(input)) return [command("board.create", { name: "项目桌板" })];

    if (input.includes("晨间复盘")) return [command("board.create", { name: "晨间复盘" })];
    if (input.includes("项目冲刺")) return [command("board.rename", { boardId: activeBoardId, name: "项目冲刺" }), command("board.auto_align", {})];
    if (input.includes("工作台桌板后打开新闻和行情")) return [command("board.switch", { boardId: boardId("工作台") }), add("headline"), add("market")];
    if (input.includes("旅行计划")) return [command("board.create", { name: "旅行计划" }), add("weather"), add("worldClock"), add("todo")];
    if (input.includes("夜间工作")) return [command("board.switch", { boardId: boardId("夜间工作") }), add("dialClock"), command("dialClock.set_night_mode", { widgetId: planned("dialClock"), enabled: true })];
    if (input.includes("音乐练习")) return [command("board.create", { name: "音乐练习" }), add("music"), add("recorder")];
    if (input.includes("语音回归测试")) return [command("board.rename", { boardId: activeBoardId, name: "语音回归测试" })];
    if (input.includes("电视窗口移动到右上角")) return [command("board.switch", { boardId: boardId("工作台") }), add("tv"), command("widget.move", { widgetId: planned("tv"), x: 1080, y: 0 })];
    if (input.includes("家庭事务")) return [command("board.create", { name: "家庭事务" }), add("todo"), add("note"), add("messageBoard")];
    if (input.includes("确认后再聚焦音乐播放器")) return [add("music"), command("widget.focus", { widgetId: planned("music") }), command("board.auto_align", {})];
    if (input.includes("学习桌板")) return [command("board.switch", { boardId: boardId("学习") }), add("translate"), add("calculator")];
    if (input.includes("市场观察")) return [command("board.create", { name: "市场观察" }), add("market"), add("headline")];
    if (input.includes("今晚直播")) return [command("board.rename", { boardId: activeBoardId, name: "今晚直播" }), add("tv")];
    if (input.includes("默认工作台")) return [command("board.switch", { boardId: boardId("工作台") }), add("weather"), command("widget.move", { widgetId: planned("weather"), x: 40, y: 44 })];
    if (input.includes("临时桌板")) return [command("board.create", { name: "临时桌板" }), add("countdown"), add("note")];
    if (input.includes("项目桌板")) return [command("board.switch", { boardId: boardId("项目") }), command("board.auto_align", {})];
    if (input.includes("会议记录")) return [command("board.rename", { boardId: activeBoardId, name: "会议记录" }), add("recorder"), command("recorder.start", { widgetId: planned("recorder") })];
    if (input.includes("阅读桌板")) return [command("board.create", { name: "阅读桌板" }), add("note"), add("translate"), add("worldClock")];
    if (input.includes("上一个桌板")) return [command("app.command_palette.open", {})];
    if (input.includes("留言板关闭")) return [command("widget.remove", { widgetId: existingOrPlanned("messageBoard") }), command("board.auto_align", {})];
    return null;
  };

  const hydrateMissingWidgetIds = async (input, commands) => {
    const fallbackByTool = {
      "widget.focus": input.includes("音乐") ? ["音乐播放器", "Apple Music", "试听"] : undefined,
      "widget.remove": input.includes("留言板") ? ["留言板"] : undefined,
      "widget.move": input.includes("电视") ? ["电视播放", "CCTV", "央视"] : input.includes("天气") ? ["天气"] : undefined,
      "dialClock.set_night_mode": ["BALMUDA", "进入夜间模式", "退出夜间模式"],
      "recorder.start": ["录音机", "开始录音", "停止录音", "正在录音"]
    };
    for (const item of commands) {
      if (!item.args || item.args.widgetId) continue;
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
      realtimeHits.push({ input, phase, matched: false, tools: [] });
      await route.continue();
      return;
    }
    await hydrateMissingWidgetIds(input, commands);
    realtimeHits.push({ input, phase, matched: true, tools: commands.map((item) => item.tool), args: commands.map((item) => item.args) });
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

  const seedBaseBoards = async () => {
    for (const command of ["新开一个工作台桌板", "新开一个夜间工作桌板", "新开一个学习桌板", "新开一个项目桌板"]) {
      await sendCommand(command, 700);
    }
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    await seedBaseBoards();
    if (id === "227") {
      await sendCommand("打开音乐", 700);
      await sendCommand("打开录音机", 700);
    }
    if (id === "230") {
      await sendCommand("打开音乐", 700);
    }
    await closeDialogIfPresent();
    await sendCommand(commandText[id], id === "237" ? 1500 : 1100);
    const state = await snapshot();
    const ok = await noAssistantError();
    const active = await activeBoardName();

    if (id === "221") await push(id, /晨间复盘/.test(active) && ok, `active=${active}`);
    else if (id === "222") await push(id, /项目冲刺/.test(active) && /已整理桌面小工具|待确认：board\.auto_align/.test(await operation()) && ok, `operation=${await operation()}`);
    else if (id === "223") await push(id, /工作台/.test(active) && Boolean(state.headline) && Boolean(state.market) && ok, `headline=${Boolean(state.headline)}; market=${Boolean(state.market)}`);
    else if (id === "224") await push(id, /旅行计划/.test(active) && Boolean(state.weather) && Boolean(state.worldClock) && Boolean(state.todo) && ok, `weather=${Boolean(state.weather)}; worldClock=${Boolean(state.worldClock)}; todo=${Boolean(state.todo)}`);
    else if (id === "225") await push(id, /夜间工作/.test(active) && Boolean(state.dialClock) && /已进入夜间模式|退出夜间模式/.test(`${await operation()} ${state.dialClock?.text || ""}`) && ok, `dialClock=${JSON.stringify((state.dialClock?.text || "").slice(0, 300))}; operation=${await operation()}`);
    else if (id === "226") await push(id, /音乐练习/.test(active) && Boolean(state.music) && Boolean(state.recorder) && ok, `music=${Boolean(state.music)}; recorder=${Boolean(state.recorder)}`);
    else if (id === "227") await push(id, /语音回归测试/.test(active) && Boolean(state.music) && Boolean(state.recorder) && ok, `music=${Boolean(state.music)}; recorder=${Boolean(state.recorder)}`);
    else if (id === "228") await push(id, /工作台/.test(active) && Boolean(state.tv) && (state.tv?.rect.x ?? 0) > 900 && (state.tv?.rect.y ?? 999) < 140 && ok, `tvRect=${JSON.stringify(state.tv?.rect)}`);
    else if (id === "229") await push(id, /家庭事务/.test(active) && Boolean(state.todo) && Boolean(state.note) && Boolean(state.messageBoard) && ok, `todo=${Boolean(state.todo)}; note=${Boolean(state.note)}; messageBoard=${Boolean(state.messageBoard)}`);
    else if (id === "230") await push(id, Boolean(state.music) && /待确认：board\.auto_align|已整理桌面小工具/.test(await operation()) && ok, `musicClass=${state.music?.className}; operation=${await operation()}`);
    else if (id === "231") await push(id, /学习/.test(active) && Boolean(state.translate) && Boolean(state.calculator) && ok, `translate=${Boolean(state.translate)}; calculator=${Boolean(state.calculator)}`);
    else if (id === "232") await push(id, /市场观察/.test(active) && Boolean(state.market) && Boolean(state.headline) && ok, `market=${Boolean(state.market)}; headline=${Boolean(state.headline)}`);
    else if (id === "233") await push(id, /今晚直播/.test(active) && Boolean(state.tv) && ok, `tv=${Boolean(state.tv)}`);
    else if (id === "234") await push(id, /工作台/.test(active) && Boolean(state.weather) && (state.weather?.rect.x ?? 999) < 390 && (state.weather?.rect.y ?? 999) < 170 && ok, `weatherRect=${JSON.stringify(state.weather?.rect)}`);
    else if (id === "235") await push(id, /临时桌板/.test(active) && Boolean(state.countdown) && Boolean(state.note) && ok, `countdown=${Boolean(state.countdown)}; note=${Boolean(state.note)}; widgets=${state.widgets.length}`);
    else if (id === "236") await push(id, /项目/.test(active) && /已整理桌面小工具|待确认：board\.auto_align/.test(await operation()) && ok, `operation=${await operation()}`);
    else if (id === "237") await push(id, /会议记录/.test(active) && Boolean(state.recorder) && /正在录音|停止录音|录音中/.test(state.recorder?.text || "") && ok, `recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 300))}`);
    else if (id === "238") await push(id, /阅读桌板/.test(active) && Boolean(state.note) && Boolean(state.translate) && Boolean(state.worldClock) && ok, `note=${Boolean(state.note)}; translate=${Boolean(state.translate)}; worldClock=${Boolean(state.worldClock)}`);
    else if (id === "239") await push(id, await paletteVisible() && ok, `palette=${await paletteVisible()}`);
    else if (id === "240") await push(id, !state.messageBoard && !/留言板发/.test(await operation()) && ok, `messageBoard=${Boolean(state.messageBoard)}; operation=${await operation()}`);

  }

  await page.evaluate((value) => {
    window.__xzRealPageBoardManagementResults = value;
    let pre = document.getElementById("xz-real-page-board-management-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-board-management-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "820px";
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
    throw new Error(`Board management real-page group failed: ${failed.length}/${results.length}`);
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
