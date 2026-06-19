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
    "561": "新建今日计划桌板，打开待办、便签和天气",
    "562": "写下今天三件事：部署、测试、复盘",
    "563": "设二十五分钟专注倒计时并播放轻音乐",
    "564": "把九点开会添加到待办并开始录音准备",
    "565": "刷新新闻后只把重要事项写到便签",
    "566": "把复盘 realtime 断线问题加入待办",
    "567": "十五分钟后提醒我查看监控脚本日志",
    "568": "打开项目冲刺桌板并整理窗口",
    "569": "把部署 id 复制到剪贴板并固定",
    "570": "查上海天气决定下午是否出门",
    "571": "打开计算器算今天还有多少分钟到六点",
    "572": "把会议纪要追加到便签，然后标记待办完成",
    "573": "新建一条待办：验证语音打开小工具",
    "574": "开始录音记录今天的问题列表",
    "575": "关闭电视，保留音乐和倒计时",
    "576": "打开工作台并把音乐播放器放到最前",
    "577": "明早八点提醒我继续回归测试",
    "578": "把轻松音乐播放失败写入便签",
    "579": "添加待办：检查 Apple Music 是否试听",
    "580": "整理桌面后聚焦待办窗口"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MESSAGE_|RECORDER_|PLAN_VALIDATION/.test(
      await operation()
    );

  const clickDockButton = async (label) => {
    await page
      .waitForFunction(() => Boolean(document.querySelector(".voice-assistant-dock__confirm button")), null, { timeout: 5_000 })
      .catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text || button.textContent?.includes(text));
      target?.click();
    }, label);
    await page.waitForTimeout(800);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) await clickDockButton("取消");
  };

  const sendCommand = async (command, waitMs = 1_100, options = {}) => {
    await settlePrompts();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    if (!options.keepConfirmation) await settlePrompts();
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

  const activeBoardName = async () =>
    page.locator(".sidebar-board-row.is-active .sidebar-board-button").first().innerText().catch(() => "");

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
            placeholder: input.getAttribute("placeholder"),
            ariaLabel: input.getAttribute("aria-label"),
            value: input.value
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        boardNames: Array.from(document.querySelectorAll(".sidebar-board-button")).map((element) => element.textContent?.trim() ?? ""),
        note: find(["便签"]),
        todo: find(["待办"]),
        weather: find(["天气"]),
        countdown: find(["倒计时"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        recorder: find(["录音机", "开始录音", "停止录音", "正在录音"]),
        headline: find(["重大新闻", "新闻"]),
        clipboard: find(["剪贴板"]),
        calculator: find(["计算器"]),
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
    trackId: 58_000 + index,
    trackName: query || "轻音乐",
    artistName: "测试歌手",
    collectionName: "生产力计划测试",
    artworkUrl100: `https://example.test/productivity-${index}.jpg`,
    previewUrl: `https://example.test/productivity-${index}.m4a`,
    trackViewUrl: `https://example.test/productivity-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "轻音乐";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack(term, 0), createTrack(term, 1)] })
    });
  });

  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 25, weather_code: 1, is_day: 1, wind_speed_10m: 6 },
        daily: {
          time: ["2026-06-19", "2026-06-20", "2026-06-21"],
          weather_code: [1, 2, 3],
          temperature_2m_max: [30, 29, 28],
          temperature_2m_min: [21, 20, 19]
        }
      })
    });
  });

  await page.route("**/api/headlines**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ title: "Realtime 监控脚本日志正常", link: "https://example.test/news/1", author: "测试新闻", pubDate: "2026-06-19" }]
      })
    });
  });

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const boards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId;
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const boardId = (name) => boards.find((board) => String(board.name ?? "").includes(name))?.boardId ?? context.boardId;
    const planned = (type) => `planned_widget_${type}`;
    const existingOrPlanned = (type) => widgetId(type) ?? planned(type);
    const command = (tool, args = {}, risk = "safe") => ({
      tool,
      args,
      risk,
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}, risk = "safe") => [
      ...addIfNeeded(type),
      command(tool, { widgetId: existingOrPlanned(type), ...args }, risk)
    ];

    if (input === "seed:note") return addIfNeeded("note");
    if (input === "seed:todo") return withTarget("todo", "todo.add_item", { text: "会议纪要" });
    if (input === "seed:music-countdown-tv") {
      return [
        ...withTarget("music", "music.play", { query: "保留音乐", kind: "song" }),
        ...withTarget("countdown", "countdown.set", { totalSeconds: 900, start: true, label: "保留倒计时" }),
        ...withTarget("tv", "tv.play", { channelName: "CCTV1", channelUrl: "https://example.test/cctv1.m3u8" })
      ];
    }
    if (input === "seed:workbench") return [command("board.create", { name: "工作台" }), ...addIfNeeded("music")];
    if (input === "seed:projectSprint") return [command("board.create", { name: "项目冲刺" }), ...addIfNeeded("todo"), ...addIfNeeded("note")];
    if (input === "seed:desktop") return [...addIfNeeded("todo"), ...addIfNeeded("music"), ...addIfNeeded("weather")];

    if (input === commandText["561"]) return [command("board.create", { name: "今日计划" }), add("todo"), add("note"), add("weather"), command("weather.set_city", { widgetId: planned("weather"), cityCode: "beijing" })];
    if (input === commandText["562"]) return withTarget("note", "note.write", { content: "部署\n测试\n复盘", mode: "replace" });
    if (input === commandText["563"]) return [...withTarget("countdown", "countdown.set", { totalSeconds: 1500, start: true, label: "专注" }), ...withTarget("music", "music.play", { query: "轻音乐", kind: "song" })];
    if (input === commandText["564"]) return [...withTarget("todo", "todo.add_item", { text: "九点开会" }), ...withTarget("recorder", "recorder.start")];
    if (input === commandText["565"]) return [...withTarget("headline", "headline.request_refresh", { requestedAt: "2026-06-19T06:00:00.000Z" }), ...withTarget("note", "note.write", { content: "重要事项：Realtime 监控脚本日志正常", mode: "append" })];
    if (input === commandText["566"]) return withTarget("todo", "todo.add_item", { text: "复盘 realtime 断线问题" });
    if (input === commandText["567"]) return [...withTarget("countdown", "countdown.set", { totalSeconds: 900, start: true, label: "查看监控脚本日志" }), ...withTarget("todo", "todo.add_item", { text: "查看监控脚本日志" })];
    if (input === commandText["568"]) return [command("board.switch", { boardId: boardId("项目冲刺") }), command("board.auto_align", { viewportWidth: 1180 }, "confirm")];
    if (input === commandText["569"]) return withTarget("clipboard", "clipboard.add_text", { text: "deploy-id-prod-20260619", pinned: true });
    if (input === commandText["570"]) return withTarget("weather", "weather.set_city", { cityCode: "shanghai" });
    if (input === commandText["571"]) return [...addIfNeeded("calculator"), command("calculator.set_display", { widgetId: existingOrPlanned("calculator"), display: "到18:00还有约204分钟" })];
    if (input === commandText["572"]) return [...withTarget("note", "note.write", { content: "会议纪要", mode: "append" }), ...withTarget("todo", "todo.complete_item", { text: "会议纪要" })];
    if (input === commandText["573"]) return withTarget("todo", "todo.add_item", { text: "验证语音打开小工具" });
    if (input === commandText["574"]) return [...withTarget("recorder", "recorder.start"), ...withTarget("note", "note.write", { content: "今天的问题列表", mode: "append" })];
    if (input === commandText["575"]) return [command("widget.remove", { widgetId: existingOrPlanned("tv") })];
    if (input === commandText["576"]) return [command("board.switch", { boardId: boardId("工作台") }), command("widget.bring_to_front", { widgetId: existingOrPlanned("music") })];
    if (input === commandText["577"]) return withTarget("todo", "todo.add_item", { text: "明早八点继续回归测试", dueAt: "2026-06-20T00:00:00.000Z" });
    if (input === commandText["578"]) return withTarget("note", "note.write", { content: "轻松音乐播放失败", mode: "append" });
    if (input === commandText["579"]) return withTarget("todo", "todo.add_item", { text: "检查 Apple Music 是否试听" });
    if (input === commandText["580"]) return [command("board.auto_align", { viewportWidth: 1180 }, "confirm"), command("widget.focus", { widgetId: existingOrPlanned("todo") })];
    return null;
  };

  const hydrateMissingWidgetIds = async (commands) => {
    const fallbackByType = {
      note: ["便签"],
      todo: ["待办"],
      weather: ["天气"],
      countdown: ["倒计时"],
      music: ["音乐播放器", "Apple Music", "试听"],
      recorder: ["录音机", "开始录音", "停止录音", "正在录音"],
      headline: ["重大新闻", "新闻"],
      clipboard: ["剪贴板"],
      calculator: ["计算器"],
      tv: ["电视播放", "CCTV", "央视"]
    };
    for (const item of commands) {
      const widgetId = typeof item.args?.widgetId === "string" ? item.args.widgetId : "";
      if (!widgetId.startsWith("planned_widget_")) continue;
      const type = widgetId.slice("planned_widget_".length);
      const fallback = fallbackByType[type];
      if (!fallback) continue;
      const existingWidgetId = await widgetIdFromDom(fallback);
      if (existingWidgetId) item.args.widgetId = existingWidgetId;
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
    await hydrateMissingWidgetIds(commands);
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
        const widgetId = typeof commandItem.args?.widgetId === "string" ? commandItem.args.widgetId : "";
        const plannedType = widgetId.startsWith("planned_widget_") ? widgetId.slice("planned_widget_".length) : "";
        if (!plannedType) continue;
        const addDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.add_widget" && String(candidate.args?.definitionId ?? "").includes(plannedType));
        if (addDependency) commandItem.dependsOn = [...(commandItem.dependsOn ?? []), addDependency.id];
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

  const seedFor = async (id) => {
    const seeds = {
      "562": ["seed:note"],
      "568": ["seed:projectSprint"],
      "572": ["seed:todo", "seed:note"],
      "575": ["seed:music-countdown-tv"],
      "576": ["seed:workbench"],
      "578": ["seed:note"],
      "580": ["seed:desktop"]
    }[id] ?? [];
    for (const seed of seeds) await sendCommand(seed, 1_100);
  };

  const push = async (id, passed, details) => {
    const command = commandText[id];
    const hit = realtimeHits.find((item) => item.input === command && item.phase === "plan_execute");
    const realtimeOk = Boolean(hit);
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      tools: hit?.tools ?? [],
      details: `${details}; activeBoard=${await activeBoardName()}${realtimeOk ? "" : "; missingRealtimeRoute=true"}`
    });
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    realtimeHits.length = 0;
    targetInputs.clear();
    await seedFor(id);
    const before = await snapshot();
    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], id === "568" || id === "580" ? 1_000 : 1_300, { keepConfirmation: id === "568" || id === "580" });
    let op = await operation();
    if (/待确认/.test(op)) {
      await page.getByTestId("voice-assistant-command-input").fill("确认");
      await page.getByTestId("voice-assistant-send").click({ force: true });
      await page.waitForTimeout(1_300);
      op = await operation();
      if (/待确认/.test(op)) {
        await page.getByRole("button", { name: /^确认$/ }).first().click({ force: true, timeout: 2_000 }).catch(() => undefined);
        await page.waitForTimeout(1_100);
        op = await operation();
      }
    }
    const state = await snapshot();
    const active = await activeBoardName();
    const ok = await noAssistantError();
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;

    if (id === "561") {
      await push(id, /今日计划/.test(active) && Boolean(state.todo && state.note && state.weather) && ok, `todo=${Boolean(state.todo)} note=${Boolean(state.note)} weather=${Boolean(state.weather)}`);
    } else if (id === "562") {
      await push(id, /部署/.test(noteText) && /测试/.test(noteText) && /复盘/.test(noteText) && ok, `note=${JSON.stringify(noteText.slice(0, 300))}`);
    } else if (id === "563") {
      await push(id, /25:00|24:59|1500|专注/.test(state.countdown?.text ?? "") && /轻音乐/.test(state.music?.text ?? "") && ok, `countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))} music=${JSON.stringify((state.music?.text || "").slice(0, 300))}`);
    } else if (id === "564") {
      await push(id, /九点开会/.test(state.todo?.text ?? "") && /正在录音|停止录音|录音中/.test(state.recorder?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))} recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 300))}`);
    } else if (id === "565") {
      await push(id, /重要事项/.test(noteText) && Boolean(state.headline) && ok, `headline=${Boolean(state.headline)} note=${JSON.stringify(noteText.slice(0, 300))}`);
    } else if (id === "566") {
      await push(id, /复盘 realtime 断线问题/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "567") {
      await push(id, /15:00|14:59|查看监控脚本日志/.test(state.countdown?.text ?? "") && /查看监控脚本日志/.test(state.todo?.text ?? "") && ok, `countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))} todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "568") {
      await push(id, /项目冲刺/.test(active) && /已整理桌面|完成|board\.auto_align/.test(op) && ok, `operation=${JSON.stringify(op)}`);
    } else if (id === "569") {
      await push(id, /deploy-id-prod-20260619/.test(state.clipboard?.text ?? "") && ok, `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 500))}`);
    } else if (id === "570") {
      await push(id, /上海/.test(state.weather?.text ?? "") && ok, `weather=${JSON.stringify((state.weather?.text || "").slice(0, 500))}`);
    } else if (id === "571") {
      await push(id, Boolean(state.calculator) && /18:00|204|分钟/.test(state.calculator?.text ?? "") && ok, `calculator=${JSON.stringify((state.calculator?.text || "").slice(0, 300))}`);
    } else if (id === "572") {
      await push(id, /会议纪要/.test(noteText) && !/会议纪要/.test(state.todo?.text ?? "") && ok, `note=${JSON.stringify(noteText.slice(0, 300))} todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "573") {
      await push(id, /验证语音打开小工具/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "574") {
      await push(id, /正在录音|停止录音|录音中/.test(state.recorder?.text ?? "") && /今天的问题列表/.test(noteText) && ok, `recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 300))} note=${JSON.stringify(noteText.slice(0, 300))}`);
    } else if (id === "575") {
      await push(id, !state.tv && Boolean(state.music && state.countdown) && ok, `tv=${Boolean(state.tv)} music=${Boolean(state.music)} countdown=${Boolean(state.countdown)} beforeTv=${Boolean(before.tv)}`);
    } else if (id === "576") {
      await push(id, /工作台/.test(active) && Boolean(state.music) && state.music.zIndex === state.maxZ && ok, `musicZ=${state.music?.zIndex}/${state.maxZ}`);
    } else if (id === "577") {
      await push(id, /明早八点继续回归测试|继续回归测试/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "578") {
      await push(id, /轻松音乐播放失败/.test(noteText) && !/已开始播放音乐/.test(op) && ok, `note=${JSON.stringify(noteText.slice(0, 300))} operation=${JSON.stringify(op)}`);
    } else if (id === "579") {
      await push(id, /检查 Apple Music 是否试听/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`);
    } else if (id === "580") {
      await push(
        id,
        Boolean(
          state.todo &&
            ok &&
            (/is-focused/.test(state.todo.className) || /待确认：board\.auto_align|已整理桌面|widget\.focus/.test(op))
        ),
        `operation=${JSON.stringify(op)} todoClass=${state.todo?.className}`
      );
    }
  }

  await page.evaluate((value) => {
    window.__xzRealPageProductivityPlanResults = value;
    let pre = document.getElementById("xz-real-page-productivity-plan-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-productivity-plan-results";
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
    throw new Error(`Productivity plan real-page group failed: ${failed.length}/${results.length}`);
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
