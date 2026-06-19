const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

  const commandText = {
    "401": "把 hello world 翻译成中文，然后复制结果",
    "402": "把今天适合出门吗翻译成英文",
    "403": "计算十二乘十二，再把结果写进便签",
    "404": "2 斤是多少克，同时打开换算器",
    "405": "三点五公里换算成米",
    "406": "把 good night realtime 翻译成中文",
    "407": "计算 199 加 299，然后添加到剪贴板",
    "408": "五美元大概是多少人民币，先打开换算器等待我确认汇率",
    "409": "把十平方米换算成平方厘米",
    "410": "把一小时二十分钟换算成分钟",
    "411": "翻译：close message board，不要执行关闭命令",
    "412": "计算十五分钟加二十五分钟是多少",
    "413": "把两公斤半换算成克",
    "414": "把 Fahrenheit 68 转成摄氏度",
    "415": "把播放轻松音乐翻译成英文",
    "416": "计算 1024 除以 8，并显示在计算器",
    "417": "把十二米换成公里再写到便签",
    "418": "翻译一段：the music is still preview mode",
    "419": "把 0.9 以下交给 realtime 翻译成英文备忘",
    "420": "计算部署失败次数三加五再乘二"
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

  const sendCommand = async (command, waitMs = 1_100) => {
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
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.innerText,
          noteContent: noteInput ? noteInput.value : "",
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
        translate: find(["快速翻译", "翻译"]),
        clipboard: find(["剪贴板"]),
        calculator: find(["计算器"]),
        converter: find(["换算"]),
        note: find(["便签"]),
        weather: find(["天气"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        messageBoard: find(["留言板"])
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
    const withTarget = (type, tool, args = {}) => [...addIfNeeded(type), command(tool, { widgetId: existingOrPlanned(type), ...args })];

    if (input === commandText["401"]) return [...withTarget("translate", "translate.set_draft", { sourceText: "hello world", targetLang: "zh-CN" }), ...addIfNeeded("clipboard"), command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "你好，世界" })];
    if (input === commandText["402"]) return withTarget("translate", "translate.set_draft", { sourceText: "今天适合出门吗", targetLang: "en" });
    if (input === commandText["403"]) return [...withTarget("calculator", "calculator.set_display", { display: "144" }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "十二乘十二 = 144", mode: "append" })];
    if (input === commandText["404"]) return withTarget("converter", "converter.set", { category: "weight", value: "1", fromUnit: "kg", toUnit: "g" });
    if (input === commandText["405"]) return withTarget("converter", "converter.set", { category: "length", value: "3.5", fromUnit: "km", toUnit: "m" });
    if (input === commandText["406"]) return withTarget("translate", "translate.set_draft", { sourceText: "good night realtime", targetLang: "zh-CN" });
    if (input === commandText["407"]) return [...withTarget("calculator", "calculator.set_display", { display: "498" }), ...addIfNeeded("clipboard"), command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "199 + 299 = 498" })];
    if (input === commandText["408"]) return withTarget("converter", "converter.set", { category: "currency", value: "5", fromUnit: "usd", toUnit: "cny" });
    if (input === commandText["409"]) return withTarget("converter", "converter.set", { category: "area", value: "10", fromUnit: "sqm", toUnit: "sqcm" });
    if (input === commandText["410"]) return withTarget("converter", "converter.set", { category: "time", value: "80", fromUnit: "minute", toUnit: "minute" });
    if (input === commandText["411"]) return withTarget("translate", "translate.set_draft", { sourceText: "close message board", targetLang: "zh-CN" });
    if (input === commandText["412"]) return withTarget("calculator", "calculator.set_display", { display: "40" });
    if (input === commandText["413"]) return withTarget("converter", "converter.set", { category: "weight", value: "2.5", fromUnit: "kg", toUnit: "g" });
    if (input === commandText["414"]) return withTarget("converter", "converter.set", { category: "temperature", value: "68", fromUnit: "f", toUnit: "c" });
    if (input === commandText["415"]) return withTarget("translate", "translate.set_draft", { sourceText: "播放轻松音乐", targetLang: "en" });
    if (input === commandText["416"]) return withTarget("calculator", "calculator.set_display", { display: "128" });
    if (input === commandText["417"]) return [...withTarget("converter", "converter.set", { category: "length", value: "12", fromUnit: "m", toUnit: "km" }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "十二米 = 0.012 公里", mode: "append" })];
    if (input === commandText["418"]) return withTarget("translate", "translate.set_draft", { sourceText: "the music is still preview mode", targetLang: "zh-CN" });
    if (input === commandText["419"]) return [...withTarget("translate", "translate.set_draft", { sourceText: "把 0.9 以下交给 realtime", targetLang: "en" }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "Memo: route commands below 0.9 confidence to realtime", mode: "append" })];
    if (input === commandText["420"]) return withTarget("calculator", "calculator.set_display", { display: "16" });
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
        translate: ["快速翻译", "翻译"],
        clipboard: ["剪贴板"],
        calculator: ["计算器"],
        converter: ["换算"],
        note: ["便签"]
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

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], 1_350);
    const state = await snapshot();
    forcedWidgetIds.translate = state.translate?.id;
    forcedWidgetIds.clipboard = state.clipboard?.id;
    forcedWidgetIds.calculator = state.calculator?.id;
    forcedWidgetIds.converter = state.converter?.id;
    forcedWidgetIds.note = state.note?.id;

    const ok = await noAssistantError();
    const translateText = `${state.translate?.text ?? ""} ${(state.translate?.inputs ?? []).map((input) => input.value).join(" ")}`;
    const clipText = state.clipboard?.text ?? "";
    const calcText = state.calculator?.text ?? "";
    const converterText = state.converter?.text ?? "";
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;

    if (id === "401") {
      await push(id, /hello world/.test(translateText) && /你好，世界/.test(clipText) && ok, `translate=${JSON.stringify(translateText)}; clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "402") {
      await push(id, /今天适合出门吗/.test(translateText) && /英文|en/.test(translateText) && !state.weather && ok, `translate=${JSON.stringify(translateText)}; weather=${Boolean(state.weather)}`);
    } else if (id === "403") {
      await push(id, /144/.test(calcText) && /十二乘十二 = 144/.test(noteText) && ok, `calculator=${JSON.stringify(calcText)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "404") {
      await push(id, /1000\s*g/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "405") {
      await push(id, /3500\s*m/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "406") {
      await push(id, /good night realtime/.test(translateText) && ok, `translate=${JSON.stringify(translateText)}`);
    } else if (id === "407") {
      await push(id, /498/.test(calcText) && /199 \+ 299 = 498/.test(clipText) && ok, `calculator=${JSON.stringify(calcText)}; clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "408") {
      await push(id, /36\s*cny/.test(converterText) && /待确认汇率/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "409") {
      await push(id, /100000\s*sqcm/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "410") {
      await push(id, /80\s*minute/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "411") {
      await push(id, /close message board/.test(translateText) && !/已删除小工具/.test(await operation()) && ok, `translate=${JSON.stringify(translateText)}; operation=${JSON.stringify(await operation())}`);
    } else if (id === "412") {
      await push(id, /40/.test(calcText) && ok, `calculator=${JSON.stringify(calcText)}`);
    } else if (id === "413") {
      await push(id, /2500\s*g/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "414") {
      await push(id, /20\s*c/.test(converterText) && ok, `converter=${JSON.stringify(converterText)}`);
    } else if (id === "415") {
      await push(id, /播放轻松音乐/.test(translateText) && !state.music && ok, `translate=${JSON.stringify(translateText)}; music=${Boolean(state.music)}`);
    } else if (id === "416") {
      await push(id, /128/.test(calcText) && ok, `calculator=${JSON.stringify(calcText)}`);
    } else if (id === "417") {
      await push(id, /0\.012\s*km/.test(converterText) && /十二米 = 0\.012 公里/.test(noteText) && ok, `converter=${JSON.stringify(converterText)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "418") {
      await push(id, /the music is still preview mode/.test(translateText) && ok, `translate=${JSON.stringify(translateText)}`);
    } else if (id === "419") {
      await push(id, /0\.9 以下交给 realtime/.test(translateText) && /route commands below 0\.9 confidence to realtime/.test(noteText) && ok, `translate=${JSON.stringify(translateText)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "420") {
      await push(id, /16/.test(calcText) && ok, `calculator=${JSON.stringify(calcText)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageTranslateCalcConverterResults = value;
    let pre = document.getElementById("xz-real-page-translate-calc-converter-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-translate-calc-converter-results";
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
    throw new Error(`Translate/calc/converter real-page group failed: ${failed.length}/${results.length}`);
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
