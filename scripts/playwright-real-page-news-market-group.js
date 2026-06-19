const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

  const commandText = {
    "421": "刷新重大新闻，然后打开美股三大指数",
    "422": "看纳指和道指，顺便刷新财经新闻",
    "423": "打开恒生和上证行情，不要自动开全球指数",
    "424": "今天有什么头条新闻，结果追加到便签",
    "425": "看美股三大指数，同时显示纽约时间",
    "426": "只刷新新闻，不要打开行情窗口",
    "427": "把新闻窗口放到右侧，行情放到左侧",
    "428": "查询上证指数后把市场窗口置顶",
    "429": "打开财经观察桌板并刷新重大新闻",
    "430": "看恒生指数，如果没有行情工具就打开命令面板",
    "431": "刷新新闻后发一句摘要到留言板",
    "432": "全球指数不要刷新，先关闭那个小工具",
    "433": "打开重大新闻但不要播放电视",
    "434": "行情窗口太大了，缩小后显示纳指",
    "435": "把新闻和天气并排放，我要看今天情况",
    "436": "刷新头条后提醒我十五分钟后再看",
    "437": "打开上证和深证行情，别误开音乐",
    "438": "只显示美股指数，关闭港股窗口",
    "439": "新闻刷新失败就记录到便签",
    "440": "打开重大新闻小工具后马上聚焦它"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数/.test(await operation());

  const clickDockButton = async (label) => {
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(300);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn|待确认/.test(dockText)) {
      await clickDockButton("取消");
    }
  };

  const sendCommand = async (command, waitMs = 1_150) => {
    await settlePrompts();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    await settlePrompts();
  };

  const closeDialogIfPresent = async () => {
    const overlay = page.locator(".modal-overlay").first();
    if (await overlay.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(200);
    }
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
            ariaLabel: input.getAttribute("aria-label"),
            placeholder: input.getAttribute("placeholder"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        headline: find(["重大新闻"]),
        market: find(["全球指数", "标普500", "纳斯达克", "上证指数", "恒生指数"]),
        note: find(["便签"]),
        worldClock: find(["世界时钟"]),
        messageBoard: find(["留言板"]),
        weather: find(["天气"]),
        countdown: find(["倒计时"]),
        todo: find(["待办"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        maxZ: Math.max(...widgets.map((widget) => widget.zIndex), 0),
        activeBoardName:
          Array.from(document.querySelectorAll("button, [role='button'], .sidebar-panel *"))
            .map((element) => element.textContent?.trim() || "")
            .find((text) => /财经观察/.test(text)) || ""
      };
    });

  const paletteVisible = async () =>
    page.locator(".modal-overlay").filter({ hasText: /搜索|添加 Widget|行情|全球指数/ }).first().isVisible().catch(() => false);

  const modalInputValue = async () =>
    page.locator(".modal-overlay input").first().inputValue().catch(() => "");

  const widgetIdFromDom = async (needles) =>
    page.locator("[data-widget-id]").evaluateAll(
      (elements, expected) => {
        const target = elements.find((element) => expected.some((needle) => element.textContent?.includes(needle)));
        return target?.getAttribute("data-widget-id") ?? undefined;
      },
      needles
    );

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 21, weather_code: 3, is_day: 1, wind_speed_10m: 9 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21"],
          weather_code: [3, 61, 0],
          temperature_2m_max: [25, 24, 27],
          temperature_2m_min: [18, 17, 19]
        }
      })
    });
  });

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const boards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const activeBoardId = context.boardId;
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId;
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const boardId = (name) => boards.find((board) => String(board.name ?? "").includes(name))?.boardId ?? activeBoardId;
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
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const headline = () => [...addIfNeeded("headline"), command("headline.request_refresh", { widgetId: existingOrPlanned("headline"), requestedAt: "2026-06-19T10:30:00.000Z" })];
    const market = (indexCodes) => [...addIfNeeded("market"), command("market.set_indices", { widgetId: existingOrPlanned("market"), indexCodes })];
    const move = (type, x, y) => command("widget.move", { widgetId: existingOrPlanned(type), x, y });

    if (input === "seed:headline") return [add("headline")];
    if (input === "seed:market") return [add("market")];
    if (input === "seed:note") return [add("note")];
    if (input === "seed:worldClock") return [add("worldClock")];
    if (input === "seed:messageBoard") return [add("messageBoard")];
    if (input === "seed:weather") return [add("weather")];
    if (input === "seed:countdown") return [add("countdown")];
    if (input === "seed:todo") return [add("todo")];
    if (input === "seed:market-hk") return [...addIfNeeded("market"), command("market.set_indices", { widgetId: existingOrPlanned("market"), indexCodes: ["hkHSI"] })];

    if (input === commandText["421"]) return [...headline(), ...market(["usINX", "usNDX", "usDJI"])];
    if (input === commandText["422"]) return [...market(["usNDX", "usDJI"]), ...headline()];
    if (input === commandText["423"]) return [...market(["hkHSI", "sh000001"])];
    if (input === commandText["424"]) return [...headline(), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "头条新闻摘要：Realtime 分级加载检查完成", mode: "append" })];
    if (input === commandText["425"]) return [...market(["usINX", "usNDX", "usDJI"]), ...addIfNeeded("worldClock"), command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["America/New_York"] })];
    if (input === commandText["426"]) return [...headline()];
    if (input === commandText["427"]) return [...headline(), ...market(["usINX", "usNDX", "usDJI"]), move("headline", 920, 72), move("market", 40, 72)];
    if (input === commandText["428"]) return [...market(["sh000001"]), command("widget.bring_to_front", { widgetId: existingOrPlanned("market") })];
    if (input === commandText["429"]) return [command("board.create", { name: "财经观察" }), add("headline"), command("headline.request_refresh", { widgetId: planned("headline"), requestedAt: "2026-06-19T10:31:00.000Z" })];
    if (input === commandText["430"]) return [...market(["hkHSI"]), command("app.command_palette.open", { query: "行情" })];
    if (input === commandText["431"]) return [...headline(), ...addIfNeeded("messageBoard"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "新闻摘要：已刷新财经新闻" })];
    if (input === commandText["432"]) return [command("widget.remove", { widgetId: existingOrPlanned("market") })];
    if (input === commandText["433"]) return [...headline()];
    if (input === commandText["434"]) return [...market(["usNDX"]), command("widget.resize", { widgetId: existingOrPlanned("market"), w: 260, h: 240 })];
    if (input === commandText["435"]) return [...headline(), ...addIfNeeded("weather"), command("weather.set_city", { widgetId: existingOrPlanned("weather"), cityCode: "beijing" }), move("headline", 40, 72), move("weather", 420, 72)];
    if (input === commandText["436"]) return [...headline(), ...addIfNeeded("countdown"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 900, start: true }), ...addIfNeeded("todo"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "十五分钟后再看头条" })];
    if (input === commandText["437"]) return [...market(["sh000001", "sz399001"])];
    if (input === commandText["438"]) return [command("widget.remove", { widgetId: existingOrPlanned("market") }), add("market"), command("market.set_indices", { widgetId: planned("market"), indexCodes: ["usINX", "usNDX", "usDJI"] })];
    if (input === commandText["439"]) return [...headline(), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "新闻刷新失败：已记录失败时间 2026-06-19 10:32", mode: "append" })];
    if (input === commandText["440"]) return [...headline(), command("widget.focus", { widgetId: existingOrPlanned("headline") })];
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
        .map((item) => String(item.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0])
        .filter(Boolean)
    );
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) continue;
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) continue;
      const fallback = {
        headline: ["重大新闻", "新闻"],
        market: ["全球指数", "标普500", "纳斯达克", "上证指数", "恒生指数"],
        note: ["便签"],
        worldClock: ["世界时钟"],
        messageBoard: ["留言板"],
        weather: ["天气"],
        countdown: ["倒计时"],
        todo: ["待办"]
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
        const boardCreateDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.create");
        const dependsOn = [];
        if (boardCreateDependency) dependsOn.push(boardCreateDependency.id);
        if (addDependency) dependsOn.push(addDependency.id);
        if (dependsOn.length) commandItem.dependsOn = [...(commandItem.dependsOn ?? []), ...dependsOn];
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

  const ensureWidget = async (seedCommand, key, waitMs = 1_000) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(seedCommand, waitMs);
    state = await snapshot();
    return state[key];
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.headline = state.headline?.id;
    forcedWidgetIds.market = state.market?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.worldClock = state.worldClock?.id;
    forcedWidgetIds.messageBoard = state.messageBoard?.id;
    forcedWidgetIds.weather = state.weather?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.todo = state.todo?.id;
  };

  const seedBase = async (id) => {
    if (["421", "422", "424", "425", "427", "428", "431", "434", "435", "436", "438", "439"].includes(id)) await ensureWidget("seed:headline", "headline");
    if (["421", "422", "427", "428", "432", "434", "438"].includes(id)) await ensureWidget("seed:market", "market");
    if (["424", "439"].includes(id)) await ensureWidget("seed:note", "note");
    if (id === "425") await ensureWidget("seed:worldClock", "worldClock");
    if (id === "431") await ensureWidget("seed:messageBoard", "messageBoard");
    if (id === "435") await ensureWidget("seed:weather", "weather");
    if (id === "436") {
      await ensureWidget("seed:countdown", "countdown");
      await ensureWidget("seed:todo", "todo");
    }
    if (id === "438") await sendCommand("seed:market-hk", 1_100);
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

  const marketText = (state) => state.market?.text ?? "";
  const headlineText = (state) => state.headline?.text ?? "";

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    await closeDialogIfPresent();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["429", "430", "438"].includes(id) ? 1_700 : 1_300);
    const state = await snapshot();
    const ok = await noAssistantError();
    const market = marketText(state);
    const headlineStateText = headlineText(state);
    const noteText = `${state.note?.text ?? ""} ${JSON.stringify(state.note?.inputs ?? [])}`;

    if (id === "421") {
      await push(id, /重大新闻/.test(headlineStateText) && /标普500/.test(market) && /纳斯达克/.test(market) && /道琼斯/.test(market) && ok, `headline=${JSON.stringify(headlineStateText.slice(0, 500))}; market=${JSON.stringify(market.slice(0, 700))}`);
    } else if (id === "422") {
      await push(id, /纳斯达克/.test(market) && /道琼斯/.test(market) && /重大新闻/.test(headlineStateText) && ok, `market=${JSON.stringify(market.slice(0, 700))}; headline=${JSON.stringify(headlineStateText.slice(0, 500))}`);
    } else if (id === "423") {
      await push(id, /恒生指数\s*✕/.test(market) && /上证指数\s*✕/.test(market) && !/标普500\s*✕|纳斯达克100\s*✕|道琼斯工业\s*✕/.test(market) && !state.headline && ok, `market=${JSON.stringify(market.slice(0, 700))}; headline=${Boolean(state.headline)}`);
    } else if (id === "424") {
      await push(id, /重大新闻/.test(headlineStateText) && /头条新闻摘要/.test(noteText) && !/计算器/.test(state.bodyText) && ok, `headline=${JSON.stringify(headlineStateText.slice(0, 500))}; note=${JSON.stringify(noteText.slice(0, 700))}`);
    } else if (id === "425") {
      await push(id, /标普500/.test(market) && /纳斯达克/.test(market) && /道琼斯/.test(market) && /纽约|New York/.test(state.worldClock?.text ?? "") && ok, `market=${JSON.stringify(market.slice(0, 700))}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 700))}`);
    } else if (id === "426") {
      await push(id, Boolean(state.headline) && !state.market && ok, `headline=${Boolean(state.headline)}; market=${Boolean(state.market)}`);
    } else if (id === "427") {
      await push(id, state.headline?.rect.x > state.market?.rect.x && state.headline?.rect.x - state.market?.rect.x > 500 && ok, `headlineX=${state.headline?.rect.x}; marketX=${state.market?.rect.x}`);
    } else if (id === "428") {
      await push(id, /上证指数/.test(market) && state.market?.zIndex === state.maxZ && ok, `marketZ=${state.market?.zIndex}/${state.maxZ}; market=${JSON.stringify(market.slice(0, 500))}`);
    } else if (id === "429") {
      await push(id, /财经观察/.test(state.bodyText) && Boolean(state.headline) && ok, `boardName=${JSON.stringify(state.activeBoardName)}; headline=${Boolean(state.headline)}`);
    } else if (id === "430") {
      await push(id, /恒生指数/.test(market) && (await paletteVisible()) && (await modalInputValue()) === "行情" && ok, `market=${JSON.stringify(market.slice(0, 500))}; palette=${await paletteVisible()}; query=${await modalInputValue()}`);
    } else if (id === "431") {
      await push(id, /重大新闻/.test(headlineStateText) && /新闻摘要/.test(state.messageBoard?.text ?? "") && ok, `headline=${JSON.stringify(headlineStateText.slice(0, 500))}; messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 700))}`);
    } else if (id === "432") {
      await push(id, !state.market && ok, `market=${Boolean(state.market)}; body=${JSON.stringify(state.bodyText.slice(0, 500))}`);
    } else if (id === "433") {
      await push(id, Boolean(state.headline) && !state.tv && ok, `headline=${Boolean(state.headline)}; tv=${Boolean(state.tv)}`);
    } else if (id === "434") {
      await push(id, /纳斯达克/.test(market) && (state.market?.rect.w ?? 999) <= 320 && ok, `marketRect=${JSON.stringify(state.market?.rect)}; market=${JSON.stringify(market.slice(0, 500))}`);
    } else if (id === "435") {
      const aligned = Math.abs((state.headline?.rect.y ?? 0) - (state.weather?.rect.y ?? 999)) < 80;
      await push(id, Boolean(state.headline) && /北京/.test(state.weather?.text ?? "") && aligned && ok, `headlineRect=${JSON.stringify(state.headline?.rect)}; weatherRect=${JSON.stringify(state.weather?.rect)}; weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    } else if (id === "436") {
      await push(id, Boolean(state.headline) && /15:00|14:59|900|十五分钟/.test(state.countdown?.text ?? "") && /十五分钟后再看头条/.test(state.todo?.text ?? "") && ok, `countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "437") {
      await push(id, /上证指数/.test(market) && /深证成指/.test(market) && !state.music && ok, `market=${JSON.stringify(market.slice(0, 700))}; music=${Boolean(state.music)}`);
    } else if (id === "438") {
      await push(id, Boolean(state.market) && /标普500/.test(market) && /纳斯达克/.test(market) && /道琼斯/.test(market) && !/恒生指数/.test(market) && ok, `market=${JSON.stringify(market.slice(0, 700))}`);
    } else if (id === "439") {
      await push(id, /重大新闻/.test(headlineStateText) && /新闻刷新失败/.test(noteText) && ok, `headline=${JSON.stringify(headlineStateText.slice(0, 500))}; note=${JSON.stringify(noteText.slice(0, 700))}`);
    } else if (id === "440") {
      await push(id, Boolean(state.headline) && /is-focused/.test(state.headline?.className ?? "") && ok, `headlineClass=${state.headline?.className}; headline=${JSON.stringify(headlineStateText.slice(0, 500))}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageNewsMarketResults = value;
    let pre = document.getElementById("xz-real-page-news-market-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-news-market-results";
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
    throw new Error(`News/market real-page group failed: ${failed.length}/${results.length}`);
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
