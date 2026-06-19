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
    "361": "便签记下今天要验证音乐登录和播放完整歌曲",
    "362": "把刚才搜索到的王菲红豆追加到便签",
    "363": "添加待办：修复 realtime 工具暴露策略",
    "364": "明天下午三点提醒我检查 Vercel 日志",
    "365": "把买牛奶标记完成，再新增买咖啡豆",
    "366": "清空便签前先弹确认，不要直接删除",
    "367": "把会议纪要追加到便签并开始录音",
    "368": "添加待办订酒店，备注写靠近会场",
    "369": "把复盘语音测试设为今天晚上九点提醒",
    "370": "便签写下：轻松音乐要重新搜索",
    "371": "给待办加一条关闭留言板不能发送关闭两个字",
    "372": "把部署完成这项待办勾掉",
    "373": "五分钟后提醒我看倒计时有没有声音",
    "374": "便签新增一段英文 hello realtime，再打开翻译",
    "375": "把桌面问题列表写入便签，编号从一开始",
    "376": "添加待办：测试多轮语音不要重复回复",
    "377": "把今天的新闻摘要追加到便签",
    "378": "待办里添加查看 Apple Music token",
    "379": "清理已完成待办前先让我确认",
    "380": "便签保存当前播放歌曲和天气城市"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|RECORDER_/.test(await operation());

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

  const sendCommand = async (command, waitMs = 1_100, options = {}) => {
    await settlePrompts();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    if (options.settleEnd !== false) {
      await settlePrompts();
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
        note: find(["便签"]),
        todo: find(["待办"]),
        countdown: find(["倒计时"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        translate: find(["快速翻译", "翻译"]),
        headline: find(["重大新闻"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        weather: find(["天气"])
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
    trackId: 20_000 + index,
    trackName: query.includes("红豆") ? "红豆" : "当前播放测试歌",
    artistName: query.includes("王菲") ? "王菲" : "测试歌手",
    collectionName: "语音测试专辑",
    artworkUrl100: `https://example.test/note-${index}.jpg`,
    previewUrl: `https://example.test/note-${index}.m4a`,
    trackViewUrl: `https://example.test/note-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 1, results: [createTrack(term, 0)] })
    });
  });

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, weather_code: 2, is_day: 1, wind_speed_10m: 6 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"],
          weather_code: [2, 3, 1, 0],
          temperature_2m_max: [27, 28, 29, 27],
          temperature_2m_min: [18, 19, 20, 18]
        }
      })
    });
  });

  await page.route("https://api.rss2json.com/v1/api.json**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        items: [
          { title: "Realtime 工具分级加载测试完成", link: "https://example.test/news/1", author: "测试新闻", pubDate: "2026-06-19" }
        ]
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
      risk: tool === "note.clear" || tool === "todo.clear_completed" ? "destructive" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}) => [...addIfNeeded(type), command(tool, { widgetId: existingOrPlanned(type), ...args })];

    if (input === "便签预置内容") return withTarget("note", "note.write", { content: "已有内容", mode: "replace" });
    if (input === "待办预置买牛奶") return withTarget("todo", "todo.add_item", { text: "买牛奶" });
    if (input === "待办预置部署完成") return withTarget("todo", "todo.add_item", { text: "部署完成" });
    if (input === "打开音乐用于当前播放") return withTarget("music", "music.play", { query: "当前播放测试歌", kind: "song" });
    if (input === "打开天气用于当前城市") return withTarget("weather", "weather.set_city", { cityCode: "shanghai" });

    if (input === commandText["361"]) return withTarget("note", "note.write", { content: "今天要验证音乐登录和播放完整歌曲", mode: "append" });
    if (input === commandText["362"]) return withTarget("note", "note.write", { content: "王菲 红豆", mode: "append" });
    if (input === commandText["363"]) return withTarget("todo", "todo.add_item", { text: "修复 realtime 工具暴露策略" });
    if (input === commandText["364"]) return withTarget("todo", "todo.add_item", { text: "检查 Vercel 日志", dueAt: "2026-06-20T07:00:00.000Z" });
    if (input === commandText["365"]) return [command("todo.complete_item", { widgetId: existingOrPlanned("todo"), text: "买牛奶" }), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "买咖啡豆" })];
    if (input === commandText["366"]) return [command("note.clear", { widgetId: existingOrPlanned("note") })];
    if (input === commandText["367"]) return [command("note.write", { widgetId: existingOrPlanned("note"), content: "会议纪要", mode: "append" }), ...addIfNeeded("recorder"), command("recorder.start", { widgetId: existingOrPlanned("recorder") })];
    if (input === commandText["368"]) return withTarget("todo", "todo.add_item", { text: "订酒店 - 靠近会场" });
    if (input === commandText["369"]) return withTarget("todo", "todo.add_item", { text: "复盘语音测试", dueAt: "2026-06-19T13:00:00.000Z" });
    if (input === commandText["370"]) return withTarget("note", "note.write", { content: "轻松音乐要重新搜索", mode: "append" });
    if (input === commandText["371"]) return withTarget("todo", "todo.add_item", { text: "关闭留言板不能发送关闭两个字" });
    if (input === commandText["372"]) return [command("todo.complete_item", { widgetId: existingOrPlanned("todo"), text: "部署完成" })];
    if (input === commandText["373"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 300, start: true, label: "看倒计时有没有声音" }), ...addIfNeeded("todo"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "看倒计时有没有声音" })];
    if (input === commandText["374"]) return [command("note.write", { widgetId: existingOrPlanned("note"), content: "hello realtime", mode: "append" }), ...addIfNeeded("translate"), command("translate.set_draft", { widgetId: existingOrPlanned("translate"), sourceText: "hello realtime", targetLang: "zh-CN" })];
    if (input === commandText["375"]) return withTarget("note", "note.write", { content: "1. Realtime 会话连接\n2. 音乐完整播放\n3. 命令不要重复回复", mode: "replace" });
    if (input === commandText["376"]) return withTarget("todo", "todo.add_item", { text: "测试多轮语音不要重复回复" });
    if (input === commandText["377"]) return [command("headline.request_refresh", { widgetId: existingOrPlanned("headline"), requestedAt: "2026-06-19T09:00:00.000Z" }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "今天的新闻摘要：Realtime 工具分级加载测试完成", mode: "append" })];
    if (input === commandText["378"]) return withTarget("todo", "todo.add_item", { text: "查看 Apple Music token" });
    if (input === commandText["379"]) return [command("todo.clear_completed", { widgetId: existingOrPlanned("todo") })];
    if (input === commandText["380"]) return [command("note.write", { widgetId: existingOrPlanned("note"), content: "当前播放：当前播放测试歌；天气城市：上海", mode: "append" })];
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
        note: ["便签"],
        todo: ["待办"],
        countdown: ["倒计时"],
        recorder: ["录音机", "录音中", "录音 "],
        translate: ["快速翻译", "翻译"],
        headline: ["重大新闻"],
        music: ["音乐播放器", "Apple Music", "试听"],
        weather: ["天气"]
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
    if (["362", "366", "367", "370", "374", "375", "377", "380"].includes(id)) {
      await ensureWidget("便签预置内容", "note", 900);
    }
    if (["365", "372", "379"].includes(id)) {
      await ensureWidget("打开待办", "todo", 900);
    }
    if (id === "365") await sendCommand("待办预置买牛奶", 800);
    if (id === "372") await sendCommand("待办预置部署完成", 800);
    if (id === "373") await ensureWidget("打开倒计时", "countdown", 900);
    if (id === "377") await ensureWidget("打开新闻", "headline", 900);
    if (id === "380") {
      await ensureWidget("打开音乐", "music", 900);
      await sendCommand("打开音乐用于当前播放", 1_500);
      await ensureWidget("打开天气", "weather", 900);
    }
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.recorder = state.recorder?.id;
    forcedWidgetIds.translate = state.translate?.id;
    forcedWidgetIds.headline = state.headline?.id;
    forcedWidgetIds.music = state.music?.id;
    forcedWidgetIds.weather = state.weather?.id;
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["367", "373", "374", "377", "380"].includes(id) ? 1_700 : 1_250, {
      settleEnd: !["366", "379"].includes(id)
    });
    const state = await snapshot();
    const ok = await noAssistantError();
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;
    const todoText = state.todo?.text ?? "";
    const op = await operation();

    if (id === "361") {
      await push(id, /今天要验证音乐登录和播放完整歌曲/.test(noteText) && !state.music && ok, `note=${JSON.stringify(noteText)}; music=${Boolean(state.music)}`);
    } else if (id === "362") {
      await push(id, /已有内容/.test(noteText) && /王菲 红豆/.test(noteText) && ok, `note=${JSON.stringify(noteText)}`);
    } else if (id === "363") {
      await push(id, /修复 realtime 工具暴露策略/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "364") {
      await push(id, /检查 Vercel 日志/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "365") {
      await push(id, !/买牛奶/.test(todoText) && /买咖啡豆/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "366") {
      await push(id, /待确认|确认执行|确认/.test(op) && /已有内容/.test(noteText), `operation=${JSON.stringify(op)}; note=${JSON.stringify(noteText)}`);
      await clickDockButton("取消");
    } else if (id === "367") {
      await push(id, /会议纪要/.test(noteText) && /录音中|停止录音/.test(state.recorder?.text ?? "") && ok, `note=${JSON.stringify(noteText)}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 500))}`);
    } else if (id === "368") {
      await push(id, /订酒店/.test(todoText) && /靠近会场/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "369") {
      await push(id, /复盘语音测试/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "370") {
      await push(id, /轻松音乐要重新搜索/.test(noteText) && !state.music && ok, `note=${JSON.stringify(noteText)}; music=${Boolean(state.music)}`);
    } else if (id === "371") {
      await push(id, /关闭留言板不能发送关闭两个字/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "372") {
      await push(id, !/部署完成/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "373") {
      await push(id, /看倒计时有没有声音/.test(`${state.countdown?.text ?? ""} ${todoText}`) && ok, `countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 500))}; todo=${JSON.stringify(todoText)}`);
    } else if (id === "374") {
      const translateValues = (state.translate?.inputs ?? []).map((input) => input.value).join(" ");
      await push(id, /hello realtime/.test(noteText) && /hello realtime/.test(`${state.translate?.text ?? ""} ${translateValues}`) && ok, `note=${JSON.stringify(noteText)}; translate=${JSON.stringify((state.translate?.text || "").slice(0, 500))}; values=${JSON.stringify(translateValues)}`);
    } else if (id === "375") {
      await push(id, /1\.\s*Realtime/.test(noteText) && /2\.\s*音乐完整播放/.test(noteText) && ok, `note=${JSON.stringify(noteText)}`);
    } else if (id === "376") {
      await push(id, /测试多轮语音不要重复回复/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "377") {
      await push(id, /今天的新闻摘要/.test(noteText) && Boolean(state.headline) && ok, `note=${JSON.stringify(noteText)}; headline=${Boolean(state.headline)}`);
    } else if (id === "378") {
      await push(id, /查看 Apple Music token/.test(todoText) && ok, `todo=${JSON.stringify(todoText)}`);
    } else if (id === "379") {
      await push(id, /待确认|确认执行|确认/.test(op) && Boolean(state.todo), `operation=${JSON.stringify(op)}; todo=${JSON.stringify(todoText)}`);
      await clickDockButton("取消");
    } else if (id === "380") {
      await push(id, /当前播放/.test(noteText) && /当前播放测试歌/.test(noteText) && /上海/.test(noteText) && ok, `note=${JSON.stringify(noteText)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageNoteTodoReminderResults = value;
    let pre = document.getElementById("xz-real-page-note-todo-reminder-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-note-todo-reminder-results";
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
    throw new Error(`Note/todo/reminder real-page group failed: ${failed.length}/${results.length}`);
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
