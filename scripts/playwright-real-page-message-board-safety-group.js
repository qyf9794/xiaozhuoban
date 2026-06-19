const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

  const commandText = {
    "461": "关闭留言板，不要把关闭两个字发出去",
    "462": "留言板发送：我在测试多轮语音",
    "463": "把留言板收起来，同时保留便签",
    "464": "打开留言板并发送收到，不要关闭窗口",
    "465": "留言板回复：部署完成后再测一次",
    "466": "我说关闭留言板时执行关闭，不是发送消息",
    "467": "把天气摘要发到留言板",
    "468": "留言板发一句：音乐已经重新搜索",
    "469": "先清空输入框，再发送测试通过",
    "470": "关闭留言板后打开待办",
    "471": "留言板不要重复发送刚才那句话",
    "472": "发送一条包含英文 realtime ready 的留言",
    "473": "把留言板移到底部，然后发送正在测试",
    "474": "如果留言板没打开，先打开再发收到",
    "475": "不要发消息，只把留言板窗口置顶",
    "476": "留言板发送：十分钟后回来",
    "477": "关闭留言板和新闻窗口",
    "478": "把关闭留言板这个命令写到便签，不要执行",
    "479": "发送消息前先确认内容是我在测试",
    "480": "留言板窗口太碍事了，直接收起来"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MESSAGE_/.test(await operation());

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
        const noteInput = Array.from(el.querySelectorAll("textarea,input")).find(
          (input) => input.getAttribute("placeholder") === "在这里记录你的想法..."
        );
        const messageDraft = Array.from(el.querySelectorAll("textarea,input")).find(
          (input) => input.getAttribute("placeholder") === "输入留言，按 Enter 发送"
        );
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.innerText,
          noteContent: noteInput ? noteInput.value : "",
          messageDraft: messageDraft ? messageDraft.value : "",
          inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
            ariaLabel: input.getAttribute("aria-label"),
            placeholder: input.getAttribute("placeholder"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      const all = (needles) => widgets.filter((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        messageBoard: find(["留言板"]),
        messageBoards: all(["留言板"]),
        note: find(["便签"]),
        weather: find(["天气"]),
        todo: find(["待办"]),
        headline: find(["重大新闻", "头条新闻", "财经新闻"]),
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

  const fillMessageDraft = async (value) => {
    await page
      .locator("[data-widget-id]")
      .filter({ hasText: "留言板" })
      .locator('textarea[placeholder="输入留言，按 Enter 发送"]')
      .fill(value)
      .catch(() => undefined);
  };

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 21, weather_code: 3, is_day: 1, wind_speed_10m: 8 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21"],
          weather_code: [3, 61, 0],
          temperature_2m_max: [27, 25, 29],
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
      risk: "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const remove = (type) => command("widget.remove", { widgetId: existingOrPlanned(type) });
    const send = (text) => [...addIfNeeded("messageBoard"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text })];

    if (input === "seed:messageBoard") return [add("messageBoard")];
    if (input === "seed:note") return [add("note")];
    if (input === "seed:weather") return [add("weather"), command("weather.set_city", { widgetId: planned("weather"), cityCode: "beijing" })];
    if (input === "seed:todo") return [add("todo")];
    if (input === "seed:headline") return [add("headline"), command("headline.request_refresh", { widgetId: planned("headline") })];
    if (input === "seed:closeMessageBoard") return [remove("messageBoard")];
    if (input === "seed:message:收到") return send("收到");

    if (input === commandText["461"]) return [remove("messageBoard")];
    if (input === commandText["462"]) return send("我在测试多轮语音");
    if (input === commandText["463"]) return [remove("messageBoard"), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "保留便签", mode: "append" })];
    if (input === commandText["464"]) return [...addIfNeeded("messageBoard"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "收到" })];
    if (input === commandText["465"]) return send("部署完成后再测一次");
    if (input === commandText["466"]) return [remove("messageBoard")];
    if (input === commandText["467"]) return [
      command("weather.set_city", { widgetId: existingOrPlanned("weather"), cityCode: "beijing" }),
      ...send("天气摘要：北京 21°C，多云")
    ];
    if (input === commandText["468"]) return send("音乐已经重新搜索");
    if (input === commandText["469"]) return send("测试通过");
    if (input === commandText["470"]) return [remove("messageBoard"), ...addIfNeeded("todo")];
    if (input === commandText["471"]) return send("不会重复发送刚才那句话");
    if (input === commandText["472"]) return send("realtime ready");
    if (input === commandText["473"]) return [
      ...addIfNeeded("messageBoard"),
      command("widget.move", { widgetId: existingOrPlanned("messageBoard"), x: 520, y: 640 }),
      command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "正在测试" })
    ];
    if (input === commandText["474"]) return [...addIfNeeded("messageBoard"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "收到" })];
    if (input === commandText["475"]) return [command("widget.bring_to_front", { widgetId: existingOrPlanned("messageBoard") })];
    if (input === commandText["476"]) return send("十分钟后回来");
    if (input === commandText["477"]) return [remove("messageBoard"), remove("headline")];
    if (input === commandText["478"]) return [...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "关闭留言板", mode: "append" })];
    if (input === commandText["479"]) return send("我在测试");
    if (input === commandText["480"]) return [remove("messageBoard")];
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
        messageBoard: ["留言板"],
        note: ["便签"],
        weather: ["天气"],
        todo: ["待办"],
        headline: ["重大新闻", "头条新闻", "财经新闻"]
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
      const plannedCommands = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, module: "message-board-safety", ...item }));
      for (const [index, commandItem] of plannedCommands.entries()) {
        const widgetIdArg = typeof commandItem.args?.widgetId === "string" ? commandItem.args.widgetId : "";
        const plannedType = widgetIdArg.startsWith("planned_widget_") ? widgetIdArg.slice("planned_widget_".length) : "";
        if (!plannedType) continue;
        const addDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.add_widget" && String(candidate.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0] === plannedType);
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
            normalizedText: input,
            commands: plannedCommands,
            dependencies: [],
            executionGroups: [{ id: "group_1", mode: "sequential", commandIds: plannedCommands.map((item) => item.id) }],
            confidence: 0.94,
            needsConfirmation: false,
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
    forcedWidgetIds.messageBoard = state.messageBoard?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.weather = state.weather?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.headline = state.headline?.id;
  };

  const seedBase = async (id) => {
    if (id !== "474") await ensureWidget("seed:messageBoard", "messageBoard");
    if (["463", "478"].includes(id)) await ensureWidget("seed:note", "note");
    if (id === "467") await ensureWidget("seed:weather", "weather", 1_200);
    if (id === "475") await ensureWidget("seed:note", "note");
    if (id === "477") await ensureWidget("seed:headline", "headline", 1_200);
    if (id === "471") {
      await sendCommand("seed:message:收到", 1_000);
    }
    if (id === "474") {
      const state = await snapshot();
      if (state.messageBoard) {
        await captureForcedIds();
        await sendCommand("seed:closeMessageBoard", 1_000);
      }
    }
    if (id === "469") {
      await fillMessageDraft("旧草稿");
    }
  };

  const countMatches = (text, pattern) => (text.match(pattern) ?? []).length;

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

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["467", "473", "477"].includes(id) ? 1_700 : 1_300);
    await page.waitForTimeout(250);
    const state = await snapshot();
    const ok = await noAssistantError();
    const messageText = state.messageBoard?.text ?? "";
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;

    if (id === "461") {
      await push(id, !state.messageBoard && !/关闭/.test(messageText) && ok, `messageBoard=${Boolean(state.messageBoard)}; messageText=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "462") {
      await push(id, /我在测试多轮语音/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "463") {
      await push(id, !state.messageBoard && Boolean(state.note) && /保留便签|便签/.test(noteText) && ok, `messageBoard=${Boolean(state.messageBoard)}; note=${JSON.stringify(noteText.slice(0, 500))}`);
    } else if (id === "464") {
      await push(id, Boolean(state.messageBoard) && /收到/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "465") {
      await push(id, /部署完成后再测一次/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "466") {
      await push(id, !state.messageBoard && !/关闭/.test(messageText) && ok, `messageBoard=${Boolean(state.messageBoard)}; messageText=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "467") {
      await push(id, /北京|天气/.test(state.weather?.text ?? "") && /天气摘要：北京/.test(messageText) && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}; messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "468") {
      await push(id, /音乐已经重新搜索/.test(messageText) && !/音乐播放器|Apple Music/.test(state.bodyText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}; hasMusic=${/音乐播放器|Apple Music/.test(state.bodyText)}`);
    } else if (id === "469") {
      await push(id, /测试通过/.test(messageText) && !/旧草稿/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "470") {
      await push(id, !state.messageBoard && Boolean(state.todo) && ok, `messageBoard=${Boolean(state.messageBoard)}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 400))}`);
    } else if (id === "471") {
      await push(id, countMatches(messageText, /收到/g) === 1 && /不会重复发送刚才那句话/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 700))}`);
    } else if (id === "472") {
      await push(id, /realtime ready/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "473") {
      await push(id, /正在测试/.test(messageText) && (state.messageBoard?.rect.y ?? 0) > 430 && ok, `messageBoardRect=${JSON.stringify(state.messageBoard?.rect)}; text=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "474") {
      await push(id, Boolean(state.messageBoard) && /收到/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "475") {
      await push(id, Boolean(state.messageBoard) && state.messageBoard?.zIndex === state.maxZ && !/只把留言板窗口置顶|不要发消息/.test(messageText) && ok, `z=${state.messageBoard?.zIndex}/${state.maxZ}; messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "476") {
      await push(id, /十分钟后回来/.test(messageText) && !/倒计时/.test(state.bodyText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}; hasCountdown=${/倒计时/.test(state.bodyText)}`);
    } else if (id === "477") {
      await push(id, !state.messageBoard && !state.headline && ok, `messageBoard=${Boolean(state.messageBoard)}; headline=${Boolean(state.headline)}`);
    } else if (id === "478") {
      await push(id, Boolean(state.messageBoard) && /关闭留言板/.test(noteText) && ok, `messageBoard=${Boolean(state.messageBoard)}; note=${JSON.stringify(noteText.slice(0, 500))}`);
    } else if (id === "479") {
      await push(id, /我在测试/.test(messageText) && !/发送消息前先确认/.test(messageText) && ok, `messageBoard=${JSON.stringify(messageText.slice(0, 500))}`);
    } else if (id === "480") {
      await push(id, !state.messageBoard && ok, `messageBoard=${Boolean(state.messageBoard)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageMessageBoardSafetyResults = value;
    let pre = document.getElementById("xz-real-page-message-board-safety-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-message-board-safety-results";
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
    throw new Error(`Message board safety real-page group failed: ${failed.length}/${results.length}`);
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
