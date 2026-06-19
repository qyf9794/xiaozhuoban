const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const targetInputs = new Set();
  const forcedWidgetIds = {};

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
    "381": "把临时验证码 839201 存到剪贴板，不要发留言板",
    "382": "复制演示账号 demo@example.com 到剪贴板并固定",
    "383": "清理普通剪贴板记录，保留固定内容",
    "384": "把项目口令 demo-token 固定保存到剪贴板",
    "385": "剪贴板添加一条 WiFi 密码提示但不要读出来",
    "386": "把刚才的搜索关键词复制到剪贴板",
    "387": "清空剪贴板前先确认一次",
    "388": "把会议链接存到剪贴板，并写入便签",
    "389": "复制客服回复模板到剪贴板",
    "390": "固定保存 Vercel 项目名 xiaozhuoban",
    "391": "剪贴板里新增一条不要上传的本地路径",
    "392": "把 1234 临时验证码存起来，十分钟后提醒删除",
    "393": "把当前歌曲名复制到剪贴板",
    "394": "清理剪贴板里未固定的测试记录",
    "395": "把翻译结果复制到剪贴板，但不要覆盖便签",
    "396": "保存命令：打开表盘时钟 到剪贴板",
    "397": "复制今天日期到剪贴板并打开便签",
    "398": "剪贴板新增一条部署 id 占位信息",
    "399": "固定保存音乐登录状态检查步骤",
    "400": "清理剪贴板后发一条完成提示"
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
    await page.waitForTimeout(350);
  };

  const settlePrompts = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) {
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
          buttons: Array.from(el.querySelectorAll("button")).map((button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent?.trim() || ""
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
        bodyText: document.body.innerText,
        widgets,
        clipboard: find(["剪贴板"]),
        note: find(["便签"]),
        todo: find(["待办"]),
        countdown: find(["倒计时"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        translate: find(["快速翻译", "翻译"]),
        messageBoard: find(["留言板"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"])
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
    trackId: 30_000 + index,
    trackName: "当前播放测试歌",
    artistName: "测试歌手",
    collectionName: "剪贴板批测专辑",
    artworkUrl100: `https://example.test/clipboard-${index}.jpg`,
    previewUrl: `https://example.test/clipboard-${index}.m4a`,
    trackViewUrl: `https://example.test/clipboard-${index}`
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
      risk: tool === "clipboard.clear" ? "destructive" : "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const add = (type) => command("board.add_widget", { definitionId: definitionId(type) });
    const addIfNeeded = (type) => (widgetId(type) || forcedWidgetIds[type] ? [] : [add(type)]);
    const withTarget = (type, tool, args = {}) => [...addIfNeeded(type), command(tool, { widgetId: existingOrPlanned(type), ...args })];

    if (input === "剪贴板预置普通和固定") {
      return [
        ...addIfNeeded("clipboard"),
        command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "普通测试记录" }),
        command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "固定测试记录", pinned: true })
      ];
    }
    if (input === "便签预置内容") return withTarget("note", "note.write", { content: "已有便签内容", mode: "replace" });
    if (input === "打开音乐用于当前播放") return withTarget("music", "music.play", { query: "当前播放测试歌", kind: "song" });

    if (input === commandText["381"]) return withTarget("clipboard", "clipboard.add_text", { text: "临时验证码 839201" });
    if (input === commandText["382"]) return withTarget("clipboard", "clipboard.add_text", { text: "demo@example.com", pinned: true });
    if (input === commandText["383"]) return [command("clipboard.clear", { widgetId: existingOrPlanned("clipboard"), includePinned: false })];
    if (input === commandText["384"]) return withTarget("clipboard", "clipboard.add_text", { text: "项目口令 demo-token", pinned: true });
    if (input === commandText["385"]) return withTarget("clipboard", "clipboard.add_text", { text: "WiFi 密码提示" });
    if (input === commandText["386"]) return withTarget("clipboard", "clipboard.add_text", { text: "轻松音乐" });
    if (input === commandText["387"]) return [command("clipboard.clear", { widgetId: existingOrPlanned("clipboard"), includePinned: true })];
    if (input === commandText["388"]) return [...withTarget("clipboard", "clipboard.add_text", { text: "会议链接：https://meet.example.test/voice" }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "会议链接：https://meet.example.test/voice", mode: "append" })];
    if (input === commandText["389"]) return withTarget("clipboard", "clipboard.add_text", { text: "客服回复模板：您好，问题已收到，我们会尽快处理。" });
    if (input === commandText["390"]) return withTarget("clipboard", "clipboard.add_text", { text: "Vercel 项目名 xiaozhuoban", pinned: true });
    if (input === commandText["391"]) return withTarget("clipboard", "clipboard.add_text", { text: "本地路径：/Users/qianyifeng/CodexProjects/xiaozhuoban（不要上传）" });
    if (input === commandText["392"]) return [...withTarget("clipboard", "clipboard.add_text", { text: "1234 临时验证码" }), ...addIfNeeded("countdown"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 600, start: true, label: "删除临时验证码" }), ...addIfNeeded("todo"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "删除临时验证码 1234" })];
    if (input === commandText["393"]) return withTarget("clipboard", "clipboard.add_text", { text: "当前播放测试歌" });
    if (input === commandText["394"]) return [command("clipboard.clear", { widgetId: existingOrPlanned("clipboard"), includePinned: false })];
    if (input === commandText["395"]) return withTarget("clipboard", "clipboard.add_text", { text: "翻译结果：你好 Realtime" });
    if (input === commandText["396"]) return withTarget("clipboard", "clipboard.add_text", { text: "打开表盘时钟" });
    if (input === commandText["397"]) return [...withTarget("clipboard", "clipboard.add_text", { text: "2026-06-19" }), ...addIfNeeded("note")];
    if (input === commandText["398"]) return withTarget("clipboard", "clipboard.add_text", { text: "部署 id：dpl_placeholder" });
    if (input === commandText["399"]) return withTarget("clipboard", "clipboard.add_text", { text: "音乐登录状态检查步骤：检查 token，连接播放器，播放完整歌曲", pinned: true });
    if (input === commandText["400"]) return [command("clipboard.clear", { widgetId: existingOrPlanned("clipboard"), includePinned: false })];
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
        clipboard: ["剪贴板"],
        note: ["便签"],
        todo: ["待办"],
        countdown: ["倒计时"],
        music: ["音乐播放器", "Apple Music", "试听"]
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
    if (["383", "387", "394", "400"].includes(id)) {
      await sendCommand("剪贴板预置普通和固定", 1_200);
    }
    if (id === "395") {
      await ensureWidget("便签预置内容", "note", 900);
    }
    if (id === "393") {
      await ensureWidget("打开音乐", "music", 900);
      await sendCommand("打开音乐用于当前播放", 1_400);
    }
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.clipboard = state.clipboard?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.music = state.music?.id;
  };

  const clipboardText = (state) => state.clipboard?.text ?? "";
  const hasPinnedButton = (state) => (state.clipboard?.buttons ?? []).some((button) => button.title === "取消固定");
  const confirmThenWait = async () => {
    await clickDockButton("确认");
    await page.waitForTimeout(700);
    if (/待确认/.test(await operation())) {
      await page.getByTestId("voice-assistant-command-input").fill("确认");
      await page.getByTestId("voice-assistant-send").click({ force: true });
      await page.waitForTimeout(900);
    }
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["392"].includes(id) ? 1_700 : 1_250, {
      settleEnd: !["383", "387", "394", "400"].includes(id)
    });

    if (["383", "394", "400"].includes(id)) {
      await confirmThenWait();
    }

    const state = await snapshot();
    const ok = await noAssistantError();
    const clipText = clipboardText(state);
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;
    const todoText = state.todo?.text ?? "";
    const countdownText = state.countdown?.text ?? "";
    const op = await operation();

    if (id === "381") {
      await push(id, /临时验证码 839201/.test(clipText) && !/临时验证码 839201/.test(state.messageBoard?.text ?? "") && ok, `clipboard=${JSON.stringify(clipText)}; messageBoard=${Boolean(state.messageBoard)}`);
    } else if (id === "382") {
      await push(id, /demo@example\.com/.test(clipText) && hasPinnedButton(state) && ok, `clipboard=${JSON.stringify(clipText)}; pinned=${hasPinnedButton(state)}`);
    } else if (id === "383") {
      await push(id, /固定测试记录/.test(clipText) && !/普通测试记录/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "384") {
      await push(id, /项目口令 demo-token/.test(clipText) && hasPinnedButton(state) && ok, `clipboard=${JSON.stringify(clipText)}; pinned=${hasPinnedButton(state)}`);
    } else if (id === "385") {
      await push(id, /WiFi 密码提示/.test(clipText) && !/WiFi 密码提示/.test(state.messageBoard?.text ?? "") && ok, `clipboard=${JSON.stringify(clipText)}; messageBoard=${Boolean(state.messageBoard)}`);
    } else if (id === "386") {
      await push(id, /轻松音乐/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "387") {
      await push(id, /待确认|确认执行|确认/.test(op) && /普通测试记录/.test(clipText) && /固定测试记录/.test(clipText), `operation=${JSON.stringify(op)}; clipboard=${JSON.stringify(clipText)}`);
      await clickDockButton("取消");
    } else if (id === "388") {
      await push(id, /会议链接：https:\/\/meet\.example\.test\/voice/.test(clipText) && /会议链接：https:\/\/meet\.example\.test\/voice/.test(noteText) && ok, `clipboard=${JSON.stringify(clipText)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "389") {
      await push(id, /客服回复模板/.test(clipText) && /尽快处理/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "390") {
      await push(id, /Vercel 项目名 xiaozhuoban/.test(clipText) && hasPinnedButton(state) && ok, `clipboard=${JSON.stringify(clipText)}; pinned=${hasPinnedButton(state)}`);
    } else if (id === "391") {
      await push(id, /\/Users\/qianyifeng\/CodexProjects\/xiaozhuoban/.test(clipText) && /不要上传/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "392") {
      await push(id, /1234 临时验证码/.test(clipText) && /删除临时验证码/.test(`${todoText} ${countdownText}`) && ok, `clipboard=${JSON.stringify(clipText)}; todo=${JSON.stringify(todoText)}; countdown=${JSON.stringify(countdownText)}`);
    } else if (id === "393") {
      await push(id, /当前播放测试歌/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}; music=${JSON.stringify((state.music?.text || "").slice(0, 400))}`);
    } else if (id === "394") {
      await push(id, /固定测试记录/.test(clipText) && !/普通测试记录/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "395") {
      await push(id, /翻译结果：你好 Realtime/.test(clipText) && /已有便签内容/.test(noteText) && ok, `clipboard=${JSON.stringify(clipText)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "396") {
      await push(id, /打开表盘时钟/.test(clipText) && !state.dialClock && ok, `clipboard=${JSON.stringify(clipText)}; dialClock=${Boolean(state.dialClock)}`);
    } else if (id === "397") {
      await push(id, /2026-06-19/.test(clipText) && Boolean(state.note) && ok, `clipboard=${JSON.stringify(clipText)}; note=${Boolean(state.note)}`);
    } else if (id === "398") {
      await push(id, /部署 id：dpl_placeholder/.test(clipText) && ok, `clipboard=${JSON.stringify(clipText)}`);
    } else if (id === "399") {
      await push(id, /音乐登录状态检查步骤/.test(clipText) && hasPinnedButton(state) && ok, `clipboard=${JSON.stringify(clipText)}; pinned=${hasPinnedButton(state)}`);
    } else if (id === "400") {
      await push(id, /固定测试记录/.test(clipText) && !/普通测试记录/.test(clipText) && ok, `operation=${JSON.stringify(op)}; clipboard=${JSON.stringify(clipText)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageClipboardSafetyResults = value;
    let pre = document.getElementById("xz-real-page-clipboard-safety-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-clipboard-safety-results";
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
    throw new Error(`Clipboard safety real-page group failed: ${failed.length}/${results.length}`);
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
