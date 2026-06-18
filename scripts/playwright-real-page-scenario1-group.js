async (page) => {
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
        const blob = new Blob(["fake audio"], { type: this.mimeType });
        this.ondataavailable?.({ data: blob });
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
    "107": "播放陈奕迅十年，然后查上海天气",
    "108": "隐藏侧边栏，同时打开设置",
    "109": "打开电视然后切到 CCTV5 再全屏",
    "110": "先记下买票，然后添加待办订酒店",
    "111": "关闭音乐和留言板",
    "112": "外面适合出门吗看北京，场景1",
    "113": "我想听点放松的不一定播放，场景1",
    "114": "来个周杰伦经典，场景1",
    "115": "有空提醒我复盘语音测试，场景1",
    "116": "good night 帮我看中文，场景1",
    "117": "十二乘十二，场景1",
    "118": "纳指给我看一眼，场景1",
    "119": "东京现在几点，场景1",
    "120": "看看刚刚有什么新闻，场景1",
    "121": "帮我录一段，场景1",
    "122": "电影频道打开，场景1",
    "123": "留言板回复收到，场景1",
    "124": "临时验证码存起来，场景1",
    "125": "一分半以后叫我，场景1",
    "126": "钟表别太亮，场景1",
    "127": "我要找功能，场景1",
    "128": "帮我做一个新工具，场景1",
    "129": "回到工作台，场景1",
    "130": "电视别被挡住，场景1",
    "131": "音乐面板放大，场景1"
  };

  const settlePendingConfirmation = async () => {
    const confirm = page.getByRole("button", { name: /^确认$/ });
    const cancel = page.getByRole("button", { name: /^取消$/ });
    const hasConfirm = (await confirm.count().catch(() => 0)) > 0 && (await confirm.first().isVisible().catch(() => false));
    const hasCancel = (await cancel.count().catch(() => 0)) > 0 && (await cancel.first().isVisible().catch(() => false));
    if (!hasConfirm && !hasCancel) return;
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    const isLearningPrompt = /要记住|下次直接执行|assistant\.learn/.test(dockText);
    if (isLearningPrompt && hasCancel) {
      await cancel.first().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
    if (hasConfirm) {
      await confirm.first().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
  };

  const sendCommand = async (command, waitMs = 1000) => {
    await settlePendingConfirmation();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    await settlePendingConfirmation();
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

  const exitFullscreenIfPresent = async () => {
    const button = page.getByRole("button", { name: "退出全屏" }).first();
    if ((await button.count().catch(() => 0)) > 0 && (await button.isVisible().catch(() => false))) {
      await button.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
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
      const findWorldClock = () => widgets.find((widget) => widget.text.includes("世界时钟")) ?? widgets.find((widget) => widget.text.includes("东京"));
      return {
        bodyText: document.body.innerText,
        fullscreenWidgetId: document.fullscreenElement?.getAttribute("data-widget-id") || "",
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        weather: find(["天气"]),
        todo: find(["待办"]),
        messageBoard: find(["留言板"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        note: find(["便签"]),
        clipboard: find(["剪贴板"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
        market: find(["全球指数", "标普500", "纳斯达克", "上证指数"]),
        headline: find(["重大新闻", "新闻"]),
        worldClock: findWorldClock()
      };
    });

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () => !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数/.test(await operation());
  const push = async (id, passed, evidence) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-4);
    const realtimeEvidence = relatedRealtimeHits.length ? `; realtimeHits=${JSON.stringify(relatedRealtimeHits)}` : "; realtimeHits=[]";
    results.push({ id, command, passed, operation: await operation(), evidence: `${evidence}${realtimeEvidence}` });
  };

  const ensureWidget = async (command, key, waitMs = 900) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(command, waitMs);
    state = await snapshot();
    return state[key];
  };

  const seedScenarioWidgets = async () => {
    await sendCommand("新开一个工作台桌板");
    for (const [command, key] of [
      ["打开音乐", "music"],
      ["打开天气", "weather"],
      ["打开待办", "todo"],
      ["新建便签实例用于测试", "note"],
      ["打开留言板", "messageBoard"],
      ["打开翻译", "translate"],
      ["打开计算器", "calculator"],
      ["打开行情", "market"],
      ["打开新闻", "headline"],
      ["看北京和伦敦时间", "worldClock"],
      ["打开录音机", "recorder"],
      ["打开剪贴板", "clipboard"],
      ["打开一个表盘时钟", "dialClock"]
    ]) {
      await ensureWidget(command, key);
    }
  };

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const boards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const byType = (type) =>
      widgets.find((widget) => {
        const record = widget && typeof widget === "object" ? widget : {};
        return (
          record.type === type ||
          record.widgetType === type ||
          record.definitionType === type ||
          record.definitionId === `wd_${type}` ||
          record.definition?.type === type
        );
      });
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const widgetId = (type) => byType(type)?.widgetId;
    const boardId = () => boards.find((board) => String(board.name ?? "").includes("工作台"))?.boardId ?? context.boardId;
    const command = (tool, args = {}) => ({ tool, args, risk: "safe", confidence: 0.94, source: "text", requiresHarnessValidation: true });

    if (input.includes("播放陈奕迅十年")) {
      return [command("music.play", { widgetId: widgetId("music"), query: "陈奕迅 十年" }), command("weather.set_city", { widgetId: widgetId("weather"), cityCode: "shanghai", city: "上海" })];
    }
    if (input.includes("隐藏侧边栏")) return [command("app.sidebar.set", { mode: "hide" }), command("app.settings.open", {})];
    if (input.includes("打开电视然后")) {
      return [
        command("board.add_widget", { definitionId: definitionId("tv") }),
        command("tv.select_channel", { channelName: "CCTV5", channelUrl: "http://www.douzhicloud.site:35455/gaoma/cctv5.m3u8" }),
        command("tv.fullscreen", {})
      ];
    }
    if (input.includes("先记下买票")) {
      return [
        command("note.write", { widgetId: widgetId("note"), content: "买票", mode: "append" }),
        command("todo.add_item", { widgetId: widgetId("todo"), text: "订酒店" })
      ];
    }
    if (input.includes("关闭音乐和留言板")) return [command("widget.remove", { widgetId: widgetId("music") }), command("widget.remove", { widgetId: widgetId("messageBoard") })];
    if (input.includes("外面适合出门")) return [command("weather.set_city", { widgetId: widgetId("weather"), cityCode: "beijing", city: "北京" })];
    if (input.includes("放松的不一定播放")) return [command("music.search", { widgetId: widgetId("music"), query: "放松" })];
    if (input.includes("周杰伦经典")) return [command("music.play", { widgetId: widgetId("music"), query: "周杰伦经典" })];
    if (input.includes("复盘语音测试")) return [command("todo.add_item", { widgetId: widgetId("todo"), text: "复盘语音测试" })];
    if (input.includes("good night")) return [command("translate.set_draft", { widgetId: widgetId("translate"), sourceText: "good night", targetLang: "zh" })];
    if (input.includes("十二乘十二")) return [command("calculator.set_display", { widgetId: widgetId("calculator"), display: "144" })];
    if (input.includes("纳指给我")) return [command("market.set_indices", { widgetId: widgetId("market"), indexCodes: ["usNDX"] })];
    if (input.includes("东京现在")) return [command("worldClock.set_zones", { widgetId: widgetId("worldClock"), zones: ["Asia/Tokyo"] })];
    if (input.includes("刚刚有什么新闻")) return [command("headline.request_refresh", { widgetId: widgetId("headline"), requestedAt: new Date().toISOString() })];
    if (input.includes("帮我录一段")) return [command("recorder.start", { widgetId: widgetId("recorder") })];
    if (input.includes("电影频道")) return [command("tv.play", { widgetId: widgetId("tv"), channelName: "CCTV6", channelUrl: "http://www.douzhicloud.site:35455/gaoma/cctv6.m3u8" })];
    if (input.includes("留言板回复")) return [command("messageBoard.send", { widgetId: widgetId("messageBoard"), text: "收到" })];
    if (input.includes("临时验证码")) return [command("clipboard.add_text", { widgetId: widgetId("clipboard"), text: "临时验证码", pinned: false })];
    if (input.includes("一分半以后")) return [command("todo.add_item", { widgetId: widgetId("todo"), text: "叫我", dueAt: new Date(Date.now() + 90_000).toISOString() })];
    if (input.includes("钟表别太亮")) return [command("dialClock.set_night_mode", { widgetId: widgetId("dialClock"), enabled: true })];
    if (input.includes("我要找功能")) return [command("app.command_palette.open", {})];
    if (input.includes("新工具")) return [command("app.ai_dialog.open", {})];
    if (input.includes("回到工作台")) return [command("board.switch", { boardId: boardId() })];
    if (input.includes("电视别被挡住")) return [command("widget.bring_to_front", { widgetId: widgetId("tv") })];
    if (input.includes("音乐面板放大")) return [command("widget.fullscreen_focus", { widgetId: widgetId("music") })];
    if (input.includes("工作台桌板")) return [command("board.create", { name: "工作台桌板" })];
    return null;
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
      const planned = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, ...item }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_plan_${Date.now()}`,
            sourceText: input,
            commands: planned,
            executionGroups: [{ mode: "sequential", commandIds: planned.map((item) => item.id) }],
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
  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = decodeURIComponent(url.searchParams.get("term") ?? "");
    const jay = term.includes("周杰伦");
    const relax = term.includes("放松");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 3,
        results: jay
          ? [
              { wrapperType: "track", kind: "song", trackId: 2001, trackName: "Love Confession", artistName: "Jay Chou", collectionName: "Jay Chou's Bedtime Stories", artworkUrl100: "https://example.test/jay.jpg", previewUrl: "https://example.test/jay.m4a", trackViewUrl: "https://example.test/jay" }
            ]
          : relax
            ? [
                { wrapperType: "track", kind: "song", trackId: 2002, trackName: "Sound Therapy: Relax", artistName: "Apple Music", collectionName: "Relax", artworkUrl100: "https://example.test/relax.jpg", previewUrl: "https://example.test/relax.m4a", trackViewUrl: "https://example.test/relax" }
              ]
            : [
                { wrapperType: "track", kind: "song", trackId: 2003, trackName: "十年", artistName: "陈奕迅", collectionName: "黑白灰", artworkUrl100: "https://example.test/eason.jpg", previewUrl: "https://example.test/eason.m4a", trackViewUrl: "https://example.test/eason" }
              ]
      })
    });
  });

  await page.goto("http://localhost:5174");
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [{ name: "xiaozhuoban" }];
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name) => typeof name === "string" && name.length > 0)
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

  await seedScenarioWidgets();

  await sendCommand(commandText["107"], 1500);
  let state = await snapshot();
  await push("107", Boolean(state.music) && /陈奕迅|十年/.test(state.music.text) && /上海/.test(state.weather?.text || "") && await noAssistantError(), `music=${JSON.stringify((state.music?.text || "").slice(0, 700))}; weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);

  await sendCommand(commandText["108"], 1000);
  state = await snapshot();
  const settingsVisible = /修改用户名|设置/.test(state.bodyText);
  const sidebarHidden = !(await page.locator(".sidebar-panel").isVisible().catch(() => false));
  await closeDialogIfPresent();
  await push("108", settingsVisible && sidebarHidden && await noAssistantError(), `sidebarHidden=${sidebarHidden}; settingsVisible=${settingsVisible}`);

  await sendCommand(commandText["109"], 1700);
  state = await snapshot();
  await push("109", Boolean(state.tv) && /全屏/.test(await operation()) && await noAssistantError(), `fullscreen=${state.fullscreenWidgetId}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 700))}`);
  await exitFullscreenIfPresent();
  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
  await seedScenarioWidgets();

  await sendCommand(commandText["110"], 1200);
  state = await snapshot();
  await push("110", /买票/.test(`${state.note?.text || ""} ${JSON.stringify(state.note?.inputs || [])}`) && /订酒店/.test(state.todo?.text || "") && await noAssistantError(), `note=${JSON.stringify((state.note?.text || "").slice(0, 500))}; noteInputs=${JSON.stringify(state.note?.inputs || [])}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);

  await sendCommand(commandText["111"], 1200);
  state = await snapshot();
  await push("111", !state.music && !state.messageBoard && await noAssistantError(), `music=${Boolean(state.music)}; messageBoard=${Boolean(state.messageBoard)}`);
  await ensureWidget("打开音乐", "music");
  await ensureWidget("打开留言板", "messageBoard");

  await sendCommand(commandText["112"], 1000);
  state = await snapshot();
  await push("112", /北京/.test(state.weather?.text || "") && await noAssistantError(), `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);

  await sendCommand(commandText["113"], 1200);
  state = await snapshot();
  const musicQuery113 = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
  await push("113", /放松/.test(musicQuery113) && /Relax|放松/.test(state.music?.text || "") && await noAssistantError(), `query=${musicQuery113}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["114"], 1500);
  state = await snapshot();
  const musicQuery114 = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
  await push("114", /周杰伦/.test(musicQuery114) && /Jay Chou|Love Confession/.test(state.music?.text || "") && await noAssistantError(), `query=${musicQuery114}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["115"]);
  state = await snapshot();
  await push("115", /复盘语音测试/.test(state.todo?.text || "") && await noAssistantError(), `todo=${JSON.stringify((state.todo?.text || "").slice(0, 600))}`);

  await sendCommand(commandText["116"]);
  state = await snapshot();
  await push("116", /good night/.test(JSON.stringify(state.translate?.inputs || [])) && await noAssistantError(), `translate=${JSON.stringify((state.translate?.text || "").slice(0, 600))}; inputs=${JSON.stringify(state.translate?.inputs || [])}`);

  await sendCommand(commandText["117"]);
  state = await snapshot();
  await push("117", /144/.test(state.calculator?.text || JSON.stringify(state.calculator?.inputs || [])) && await noAssistantError(), `calculator=${JSON.stringify((state.calculator?.text || "").slice(0, 600))}`);

  await sendCommand(commandText["118"]);
  state = await snapshot();
  await push("118", /纳斯达克|纳指|NASDAQ/.test(state.market?.text || "") && await noAssistantError(), `market=${JSON.stringify((state.market?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["119"]);
  state = await snapshot();
  await push("119", /东京/.test(state.worldClock?.text || "") && await noAssistantError(), `worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["120"]);
  state = await snapshot();
  await push("120", Boolean(state.headline) && /新闻|重大/.test(state.headline?.text || "") && await noAssistantError(), `headline=${JSON.stringify((state.headline?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["121"], 1000);
  state = await snapshot();
  await push("121", /录音中|正在录音|停止/.test(state.recorder?.text || "") && await noAssistantError(), `recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["122"], 1300);
  state = await snapshot();
  const tvMedia122 = JSON.stringify(state.tv?.media ?? []);
  await push("122", /cctv6|CCTV-?6|电影/i.test(`${state.tv?.text || ""} ${tvMedia122}`) && await noAssistantError(), `media=${tvMedia122}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["123"], 1000);
  state = await snapshot();
  await push("123", /收到/.test(state.messageBoard?.text || "") && await noAssistantError(), `messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["124"]);
  state = await snapshot();
  await push("124", /临时验证码/.test(state.clipboard?.text || "") && await noAssistantError(), `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["125"]);
  state = await snapshot();
  await push("125", /叫我/.test(state.todo?.text || "") && await noAssistantError(), `todo=${JSON.stringify((state.todo?.text || "").slice(0, 700))}`);

  await sendCommand(commandText["126"]);
  state = await snapshot();
  await push("126", /is-night-mode/.test(state.dialClock?.className || "") || /夜间模式/.test(await operation()), `class=${state.dialClock?.className || ""}; operation=${await operation()}`);

  await sendCommand(commandText["127"]);
  state = await snapshot();
  await push("127", /搜索|添加 Widget/.test(state.bodyText) && await noAssistantError(), "command palette visible");
  await closeDialogIfPresent();

  await sendCommand(commandText["128"]);
  state = await snapshot();
  await push("128", /AI|生成|小工具/.test(state.bodyText) && await noAssistantError(), "AI dialog visible");
  await closeDialogIfPresent();

  await sendCommand(commandText["129"]);
  state = await snapshot();
  await push("129", /工作台/.test(state.bodyText) && await noAssistantError(), "workspace board text visible after switch");

  const beforeTv = (await snapshot()).tv;
  await sendCommand(commandText["130"]);
  state = await snapshot();
  await push("130", Boolean(state.tv) && (state.tv.zIndex >= (beforeTv?.zIndex || 0)) && await noAssistantError(), `beforeZ=${beforeTv?.zIndex}; afterZ=${state.tv?.zIndex}`);

  const beforeMusic = (await snapshot()).music;
  await sendCommand(commandText["131"], 1200);
  state = await snapshot();
  await push("131", Boolean(state.music) && ((state.music.rect.w > (beforeMusic?.rect.w || 0)) || state.fullscreenWidgetId === state.music.id || /全屏/.test(await operation())) && await noAssistantError(), `beforeW=${beforeMusic?.rect.w}; afterW=${state.music?.rect.w}; fullscreen=${state.fullscreenWidgetId}; operation=${await operation()}`);

  await page.evaluate((value) => {
    window.__xzRealPageScenario1Results = value;
    let pre = document.getElementById("xz-real-page-scenario1-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-scenario1-results";
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
}
