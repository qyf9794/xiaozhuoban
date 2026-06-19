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
    "261": "播放王菲的红豆，搜到后直接开始播放",
    "262": "我要听陈奕迅的十年，不要继续上一首",
    "263": "搜索周杰伦晴天，然后播放第一个完整结果",
    "264": "来一首孙燕姿遇见，如果没找到就先展示搜索结果",
    "265": "播放林俊杰江南，同时把音乐播放器放最前",
    "266": "找张学友吻别，别只放试听片段",
    "267": "打开音乐播放器，搜索邓紫棋泡沫并播放",
    "268": "给我放五月天倔强，播放后把歌词搜索也打开",
    "269": "播放 Beyond 海阔天空，不要换成同名翻唱",
    "270": "搜蔡健雅红色高跟鞋，先暂停当前歌曲再播放",
    "271": "我想听李宗盛山丘，找到原唱版本",
    "272": "播放 Taylor Swift 的 Lover，然后把音量状态记到便签",
    "273": "来一首 Adele 的 Hello，搜索词就用 Adele Hello",
    "274": "播放 Coldplay Yellow，别解析成颜色翻译",
    "275": "搜王力宏唯一并播放，播放失败就告诉我原因",
    "276": "给我放刘若英后来，播放器没有打开就先打开",
    "277": "播放梁静茹勇气，然后把倒计时设为四分钟",
    "278": "找陈奕迅孤勇者，播放前确认不是十年",
    "279": "我要听王菲容易受伤的女人，按歌曲名搜索",
    "280": "播放轻松音乐时重新搜索，不要沿用上一首"
  };

  const expected = {
    "261": { query: "王菲 红豆", title: "红豆", artist: "王菲" },
    "262": { query: "陈奕迅 十年", title: "十年", artist: "陈奕迅" },
    "263": { query: "周杰伦 晴天", title: "晴天", artist: "周杰伦" },
    "264": { query: "孙燕姿 遇见", title: "遇见", artist: "孙燕姿" },
    "265": { query: "林俊杰 江南", title: "江南", artist: "林俊杰" },
    "266": { query: "张学友 吻别", title: "吻别", artist: "张学友" },
    "267": { query: "邓紫棋 泡沫", title: "泡沫", artist: "邓紫棋" },
    "268": { query: "五月天 倔强", title: "倔强", artist: "五月天" },
    "269": { query: "Beyond 海阔天空", title: "海阔天空", artist: "Beyond" },
    "270": { query: "蔡健雅 红色高跟鞋", title: "红色高跟鞋", artist: "蔡健雅" },
    "271": { query: "李宗盛 山丘", title: "山丘", artist: "李宗盛" },
    "272": { query: "Taylor Swift Lover", title: "Lover", artist: "Taylor Swift" },
    "273": { query: "Adele Hello", title: "Hello", artist: "Adele" },
    "274": { query: "Coldplay Yellow", title: "Yellow", artist: "Coldplay" },
    "275": { query: "王力宏 唯一", title: "唯一", artist: "王力宏" },
    "276": { query: "刘若英 后来", title: "后来", artist: "刘若英" },
    "277": { query: "梁静茹 勇气", title: "勇气", artist: "梁静茹" },
    "278": { query: "陈奕迅 孤勇者", title: "孤勇者", artist: "陈奕迅" },
    "279": { query: "王菲 容易受伤的女人", title: "容易受伤的女人", artist: "王菲" },
    "280": { query: "轻松音乐", title: "轻松音乐", artist: "精选歌单" }
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MUSIC_TRACK_NOT_FOUND/.test(
      await operation()
    );

  const clickDockButton = async (label) => {
    await page
      .locator(".voice-assistant-dock__confirm button", { hasText: new RegExp(`^${label}$`) })
      .first()
      .waitFor({ state: "visible", timeout: 1_200 })
      .catch(() => undefined);
    await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll(".voice-assistant-dock__confirm button"));
      const target = buttons.find((button) => button.textContent?.trim() === text);
      target?.click();
    }, label);
    await page.waitForTimeout(500);
  };

  const settleLearningPrompt = async () => {
    const dockText = await page.locator(".voice-assistant-dock").innerText().catch(() => "");
    if (/要记住|下次直接执行|assistant\.learn/.test(dockText)) {
      await clickDockButton("取消");
    }
  };

  const clearPendingConfirmation = async () => {
    if (!/待确认/.test(await operation())) return;
    await clickDockButton("取消");
    await page.waitForTimeout(300);
  };

  const sendCommand = async (command, waitMs = 1_200) => {
    await clearPendingConfirmation();
    await settleLearningPrompt();
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
    await settleLearningPrompt();
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
          })),
          progress: Array.from(el.querySelectorAll('[role="progressbar"]')).map((bar) => ({
            label: bar.getAttribute("aria-label"),
            value: bar.getAttribute("aria-valuenow")
          }))
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      const music = find(["音乐播放器", "Apple Music", "试听"]);
      return {
        bodyText: document.body.innerText,
        widgets,
        music,
        note: find(["便签"]),
        countdown: find(["倒计时"]),
        translate: find(["翻译"]),
        commandPaletteOpen: /全局搜索|添加小工具|添加 Widget/.test(document.body.innerText),
        commandPaletteQuery:
          Array.from(document.querySelectorAll(".modal input, .command-palette input, input.glass-field")).find(
            (input) => input.getAttribute("placeholder") === "搜索桌板、Widget 内容"
          )?.value ?? "",
        musicQuery: music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value ?? "",
        noteTexts: widgets
          .filter((widget) => widget.text.includes("便签") && widget.text.includes("Markdown/富文本便签"))
          .map((widget) => [widget.text, ...widget.inputs.map((input) => input.value)].filter(Boolean).join("\n")),
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

  const createTrack = (query, index = 0) => {
    const normalized = query.trim();
    const entry =
      Object.values(expected).find((item) => item.query === normalized) ??
      Object.values(expected).find((item) => normalized.includes(item.title) || normalized.includes(item.artist)) ??
      { query: normalized, title: normalized || "测试歌曲", artist: "测试歌手" };
    return {
      wrapperType: "track",
      kind: "song",
      trackId: Math.abs([...`${entry.artist}-${entry.title}-${index}`].reduce((sum, char) => sum + char.charCodeAt(0), 0)),
      trackName: index === 0 ? entry.title : `${entry.title} 现场版`,
      artistName: index === 0 ? entry.artist : `${entry.artist} 翻唱`,
      collectionName: `${entry.artist} 精选`,
      artworkUrl100: `https://example.test/${encodeURIComponent(entry.title)}-${index}.jpg`,
      previewUrl: `https://example.test/${encodeURIComponent(entry.title)}-${index}.m4a`,
      trackViewUrl: `https://example.test/${encodeURIComponent(entry.title)}-${index}`
    };
  };

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 3,
        results: [createTrack(term, 0), createTrack(term, 1), createTrack(term, 2)]
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
    const command = (tool, args = {}, risk = "safe") => ({
      tool,
      args,
      risk,
      confidence: 0.93,
      source: "text",
      requiresHarnessValidation: true
    });
    const play = (query, args = {}) => command("music.play", { widgetId: existingOrPlanned("music"), query, kind: "song", ...args });

    if (input.includes("王菲的红豆")) return [play("王菲 红豆")];
    if (input.includes("陈奕迅的十年")) return [play("陈奕迅 十年")];
    if (input.includes("周杰伦晴天")) return [play("周杰伦 晴天", { resultIndex: 0 })];
    if (input.includes("孙燕姿遇见")) return [play("孙燕姿 遇见")];
    if (input.includes("林俊杰江南")) {
      return [play("林俊杰 江南"), command("widget.bring_to_front", { widgetId: existingOrPlanned("music") })];
    }
    if (input.includes("张学友吻别")) return [play("张学友 吻别")];
    if (input.includes("邓紫棋泡沫")) {
      return [
        command("board.add_widget", { definitionId: definitionId("music") }),
        command("music.play", { widgetId: planned("music"), query: "邓紫棋 泡沫", kind: "song" })
      ];
    }
    if (input.includes("五月天倔强")) {
      return [play("五月天 倔强"), command("app.command_palette.open", { query: "五月天 倔强 歌词" })];
    }
    if (input.includes("Beyond")) return [play("Beyond 海阔天空")];
    if (input.includes("蔡健雅红色高跟鞋")) return [command("music.pause", { widgetId: existingOrPlanned("music") }), play("蔡健雅 红色高跟鞋")];
    if (input.includes("李宗盛山丘")) return [play("李宗盛 山丘")];
    if (input.includes("Taylor Swift")) {
      return [
        play("Taylor Swift Lover"),
        command("board.add_widget", { definitionId: definitionId("note") }),
        command("note.write", { widgetId: planned("note"), content: "音乐音量状态：默认", mode: "append" })
      ];
    }
    if (input.includes("Adele")) return [play("Adele Hello")];
    if (input.includes("Coldplay")) return [play("Coldplay Yellow")];
    if (input.includes("王力宏唯一")) return [play("王力宏 唯一")];
    if (input.includes("刘若英后来")) {
      return [
        command("board.add_widget", { definitionId: definitionId("music") }),
        command("music.play", { widgetId: planned("music"), query: "刘若英 后来", kind: "song" })
      ];
    }
    if (input.includes("梁静茹勇气")) return [play("梁静茹 勇气"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 240, start: true })];
    if (input.includes("陈奕迅孤勇者")) return [play("陈奕迅 孤勇者")];
    if (input.includes("容易受伤的女人")) return [play("王菲 容易受伤的女人")];
    if (input.includes("轻松音乐")) return [command("music.previous", { widgetId: existingOrPlanned("music") }), command("music.search", { widgetId: existingOrPlanned("music"), query: "轻松音乐", kind: "song" })];
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
        .map((item) => {
          const definitionId = String(item.args?.definitionId ?? "");
          return ["music", "note", "countdown"].find((type) => definitionId.includes(type)) ?? "";
        })
        .filter(Boolean)
    );
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) {
        continue;
      }
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) {
        continue;
      }
      const fallback = {
        music: ["音乐播放器", "Apple Music", "试听"],
        note: ["便签"],
        countdown: ["倒计时"]
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
        body: JSON.stringify({ call: null, planSelection: { steps: commands.map((item) => ({ name: item.tool, confidence: 0.93 })) } })
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
            confidence: 0.93,
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

  const push = async (id, passed, evidence, requireRealtime = true) => {
    const command = commandText[id];
    const relatedRealtimeHits = realtimeHits.filter((hit) => hit.input === command).slice(-6);
    const realtimeOk = !requireRealtime || relatedRealtimeHits.length > 0;
    results.push({
      id,
      command,
      passed: Boolean(passed && realtimeOk),
      operation: await operation(),
      evidence: `${evidence}; realtimeHits=${JSON.stringify(relatedRealtimeHits)}${realtimeOk ? "" : "; missingRealtimeRoute=true"}`
    });
  };

  const musicMatches = (state, id) => {
    const item = expected[id];
    const musicText = state.music?.text ?? "";
    return (
      Boolean(state.music) &&
      state.musicQuery === item.query &&
      musicText.includes(item.title) &&
      musicText.includes(item.artist)
    );
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    forcedWidgetIds.music = undefined;
    forcedWidgetIds.note = undefined;
    forcedWidgetIds.countdown = undefined;
    if (!["267", "276"].includes(id)) {
      await ensureWidget("打开音乐", "music");
    }
    if (["272"].includes(id)) {
      await ensureWidget("新建便签实例用于测试", "note");
    }
    if (["277"].includes(id)) {
      await ensureWidget("打开倒计时", "countdown");
    }
    const seededState = await snapshot();
    forcedWidgetIds.music = seededState.music?.id;
    forcedWidgetIds.note = seededState.note?.id;
    forcedWidgetIds.countdown = seededState.countdown?.id;
    if (["267", "276"].includes(id)) {
      forcedWidgetIds.music = undefined;
    }
    if (id === "280") {
      await sendCommand("打开音乐", 800);
      forcedWidgetIds.music = (await snapshot()).music?.id;
      await page.getByTestId("voice-assistant-command-input").fill("播放陈奕迅的十年");
      targetInputs.add("播放陈奕迅的十年");
      await page.getByTestId("voice-assistant-send").click({ force: true });
      await page.waitForTimeout(1_200);
      targetInputs.delete("播放陈奕迅的十年");
    }

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["268"].includes(id) ? 1_400 : 1_200);
    const state = await snapshot();
    const ok = await noAssistantError();

    if (id === "265") {
      await push(
        id,
        musicMatches(state, id) && state.music?.zIndex === state.maxZ && ok,
        `musicQuery=${state.musicQuery}; musicZ=${state.music?.zIndex}/${state.maxZ}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "267" || id === "276") {
      await push(
        id,
        musicMatches(state, id) && ok,
        `musicAdded=${Boolean(state.music)}; musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "268") {
      await push(
        id,
        musicMatches(state, id) && state.commandPaletteOpen && state.commandPaletteQuery === "五月天 倔强 歌词" && ok,
        `musicQuery=${state.musicQuery}; palette=${state.commandPaletteOpen}; paletteQuery=${JSON.stringify(state.commandPaletteQuery)}`
      );
    } else if (id === "270") {
      await push(
        id,
        musicMatches(state, id) && /已暂停音乐|已开始播放音乐|music.pause/.test(await operation()) && ok,
        `operation=${await operation()}; musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "272") {
      await push(
        id,
        musicMatches(state, id) && state.noteTexts.some((text) => /音量状态/.test(text)) && ok,
        `musicQuery=${state.musicQuery}; noteTexts=${JSON.stringify(state.noteTexts.map((text) => text.slice(0, 300)))}`
      );
    } else if (id === "274") {
      await push(
        id,
        musicMatches(state, id) && !state.translate && ok,
        `musicQuery=${state.musicQuery}; translate=${Boolean(state.translate)}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "277") {
      await push(
        id,
        musicMatches(state, id) && /04:00|4:00|03:59|3:59|240|四分钟/.test(state.countdown?.text ?? "") && ok,
        `musicQuery=${state.musicQuery}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`
      );
    } else if (id === "278") {
      await push(
        id,
        musicMatches(state, id) && !(state.music?.text ?? "").includes("十年") && ok,
        `musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "280") {
      await push(
        id,
        musicMatches(state, id) && ok,
        `musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else {
      await push(
        id,
        musicMatches(state, id) && ok,
        `musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    }
  }

  await page.evaluate((value) => {
    window.__xzRealPageMusicPrecisionResults = value;
    let pre = document.getElementById("xz-real-page-music-precision-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-music-precision-results";
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
    throw new Error(`Music precision real-page group failed: ${failed.length}/${results.length}`);
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
