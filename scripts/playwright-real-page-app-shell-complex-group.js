const run = async (page) => {
  const results = [];
  const realtimeHits = [];

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
    "192": "外面适合出门吗看北京，场景5",
    "193": "我想听点放松的不一定播放，场景5",
    "194": "来个周杰伦经典，场景5",
    "195": "有空提醒我复盘语音测试，场景5",
    "196": "good night 帮我看中文，场景5",
    "197": "十二乘十二，场景5",
    "198": "纳指给我看一眼，场景5",
    "199": "东京现在几点，场景5",
    "200": "看看刚刚有什么新闻，场景5",
    "201": "先把左侧边栏收起，然后打开设置检查语音入口",
    "202": "进入全屏后马上退出，再打开命令面板找音乐播放器",
    "203": "把侧边栏显示回来，同时把设置窗口放到最前面",
    "204": "打开设置，切到语音相关页面，如果没有就打开命令面板",
    "205": "我想专心一下，隐藏侧栏并把当前桌面整理整齐",
    "206": "退出全屏，打开搜索面板，然后输入天气两个字",
    "207": "进入沉浸模式，同时不要关闭正在播放的音乐",
    "208": "打开小桌板设置，再新建一个 AI 小工具草稿",
    "209": "把所有弹窗先收起来，只留下命令面板",
    "210": "先显示侧边栏，再把音乐和天气两个窗口都放到前面",
    "211": "打开设置后帮我检查有没有登录音乐的入口",
    "212": "我刚才误触全屏了，恢复普通窗口并聚焦便签",
    "213": "隐藏侧栏，打开 AI 小工具窗口，名字先叫每日摘要",
    "214": "把命令面板打开，如果当前在全屏就先退出",
    "215": "进入全屏看电视，同时把侧边栏藏起来",
    "216": "把设置打开后不要新建工具，只让我看配置",
    "217": "现在先回到普通窗口，然后显示侧边栏",
    "218": "打开搜索命令面板并准备查找世界时钟",
    "219": "把侧边栏切换一下，再把表盘时钟放最前",
    "220": "清理桌面前先打开设置让我确认"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () => !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数/.test(await operation());
  const bodyText = async () => page.locator("body").innerText().catch(() => "");
  const sidebarHidden = async () => !(await page.locator(".sidebar-panel").isVisible().catch(() => false));
  const sidebarVisible = async () => (await page.locator(".sidebar-panel").isVisible().catch(() => false));
  const settingsVisible = async () => /修改用户名|设置/.test(await bodyText());
  const paletteVisible = async () => /全局搜索|添加小工具|添加 Widget/.test(await bodyText());
  const aiVisible = async () => /AI 工具生成器|结构化表单型 Widget/.test(await bodyText());
  const modalInputValue = async () => {
    const input = page.locator(".modal input, .modal textarea").first();
    if ((await input.count().catch(() => 0)) === 0) return "";
    return input.inputValue().catch(() => "");
  };
  const push = async (id, passed, evidence) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-4);
    const realtimeEvidence = relatedRealtimeHits.length ? `; realtimeHits=${JSON.stringify(relatedRealtimeHits)}` : "; realtimeHits=[]";
    results.push({ id, command, passed, operation: await operation(), evidence: `${evidence}${realtimeEvidence}` });
  };

  const settlePendingConfirmation = async () => {
    const dockConfirm = page.locator(".voice-assistant-dock__confirm button", { hasText: /^确认$/ }).first();
    const dockCancel = page.locator(".voice-assistant-dock__confirm button", { hasText: /^取消$/ }).first();
    const confirm = page.getByRole("button", { name: /^确认$/ });
    const cancel = page.getByRole("button", { name: /^取消$/ });
    const hasDockConfirm = (await dockConfirm.count().catch(() => 0)) > 0 && (await dockConfirm.isVisible().catch(() => false));
    const hasDockCancel = (await dockCancel.count().catch(() => 0)) > 0 && (await dockCancel.isVisible().catch(() => false));
    const hasConfirm = (await confirm.count().catch(() => 0)) > 0 && (await confirm.first().isVisible().catch(() => false));
    const hasCancel = (await cancel.count().catch(() => 0)) > 0 && (await cancel.first().isVisible().catch(() => false));
    if (!hasDockConfirm && !hasDockCancel && !hasConfirm && !hasCancel) return;
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    const isLearningPrompt = /要记住|下次直接执行|assistant\.learn/.test(dockText);
    if (isLearningPrompt && (hasDockCancel || hasCancel)) {
      await (hasDockCancel ? dockCancel : cancel.first()).click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
    if (hasDockConfirm || hasConfirm) {
      if (hasDockConfirm) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
          const confirmButton = buttons.find((button) => button.textContent?.trim() === "确认");
          confirmButton?.click();
        });
      } else {
        await confirm.first().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(700);
    }
  };
  const clickDockConfirmByDom = async () => {
    await page.locator(".voice-assistant-dock__confirm button", { hasText: /^确认$/ }).first().waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const confirmButton = buttons.find((button) => button.textContent?.trim() === "确认");
      confirmButton?.click();
    });
    await page.waitForTimeout(900);
  };

  const sendCommand = async (command, waitMs = 1000) => {
    await settlePendingConfirmation();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    await settlePendingConfirmation();
  };
  const confirmPendingCommand = async () => {
    await page.getByTestId("voice-assistant-command-input").fill("确认");
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(900);
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

  const exitBrowserFullscreen = async () => {
    await page.evaluate(async () => {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    }).catch(() => undefined);
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
      return {
        fullscreen: Boolean(document.fullscreenElement),
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        weather: find(["天气"]),
        todo: find(["待办"]),
        note: find(["便签"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
        market: find(["全球指数", "标普500", "纳斯达克", "上证指数"]),
        headline: find(["重大新闻", "新闻"]),
        worldClock: find(["世界时钟", "东京"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        tv: find(["电视播放", "CCTV", "央视"])
      };
    });

  const ensureWidget = async (command, key, waitMs = 900) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(command, waitMs);
    state = await snapshot();
    return state[key];
  };

  const widgetIdFromDom = async (needles) =>
    page.locator("[data-widget-id]").evaluateAll(
      (elements, expected) => {
        const target = elements.find((element) => expected.some((needle) => element.textContent?.includes(needle)));
        return target?.getAttribute("data-widget-id") ?? undefined;
      },
      needles
    );

  const hydrateMissingWidgetIds = async (input, commands) => {
    const fallbackByTool = {
      "music.search": ["音乐播放器", "Apple Music", "试听"],
      "music.play": ["音乐播放器", "Apple Music", "试听"],
      "weather.set_city": ["天气"],
      "todo.add_item": ["待办"],
      "translate.set_draft": ["翻译"],
      "calculator.set_display": ["计算器"],
      "market.set_indices": ["全球指数", "标普500", "纳斯达克", "上证指数"],
      "headline.request_refresh": ["重大新闻", "新闻"],
      "worldClock.set_zones": ["世界时钟", "东京"],
      "tv.play": ["电视播放", "CCTV", "央视"]
    };
    for (const item of commands) {
      if (!item.args || item.args.widgetId) continue;
      const needles =
        item.tool === "widget.focus" && input.includes("便签")
          ? ["便签"]
          : item.tool === "widget.bring_to_front" && input.includes("表盘")
            ? ["BALMUDA", "进入夜间模式", "退出夜间模式"]
            : fallbackByTool[item.tool];
      if (!needles) continue;
      item.args.widgetId = await widgetIdFromDom(needles);
    }
  };

  const seedScenarioWidgets = async () => {
    await sendCommand("新开一个工作台桌板");
    for (const [command, key] of [
      ["打开音乐", "music"],
      ["打开天气", "weather"],
      ["打开待办", "todo"],
      ["新建便签实例用于测试", "note"],
      ["打开翻译", "translate"],
      ["打开计算器", "calculator"],
      ["打开行情", "market"],
      ["打开新闻", "headline"],
      ["看北京和伦敦时间", "worldClock"],
      ["打开一个表盘时钟", "dialClock"],
      ["打开电视", "tv"]
    ]) {
      await ensureWidget(command, key);
    }
  };

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const typeAliases = {
      music: ["音乐"],
      weather: ["天气"],
      todo: ["待办"],
      note: ["便签", "笔记"],
      translate: ["翻译"],
      calculator: ["计算器"],
      market: ["行情", "指数"],
      headline: ["新闻"],
      worldClock: ["世界时钟"],
      dialClock: ["表盘"],
      tv: ["电视"]
    };
    const byType = (type) =>
      widgets.find((widget) => {
        const record = widget && typeof widget === "object" ? widget : {};
        const label = `${record.title ?? ""} ${record.name ?? ""} ${record.displayName ?? ""} ${record.definitionName ?? ""}`;
        return (
          record.type === type ||
          record.widgetType === type ||
          record.definitionType === type ||
          record.definitionId === `wd_${type}` ||
          record.definition?.type === type ||
          (typeAliases[type] ?? []).some((alias) => label.includes(alias))
        );
      });
    const widgetId = (type) => byType(type)?.widgetId;
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const command = (tool, args = {}) => ({
      tool,
      args,
      risk: tool === "board.auto_align" ? "confirm" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });

    if (input.includes("放松的不一定播放")) return [command("music.search", { widgetId: widgetId("music"), query: "放松" })];
    if (input.includes("周杰伦经典")) return [command("music.play", { widgetId: widgetId("music"), query: "周杰伦经典" })];
    if (input.includes("便签实例")) return [command("board.add_widget", { definitionId: definitionId("note") })];
    if (input.includes("复盘语音测试")) return [command("todo.add_item", { widgetId: widgetId("todo"), text: "复盘语音测试" })];
    if (input.includes("good night")) return [command("translate.set_draft", { widgetId: widgetId("translate"), sourceText: "good night", targetLang: "zh" })];
    if (input.includes("十二乘十二")) return [command("calculator.set_display", { widgetId: widgetId("calculator"), display: "144" })];
    if (input.includes("纳指给我")) return [command("market.set_indices", { widgetId: widgetId("market"), indexCodes: ["usNDX"] })];
    if (input.includes("东京现在")) return [command("worldClock.set_zones", { widgetId: widgetId("worldClock"), zones: ["Asia/Tokyo"] })];
    if (input.includes("刚刚有什么新闻")) return [command("headline.request_refresh", { widgetId: widgetId("headline"), requestedAt: new Date().toISOString() })];
    if (input.includes("侧边栏收起")) return [command("app.sidebar.set", { mode: "hide" }), command("app.settings.open", {})];
    if (input.includes("马上退出")) return [command("app.fullscreen.set", { mode: "enter" }), command("app.fullscreen.set", { mode: "exit" }), command("app.command_palette.open", { query: "音乐" })];
    if (input.includes("侧边栏显示回来")) return [command("app.sidebar.set", { mode: "show" }), command("app.settings.open", {})];
    if (input.includes("语音相关页面")) return [command("app.settings.open", {}), command("app.command_palette.open", { query: "语音" })];
    if (input.includes("专心一下")) return [command("app.sidebar.set", { mode: "hide" }), command("board.auto_align", {})];
    if (input.includes("输入天气两个字")) return [command("app.fullscreen.set", { mode: "exit" }), command("app.command_palette.open", { query: "天气" })];
    if (input.includes("进入沉浸模式")) return [command("app.fullscreen.set", { mode: "enter" })];
    if (input.includes("AI 小工具草稿")) return [command("app.settings.open", {}), command("app.ai_dialog.open", { prompt: "新建一个 AI 小工具草稿" })];
    if (input.includes("所有弹窗")) return [command("app.command_palette.open", {})];
    if (input.includes("音乐和天气两个窗口")) return [command("app.sidebar.set", { mode: "show" }), command("widget.bring_to_front", { widgetId: widgetId("music") }), command("widget.bring_to_front", { widgetId: widgetId("weather") })];
    if (input.includes("登录音乐")) return [command("app.settings.open", {})];
    if (input.includes("恢复普通窗口")) return [command("app.fullscreen.set", { mode: "exit" }), command("widget.focus", { widgetId: widgetId("note") })];
    if (input.includes("名字先叫每日摘要")) return [command("app.sidebar.set", { mode: "hide" }), command("app.ai_dialog.open", { prompt: "每日摘要" })];
    if (input.includes("如果当前在全屏")) return [command("app.fullscreen.set", { mode: "exit" }), command("app.command_palette.open", {})];
    if (input.includes("进入全屏看电视")) return [command("app.sidebar.set", { mode: "hide" }), command("app.fullscreen.set", { mode: "enter" }), command("tv.play", { widgetId: widgetId("tv"), channelName: "CCTV6", channelUrl: "http://www.douzhicloud.site:35455/gaoma/cctv6.m3u8" })];
    if (input.includes("不要新建工具")) return [command("app.settings.open", {})];
    if (input.includes("显示侧边栏")) return [command("app.fullscreen.set", { mode: "exit" }), command("app.sidebar.set", { mode: "show" })];
    if (input.includes("查找世界时钟")) return [command("app.command_palette.open", { query: "世界时钟" })];
    if (input.includes("侧边栏切换")) return [command("app.sidebar.set", { mode: "toggle" }), command("widget.bring_to_front", { widgetId: widgetId("dialClock") })];
    if (input.includes("清理桌面前")) return [command("app.settings.open", {})];
    if (input.includes("天气")) return [command("weather.set_city", { widgetId: widgetId("weather"), cityCode: "beijing", city: "北京" })];
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 1,
        results: term.includes("放松")
          ? [{ wrapperType: "track", kind: "song", trackId: 4002, trackName: "Sound Therapy: Relax", artistName: "Apple Music", collectionName: "Relax", artworkUrl100: "https://example.test/relax.jpg", previewUrl: "https://example.test/relax.m4a", trackViewUrl: "https://example.test/relax" }]
          : [{ wrapperType: "track", kind: "song", trackId: 4001, trackName: "Love Confession", artistName: "Jay Chou", collectionName: "Jay Chou's Bedtime Stories", artworkUrl100: "https://example.test/jay.jpg", previewUrl: "https://example.test/jay.m4a", trackViewUrl: "https://example.test/jay" }]
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

  const before210 = { music: (await snapshot()).music?.zIndex ?? 0, weather: (await snapshot()).weather?.zIndex ?? 0 };
  const before219 = { dialClock: (await snapshot()).dialClock?.zIndex ?? 0 };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    if (["202", "204", "207", "208", "209", "213", "214", "218"].includes(id)) await closeDialogIfPresent();
    await sendCommand(commandText[id], id === "194" ? 1500 : 1100);
    if (id === "205") {
      if (/待确认/.test(await operation())) await clickDockConfirmByDom();
      if (/待确认/.test(await operation())) await confirmPendingCommand();
      await page
        .waitForFunction(() => !document.querySelector('[data-testid="voice-assistant-operation"]')?.textContent?.includes("待确认"), null, { timeout: 3_000 })
        .catch(() => undefined);
      await page.waitForTimeout(700);
    }
    const state = await snapshot();
    const ok = await noAssistantError();

    if (id === "192") await push(id, /北京/.test(state.weather?.text || "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    else if (id === "193") {
      const query = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
      await push(id, /放松/.test(query) && /Relax|放松/.test(state.music?.text || "") && ok, `query=${query}; music=${JSON.stringify((state.music?.text || "").slice(0, 600))}`);
    } else if (id === "194") {
      const query = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
      await push(id, /周杰伦/.test(query) && /Jay Chou|Love Confession/.test(state.music?.text || "") && ok, `query=${query}; music=${JSON.stringify((state.music?.text || "").slice(0, 600))}`);
    } else if (id === "195") await push(id, /复盘语音测试/.test(state.todo?.text || "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    else if (id === "196") await push(id, /good night/.test(JSON.stringify(state.translate?.inputs || [])) && ok, `inputs=${JSON.stringify(state.translate?.inputs || [])}`);
    else if (id === "197") await push(id, /144/.test(state.calculator?.text || JSON.stringify(state.calculator?.inputs || [])) && ok, `calculator=${JSON.stringify((state.calculator?.text || "").slice(0, 500))}`);
    else if (id === "198") await push(id, /纳斯达克|纳指|NASDAQ/.test(state.market?.text || "") && ok, `market=${JSON.stringify((state.market?.text || "").slice(0, 600))}`);
    else if (id === "199") await push(id, /东京/.test(state.worldClock?.text || "") && ok, `worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 600))}`);
    else if (id === "200") await push(id, Boolean(state.headline) && /新闻|重大/.test(state.headline?.text || "") && ok, `headline=${JSON.stringify((state.headline?.text || "").slice(0, 600))}`);
    else if (id === "201") await push(id, await sidebarHidden() && await settingsVisible() && ok, `sidebarHidden=${await sidebarHidden()}; settings=${await settingsVisible()}`);
    else if (id === "202") await push(id, await paletteVisible() && (await modalInputValue()) === "音乐" && !state.fullscreen && ok, `palette=${await paletteVisible()}; query=${await modalInputValue()}; fullscreen=${state.fullscreen}`);
    else if (id === "203") await push(id, await sidebarVisible() && await settingsVisible() && ok, `sidebarVisible=${await sidebarVisible()}; settings=${await settingsVisible()}`);
    else if (id === "204") await push(id, await paletteVisible() && (await modalInputValue()) === "语音" && ok, `palette=${await paletteVisible()}; query=${await modalInputValue()}`);
    else if (id === "205") {
      const currentOperation = await operation();
      await push(
        id,
        await sidebarHidden() && /(?:已整理桌面小工具|待确认：board\.auto_align)/.test(currentOperation) && ok,
        `sidebarHidden=${await sidebarHidden()}; operation=${currentOperation}`
      );
    }
    else if (id === "206") await push(id, await paletteVisible() && (await modalInputValue()) === "天气" && !state.fullscreen && ok, `query=${await modalInputValue()}; fullscreen=${state.fullscreen}`);
    else if (id === "207") {
      await push(id, state.fullscreen && Boolean(state.music) && ok, `fullscreen=${state.fullscreen}; music=${Boolean(state.music)}`);
      await exitBrowserFullscreen();
    } else if (id === "208") await push(id, await aiVisible() && /草稿/.test(await modalInputValue()) && ok, `ai=${await aiVisible()}; prompt=${await modalInputValue()}`);
    else if (id === "209") await push(id, await paletteVisible() && ok, `palette=${await paletteVisible()}`);
    else if (id === "210") await push(id, await sidebarVisible() && (state.music?.zIndex ?? 0) >= before210.music && (state.weather?.zIndex ?? 0) >= before210.weather && ok, `sidebarVisible=${await sidebarVisible()}; musicZ=${state.music?.zIndex}; weatherZ=${state.weather?.zIndex}`);
    else if (id === "211") await push(id, await settingsVisible() && /登录|Apple Music|试听模式/.test(`${await bodyText()} ${state.music?.text || ""}`) && ok, `settings=${await settingsVisible()}; music=${JSON.stringify((state.music?.text || "").slice(0, 350))}`);
    else if (id === "212") await push(id, /is-focused/.test(state.note?.className || "") && !state.fullscreen && ok, `noteClass=${state.note?.className}; fullscreen=${state.fullscreen}`);
    else if (id === "213") await push(id, await sidebarHidden() && await aiVisible() && (await modalInputValue()) === "每日摘要" && ok, `sidebarHidden=${await sidebarHidden()}; ai=${await aiVisible()}; prompt=${await modalInputValue()}`);
    else if (id === "214") await push(id, await paletteVisible() && !state.fullscreen && ok, `palette=${await paletteVisible()}; fullscreen=${state.fullscreen}`);
    else if (id === "215") {
      const tvMedia = JSON.stringify(state.tv?.media ?? []);
      await push(id, await sidebarHidden() && state.fullscreen && /cctv6|CCTV-?6|电影/i.test(`${state.tv?.text || ""} ${tvMedia}`) && ok, `sidebarHidden=${await sidebarHidden()}; fullscreen=${state.fullscreen}; tvMedia=${tvMedia}`);
      await exitBrowserFullscreen();
    } else if (id === "216") await push(id, await settingsVisible() && !(await aiVisible()) && ok, `settings=${await settingsVisible()}; ai=${await aiVisible()}`);
    else if (id === "217") await push(id, await sidebarVisible() && !state.fullscreen && ok, `sidebarVisible=${await sidebarVisible()}; fullscreen=${state.fullscreen}`);
    else if (id === "218") await push(id, await paletteVisible() && (await modalInputValue()) === "世界时钟" && ok, `query=${await modalInputValue()}`);
    else if (id === "219") await push(id, Boolean(state.dialClock) && (state.dialClock?.zIndex ?? 0) >= before219.dialClock && ok, `dialClockZ=${state.dialClock?.zIndex}; beforeZ=${before219.dialClock}; sidebarVisible=${await sidebarVisible()}`);
    else if (id === "220") await push(id, await settingsVisible() && !/已整理桌面小工具/.test(await operation()) && ok, `settings=${await settingsVisible()}; operation=${await operation()}`);

    if (["201", "202", "203", "204", "206", "208", "209", "211", "213", "214", "216", "218", "220"].includes(id)) {
      await closeDialogIfPresent();
    }
  }

  await page.evaluate((value) => {
    window.__xzRealPageAppShellComplexResults = value;
    let pre = document.getElementById("xz-real-page-app-shell-complex-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-app-shell-complex-results";
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
    throw new Error(`App shell complex real-page group failed: ${failed.length}/${results.length}`);
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
