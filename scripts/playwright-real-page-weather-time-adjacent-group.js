const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

  const commandText = {
    "321": "查北京今天会不会下雨，顺便记到便签",
    "322": "看上海现在天气，如果冷就提醒我带外套",
    "323": "明早去杭州，帮我看天气并加一条待办",
    "324": "洛杉矶天气打开看看，再显示本地时间",
    "325": "广州天气怎么样，同时刷新空气相关摘要",
    "326": "帮我查武汉今天适不适合跑步",
    "327": "成都天气卡片放最前，别打开新闻",
    "328": "波士顿现在冷不冷，再换算华氏和摄氏",
    "329": "北京和上海天气都打开，我要对比",
    "330": "我明天出门，先查杭州天气再设早上八点提醒",
    "331": "查东京天气，同时打开东京世界时钟",
    "332": "给我看巴黎天气，顺便显示巴黎时间",
    "333": "查深圳天气，不要误打开重大新闻",
    "334": "外面适合带伞吗，默认看北京",
    "335": "帮我把天气城市改成纽约并聚焦天气卡片",
    "336": "查广州天气后把结果发到留言板",
    "337": "切换天气到成都，同时打开倒计时十五分钟",
    "338": "今天适合洗车吗，看上海天气",
    "339": "查北京体感温度，然后翻译成英文一句话",
    "340": "天气窗口如果没开，先打开再查武汉"
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
      const findAll = (needle) => widgets.filter((widget) => widget.text.includes(needle));
      return {
        bodyText: document.body.innerText,
        widgets,
        weather: find(["天气"]),
        weatherAll: findAll("天气"),
        note: find(["便签"]),
        todo: find(["待办"]),
        worldClock: find(["世界时钟"]),
        headline: find(["重大新闻"]),
        converter: find(["单位换算", "换算"]),
        messageBoard: find(["留言板"]),
        countdown: find(["倒计时"]),
        translate: find(["翻译"]),
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

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 18, weather_code: 61, is_day: 1, wind_speed_10m: 12 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"],
          weather_code: [61, 3, 0, 45],
          temperature_2m_max: [23, 24, 25, 22],
          temperature_2m_min: [15, 16, 17, 14]
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
      risk: "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const city = (cityCode) => command("weather.set_city", { widgetId: existingOrPlanned("weather"), cityCode });

    if (input === commandText["321"]) return [city("beijing"), command("note.write", { widgetId: existingOrPlanned("note"), content: "北京今天可能有雨", mode: "append" })];
    if (input === commandText["322"]) return [city("shanghai"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "带外套" })];
    if (input === commandText["323"]) return [city("hangzhou"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "明早去杭州前查看天气" })];
    if (input === commandText["324"]) return [city("los-angeles"), command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["America/Los_Angeles"] })];
    if (input === commandText["325"]) return [city("guangzhou"), command("headline.request_refresh", { widgetId: existingOrPlanned("headline") })];
    if (input === commandText["326"]) return [city("wuhan")];
    if (input === commandText["327"]) return [city("chengdu"), command("widget.bring_to_front", { widgetId: existingOrPlanned("weather") }), command("widget.focus", { widgetId: existingOrPlanned("weather") })];
    if (input === commandText["328"]) return [city("boston"), command("converter.set", { widgetId: existingOrPlanned("converter"), category: "temperature", value: 32, fromUnit: "f", toUnit: "c" })];
    if (input === commandText["329"]) {
      return [
        add("weather"),
        command("weather.set_city", { widgetId: planned("weather"), cityCode: "shanghai" }),
        command("weather.set_city", { widgetId: existingOrPlanned("weather"), cityCode: "beijing" })
      ];
    }
    if (input === commandText["330"]) return [city("hangzhou"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "早上八点提醒出门", dueAt: "2026-06-20T00:00:00.000Z" })];
    if (input === commandText["331"]) return [city("tokyo"), add("worldClock"), command("worldClock.set_zones", { widgetId: planned("worldClock"), zones: ["Asia/Tokyo"] })];
    if (input === commandText["332"]) return [city("paris"), add("worldClock"), command("worldClock.set_zones", { widgetId: planned("worldClock"), zones: ["Europe/Paris"] })];
    if (input === commandText["333"]) return [city("shenzhen")];
    if (input === commandText["334"]) return [city("beijing")];
    if (input === commandText["335"]) return [city("new-york"), command("widget.focus", { widgetId: existingOrPlanned("weather") })];
    if (input === commandText["336"]) return [city("guangzhou"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "广州天气摘要：18°C，小雨" })];
    if (input === commandText["337"]) return [city("chengdu"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 900, start: true })];
    if (input === commandText["338"]) return [city("shanghai")];
    if (input === commandText["339"]) return [city("beijing"), command("translate.set_draft", { widgetId: existingOrPlanned("translate"), sourceText: "Beijing feels like 18 degrees Celsius.", targetLang: "en" })];
    if (input === commandText["340"]) return [add("weather"), command("weather.set_city", { widgetId: planned("weather"), cityCode: "wuhan" })];
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
        weather: ["天气"],
        note: ["便签"],
        todo: ["待办"],
        worldClock: ["世界时钟"],
        headline: ["重大新闻"],
        converter: ["单位换算", "换算"],
        messageBoard: ["留言板"],
        countdown: ["倒计时"],
        translate: ["翻译"]
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
    if (id !== "340") await ensureWidget("打开天气", "weather", 1_000);
    if (id === "321") await ensureWidget("新建便签实例用于测试", "note", 900);
    if (["322", "323", "330"].includes(id)) await ensureWidget("打开待办", "todo", 900);
    if (id === "324") await ensureWidget("看北京和伦敦时间", "worldClock", 900);
    if (id === "325") await ensureWidget("打开新闻", "headline", 900);
    if (id === "328") await ensureWidget("打开换算器", "converter", 900);
    if (id === "329") await ensureWidget("打开天气", "weather", 900);
    if (id === "336") await ensureWidget("打开留言板", "messageBoard", 900);
    if (id === "337") await ensureWidget("打开倒计时", "countdown", 900);
    if (id === "339") await ensureWidget("打开翻译", "translate", 900);
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.weather = state.weather?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.worldClock = state.worldClock?.id;
    forcedWidgetIds.headline = state.headline?.id;
    forcedWidgetIds.converter = state.converter?.id;
    forcedWidgetIds.messageBoard = state.messageBoard?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.translate = state.translate?.id;
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["329", "331", "332", "340"].includes(id) ? 1_700 : 1_300);
    const state = await snapshot();
    const ok = await noAssistantError();
    const weatherText = (state.weather?.text || "").slice(0, 700);

    if (id === "321") {
      await push(id, /北京/.test(weatherText) && /北京今天可能有雨/.test(`${state.note?.text ?? ""} ${JSON.stringify(state.note?.inputs ?? [])}`) && ok, `weather=${JSON.stringify(weatherText)}; note=${JSON.stringify(state.note?.inputs ?? [])}`);
    } else if (id === "322") {
      await push(id, /上海/.test(weatherText) && /带外套/.test(state.todo?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "323") {
      await push(id, /杭州/.test(weatherText) && /杭州/.test(state.todo?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "324") {
      await push(id, /洛杉矶/.test(weatherText) && /洛杉矶|Los Angeles/.test(state.worldClock?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 700))}`);
    } else if (id === "325") {
      await push(id, /广州/.test(weatherText) && Boolean(state.headline) && ok, `weather=${JSON.stringify(weatherText)}; headline=${JSON.stringify((state.headline?.text || "").slice(0, 400))}`);
    } else if (id === "326") {
      await push(id, /武汉/.test(weatherText) && ok, `weather=${JSON.stringify(weatherText)}`);
    } else if (id === "327") {
      await push(id, /成都/.test(weatherText) && state.weather?.zIndex === state.maxZ && !state.headline && ok, `weatherZ=${state.weather?.zIndex}/${state.maxZ}; headline=${Boolean(state.headline)}`);
    } else if (id === "328") {
      await push(id, /波士顿/.test(weatherText) && /0\s*c/i.test(state.converter?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; converter=${JSON.stringify((state.converter?.text || "").slice(0, 500))}`);
    } else if (id === "329") {
      const allWeatherText = state.weatherAll.map((widget) => widget.text).join(" ");
      await push(id, state.weatherAll.length >= 2 && /北京/.test(allWeatherText) && /上海/.test(allWeatherText) && ok, `weatherCount=${state.weatherAll.length}; text=${JSON.stringify(allWeatherText.slice(0, 700))}`);
    } else if (id === "330") {
      await push(id, /杭州/.test(weatherText) && /早上八点提醒出门/.test(state.todo?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "331") {
      await push(id, /东京/.test(weatherText) && /东京/.test(state.worldClock?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 700))}`);
    } else if (id === "332") {
      await push(id, /巴黎/.test(weatherText) && /巴黎/.test(state.worldClock?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; worldClock=${JSON.stringify((state.worldClock?.text || "").slice(0, 700))}`);
    } else if (id === "333") {
      await push(id, /深圳/.test(weatherText) && !state.headline && ok, `weather=${JSON.stringify(weatherText)}; headline=${Boolean(state.headline)}`);
    } else if (id === "334") {
      await push(id, /北京/.test(weatherText) && /雨|小雨/.test(weatherText) && ok, `weather=${JSON.stringify(weatherText)}`);
    } else if (id === "335") {
      await push(id, /纽约/.test(weatherText) && /is-focused/.test(state.weather?.className ?? "") && ok, `weather=${JSON.stringify(weatherText)}; className=${state.weather?.className}`);
    } else if (id === "336") {
      await push(id, /广州/.test(weatherText) && /广州天气摘要/.test(state.messageBoard?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 700))}`);
    } else if (id === "337") {
      await push(id, /成都/.test(weatherText) && /15:00|14:59|900|十五分钟/.test(state.countdown?.text ?? "") && ok, `weather=${JSON.stringify(weatherText)}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}`);
    } else if (id === "338") {
      await push(id, /上海/.test(weatherText) && ok, `weather=${JSON.stringify(weatherText)}`);
    } else if (id === "339") {
      await push(id, /北京/.test(weatherText) && /Beijing feels like/.test(JSON.stringify(state.translate?.inputs ?? [])) && ok, `weather=${JSON.stringify(weatherText)}; translateInputs=${JSON.stringify(state.translate?.inputs ?? [])}`);
    } else if (id === "340") {
      await push(id, Boolean(state.weather) && /武汉/.test(weatherText) && ok, `weather=${JSON.stringify(weatherText)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageWeatherTimeAdjacentResults = value;
    let pre = document.getElementById("xz-real-page-weather-time-adjacent-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-weather-time-adjacent-results";
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
    throw new Error(`Weather/time adjacent real-page group failed: ${failed.length}/${results.length}`);
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
