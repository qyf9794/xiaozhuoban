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
    "341": "显示北京伦敦纽约时间，并打开表盘时钟",
    "342": "世界时钟加东京和巴黎，然后切到夜间模式",
    "343": "设二十五分钟专注倒计时，同时播放轻音乐",
    "344": "倒计时暂停后，便签记一下暂停原因是开会",
    "345": "继续刚才的倒计时，结束后提醒我喝水",
    "346": "把表盘时钟调成夜间模式，并缩小一点",
    "347": "关闭时钟夜间模式，再显示纽约时间",
    "348": "半小时后提醒我检查部署日志",
    "349": "设置一分三十秒倒计时，名称叫泡茶",
    "350": "把倒计时重置，然后重新设五分钟",
    "351": "显示东京现在几点，同时查东京天气",
    "352": "明早九点提醒我给客户回电话",
    "353": "二十分钟后让我休息，不要打开待办列表",
    "354": "世界时钟只保留北京和旧金山",
    "355": "表盘时钟放到桌面中央，别挡住电视",
    "356": "设一个四十五分钟会议倒计时并开始录音",
    "357": "暂停计时器，同时把音乐也暂停",
    "358": "倒计时恢复后把待办窗口放最前",
    "359": "打开表盘而不是世界时钟",
    "360": "我说打开时钟时优先打开表盘时钟"
  };

  const secondsFromDisplay = (value) => {
    const match = value.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
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
        worldClock: find(["世界时钟"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        countdown: find(["倒计时"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        note: find(["便签"]),
        todo: find(["待办"]),
        weather: find(["天气"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        tv: find(["电视播放", "CCTV", "央视"]),
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

  const createTrack = (query, index = 0) => ({
    wrapperType: "track",
    kind: "song",
    trackId: 10_000 + index,
    trackName: "轻音乐测试",
    artistName: "测试歌手",
    collectionName: "专注歌单",
    artworkUrl100: `https://example.test/time-${index}.jpg`,
    previewUrl: `https://example.test/time-${index}.m4a`,
    trackViewUrl: `https://example.test/time-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack("轻音乐", 0), createTrack("轻音乐", 1)] })
    });
  });

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 18, weather_code: 3, is_day: 1, wind_speed_10m: 8 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22"],
          weather_code: [3, 2, 0, 45],
          temperature_2m_max: [24, 25, 26, 23],
          temperature_2m_min: [16, 17, 18, 15]
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

    if (input === "播放轻音乐用于测试") {
      return [command("music.play", { widgetId: existingOrPlanned("music"), query: "轻音乐", kind: "song" })];
    }
    if (input === commandText["341"]) return [add("worldClock"), command("worldClock.set_zones", { widgetId: planned("worldClock"), zones: ["北京", "伦敦", "纽约"] }), add("dialClock")];
    if (input === commandText["342"]) return [command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["Asia/Tokyo", "Europe/Paris"] }), command("dialClock.set_night_mode", { widgetId: existingOrPlanned("dialClock"), enabled: true })];
    if (input === commandText["343"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 1500, start: true, label: "专注" }), command("music.play", { widgetId: existingOrPlanned("music"), query: "轻音乐", kind: "song" })];
    if (input === commandText["344"]) return [command("countdown.pause", { widgetId: existingOrPlanned("countdown") }), command("note.write", { widgetId: existingOrPlanned("note"), content: "暂停原因是开会", mode: "append" })];
    if (input === commandText["345"]) return [command("countdown.resume", { widgetId: existingOrPlanned("countdown") }), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "喝水" })];
    if (input === commandText["346"]) return [command("dialClock.set_night_mode", { widgetId: existingOrPlanned("dialClock"), enabled: true }), command("widget.resize", { widgetId: existingOrPlanned("dialClock"), w: 180, h: 180 })];
    if (input === commandText["347"]) return [command("dialClock.set_night_mode", { widgetId: existingOrPlanned("dialClock"), enabled: false }), command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["America/New_York"] })];
    if (input === commandText["348"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 1800, start: true, label: "检查部署日志" }), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "检查部署日志" })];
    if (input === commandText["349"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 90, start: true, label: "泡茶" })];
    if (input === commandText["350"]) return [command("countdown.reset", { widgetId: existingOrPlanned("countdown") }), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 300, start: true })];
    if (input === commandText["351"]) return [command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["Asia/Tokyo"] }), command("weather.set_city", { widgetId: existingOrPlanned("weather"), cityCode: "tokyo" })];
    if (input === commandText["352"]) return [command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "给客户回电话", dueAt: "2026-06-20T01:00:00.000Z" })];
    if (input === commandText["353"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 1200, start: true, label: "休息" })];
    if (input === commandText["354"]) return [command("worldClock.set_zones", { widgetId: existingOrPlanned("worldClock"), zones: ["北京", "America/Los_Angeles|san-francisco"], compact: true })];
    if (input === commandText["355"]) return [command("widget.move", { widgetId: existingOrPlanned("dialClock"), x: 360, y: 180 })];
    if (input === commandText["356"]) return [command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 2700, start: true, label: "会议" }), command("recorder.start", { widgetId: existingOrPlanned("recorder") })];
    if (input === commandText["357"]) return [command("countdown.pause", { widgetId: existingOrPlanned("countdown") }), command("music.pause", { widgetId: existingOrPlanned("music") })];
    if (input === commandText["358"]) return [command("countdown.resume", { widgetId: existingOrPlanned("countdown") }), command("widget.bring_to_front", { widgetId: existingOrPlanned("todo") }), command("widget.focus", { widgetId: existingOrPlanned("todo") })];
    if (input === commandText["359"]) return [add("dialClock")];
    if (input === commandText["360"]) return [add("dialClock")];
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
        worldClock: ["世界时钟"],
        dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
        countdown: ["倒计时"],
        music: ["音乐播放器", "Apple Music", "试听"],
        note: ["便签"],
        todo: ["待办"],
        weather: ["天气"],
        recorder: ["录音机", "录音中", "录音 "],
        tv: ["电视播放", "CCTV", "央视"]
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
    if (!["341", "359", "360"].includes(id)) await ensureWidget("看北京和伦敦时间", "worldClock", 900);
    if (!["341", "359", "360"].includes(id)) await ensureWidget("打开一个表盘时钟", "dialClock", 900);
    if (["343", "344", "345", "348", "349", "350", "356", "357", "358"].includes(id)) {
      await ensureWidget("打开倒计时", "countdown", 900);
    }
    if (["344", "357"].includes(id)) {
      await sendCommand("设一个三分钟倒计时", 650);
    }
    if (["345", "350", "358"].includes(id)) {
      await sendCommand("设一个三分钟倒计时", 650);
      await sendCommand("暂停现在的计时器", 650);
    }
    if (id === "344") await ensureWidget("新建便签实例用于测试", "note", 900);
    if (["345", "348", "352", "358"].includes(id)) await ensureWidget("打开待办", "todo", 900);
    if (["343", "357"].includes(id)) {
      await ensureWidget("打开音乐", "music", 900);
      await sendCommand("播放轻音乐用于测试", 1_500);
    }
    if (id === "351") await ensureWidget("打开天气", "weather", 900);
    if (id === "355") await ensureWidget("打开电视", "tv", 900);
    if (id === "356") await ensureWidget("打开录音机", "recorder", 900);
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.worldClock = state.worldClock?.id;
    forcedWidgetIds.dialClock = state.dialClock?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.music = state.music?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.weather = state.weather?.id;
    forcedWidgetIds.recorder = state.recorder?.id;
    forcedWidgetIds.tv = state.tv?.id;
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["341", "343", "356"].includes(id) ? 1_700 : 1_250);
    const state = await snapshot();
    const ok = await noAssistantError();
    const countdownSeconds = secondsFromDisplay(state.countdown?.text ?? "");
    const worldText = state.worldClock?.text ?? "";
    const dialText = state.dialClock?.text ?? "";

    if (id === "341") {
      await push(id, /北京/.test(worldText) && /伦敦/.test(worldText) && /纽约/.test(worldText) && Boolean(state.dialClock) && ok, `world=${JSON.stringify(worldText.slice(0, 700))}; dial=${Boolean(state.dialClock)}`);
    } else if (id === "342") {
      await push(id, /东京/.test(worldText) && /巴黎/.test(worldText) && (/is-night-mode/.test(state.dialClock?.className ?? "") || /退出夜间模式|夜间模式/.test(`${dialText} ${await operation()}`)) && ok, `world=${JSON.stringify(worldText.slice(0, 700))}; dialClass=${state.dialClock?.className}; operation=${await operation()}`);
    } else if (id === "343") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 1498 && countdownSeconds <= 1500 && /轻音乐/.test(state.music?.text ?? "") && ok, `seconds=${countdownSeconds}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`);
    } else if (id === "344") {
      const paused = countdownSeconds;
      await page.waitForTimeout(900);
      const later = secondsFromDisplay((await snapshot()).countdown?.text ?? "");
      await push(id, paused !== null && later === paused && /暂停原因是开会/.test(`${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`) && ok, `paused=${paused}; later=${later}; note=${JSON.stringify(state.note?.noteContent || state.note?.text || "")}`);
    } else if (id === "345") {
      await push(id, /喝水/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}; operation=${await operation()}`);
    } else if (id === "346") {
      await push(id, Boolean(state.dialClock) && (state.dialClock?.rect.w ?? 999) <= 190 && ok, `rect=${JSON.stringify(state.dialClock?.rect)}; class=${state.dialClock?.className}; operation=${await operation()}`);
    } else if (id === "347") {
      await push(id, /纽约/.test(worldText) && !/is-night-mode/.test(state.dialClock?.className ?? "") && ok, `world=${JSON.stringify(worldText.slice(0, 700))}; class=${state.dialClock?.className}`);
    } else if (id === "348") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 1798 && countdownSeconds <= 1800 && /检查部署日志/.test(state.todo?.text ?? "") && ok, `seconds=${countdownSeconds}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "349") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 88 && countdownSeconds <= 90 && /泡茶/.test(state.countdown?.text ?? "") && ok, `seconds=${countdownSeconds}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`);
    } else if (id === "350") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 298 && countdownSeconds <= 300 && ok, `seconds=${countdownSeconds}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`);
    } else if (id === "351") {
      await push(id, /东京/.test(worldText) && /东京/.test(state.weather?.text ?? "") && ok, `world=${JSON.stringify(worldText.slice(0, 700))}; weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    } else if (id === "352") {
      await push(id, /给客户回电话/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "353") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 1198 && countdownSeconds <= 1200 && !state.todo && ok, `seconds=${countdownSeconds}; todo=${Boolean(state.todo)}`);
    } else if (id === "354") {
      await push(id, /北京/.test(worldText) && /旧金山/.test(worldText) && !/纽约|伦敦|东京|巴黎/.test(worldText) && ok, `world=${JSON.stringify(worldText.slice(0, 700))}`);
    } else if (id === "355") {
      await push(id, Boolean(state.dialClock && state.tv && state.dialClock.rect.x > 560 && state.dialClock.rect.x < 760 && state.dialClock.rect.y > 120 && ok), `dial=${JSON.stringify(state.dialClock?.rect)}; tv=${JSON.stringify(state.tv?.rect)}`);
    } else if (id === "356") {
      await push(id, countdownSeconds !== null && countdownSeconds >= 2698 && countdownSeconds <= 2700 && /录音中|停止录音/.test(state.recorder?.text ?? "") && ok, `seconds=${countdownSeconds}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 400))}`);
    } else if (id === "357") {
      await push(id, Boolean(state.countdown && state.music && ok), `countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`);
    } else if (id === "358") {
      await push(id, /is-focused/.test(state.todo?.className ?? "") && state.todo?.zIndex === state.maxZ && ok, `todoClass=${state.todo?.className}; z=${state.todo?.zIndex}/${state.maxZ}`);
    } else if (id === "359") {
      await push(id, Boolean(state.dialClock) && !state.worldClock && ok, `dial=${Boolean(state.dialClock)}; world=${Boolean(state.worldClock)}`);
    } else if (id === "360") {
      await push(id, Boolean(state.dialClock) && !state.worldClock && ok, `dial=${Boolean(state.dialClock)}; world=${Boolean(state.worldClock)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageTimeCountdownClockResults = value;
    let pre = document.getElementById("xz-real-page-time-countdown-clock-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-time-countdown-clock-results";
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
    throw new Error(`Time/countdown/clock real-page group failed: ${failed.length}/${results.length}`);
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
