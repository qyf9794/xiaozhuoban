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
    "281": "我想听点轻松的中文歌，先搜索不要立刻播放",
    "282": "放一点适合写代码的纯音乐，结果要重新搜索",
    "283": "来点不吵的背景音乐，别播刚才那首",
    "284": "找适合睡前的歌，播放器放在桌面左下",
    "285": "我想听轻快但不太吵的音乐，先展示列表",
    "286": "播放舒缓钢琴，三分钟后提醒我休息眼睛",
    "287": "来点粤语老歌，如果识别不准就交给 realtime",
    "288": "刚才不是这首，重新搜陈奕迅的十年",
    "289": "不要播放试听版，优先用已登录的音乐账号",
    "290": "给我找运动时听的歌，并把下一首按钮准备好",
    "291": "换成轻松一点的，不要继续现在的歌曲",
    "292": "搜索雨天适合听的音乐，只要歌曲不要电台",
    "293": "找午休背景音乐，播放前把电视暂停",
    "294": "我说的是轻松音乐，不是上一首，重新搜索",
    "295": "给我一首安静的英文歌，先搜完整曲库",
    "296": "播放适合开车的歌，但音量不要改",
    "297": "搜白噪音或自然声，不要打开电视",
    "298": "来点周末感觉的歌，如果没把握就让我确认",
    "299": "先暂停当前歌曲，再找轻柔民谣",
    "300": "把音乐换成专注模式用的播放列表"
  };

  const expected = {
    "281": { tool: "music.search", query: "轻松中文歌", title: "轻松中文歌", artist: "中文精选" },
    "282": { tool: "music.search", query: "写代码 纯音乐", title: "写代码纯音乐", artist: "专注精选" },
    "283": { tool: "music.play", query: "不吵 背景音乐", title: "不吵背景音乐", artist: "背景精选" },
    "284": { tool: "music.play", query: "睡前歌曲", title: "睡前歌曲", artist: "睡前精选" },
    "285": { tool: "music.search", query: "轻快 不吵 音乐", title: "轻快不吵音乐", artist: "轻快精选" },
    "286": { tool: "music.play", query: "舒缓钢琴", title: "舒缓钢琴", artist: "钢琴精选" },
    "287": { tool: "music.play", query: "粤语老歌", title: "粤语老歌", artist: "粤语精选" },
    "288": { tool: "music.search", query: "陈奕迅 十年", title: "十年", artist: "陈奕迅" },
    "289": { tool: "music.play", query: "Apple Music 完整歌曲", title: "完整歌曲", artist: "Apple Music" },
    "290": { tool: "music.play", query: "运动音乐", title: "运动音乐", artist: "运动精选" },
    "291": { tool: "music.play", query: "轻松音乐", title: "轻松音乐", artist: "精选歌单" },
    "292": { tool: "music.search", query: "雨天适合听的音乐", title: "雨天音乐", artist: "雨天精选" },
    "293": { tool: "music.play", query: "午休背景音乐", title: "午休背景音乐", artist: "午休精选" },
    "294": { tool: "music.search", query: "轻松音乐", title: "轻松音乐", artist: "精选歌单" },
    "295": { tool: "music.play", query: "安静英文歌", title: "安静英文歌", artist: "English Select" },
    "296": { tool: "music.play", query: "开车音乐", title: "开车音乐", artist: "驾驶精选" },
    "297": { tool: "music.search", query: "白噪音 自然声", title: "白噪音自然声", artist: "自然声精选" },
    "298": { tool: "music.play", query: "周末感觉音乐", title: "周末感觉音乐", artist: "周末精选" },
    "299": { tool: "music.play", query: "轻柔民谣", title: "轻柔民谣", artist: "民谣精选" },
    "300": { tool: "music.play", query: "专注模式播放列表", title: "专注模式播放列表", artist: "专注精选" }
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () =>
    !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数|MUSIC_TRACK_NOT_FOUND/.test(
      await operation()
    );

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
      const music = find(["音乐播放器", "Apple Music", "试听"]);
      return {
        bodyText: document.body.innerText,
        widgets,
        music,
        tv: find(["电视播放", "CCTV", "央视"]),
        todo: find(["待办"]),
        countdown: find(["倒计时"]),
        musicQuery: music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value ?? ""
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
      { title: normalized || "测试音乐", artist: "测试歌手" };
    return {
      wrapperType: "track",
      kind: "song",
      trackId: Math.abs([...`${entry.artist}-${entry.title}-${index}`].reduce((sum, char) => sum + char.charCodeAt(0), 0)),
      trackName: index === 0 ? entry.title : `${entry.title} 版本${index + 1}`,
      artistName: index === 0 ? entry.artist : `${entry.artist} 其他版本`,
      collectionName: `${entry.artist} 合集`,
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
    const command = (tool, args = {}) => ({
      tool,
      args,
      risk: "safe",
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });
    const music = (id) => expected[id];
    const search = (id) => command("music.search", { widgetId: existingOrPlanned("music"), query: music(id).query, kind: "song" });
    const play = (id) => command("music.play", { widgetId: existingOrPlanned("music"), query: music(id).query, kind: "song" });

    if (input === commandText["281"]) return [search("281")];
    if (input === commandText["282"]) return [search("282")];
    if (input === commandText["283"]) return [play("283")];
    if (input === commandText["284"]) return [play("284"), command("widget.move", { widgetId: existingOrPlanned("music"), x: 24, y: 620 })];
    if (input === commandText["285"]) return [search("285")];
    if (input === commandText["286"]) {
      return [
        play("286"),
        command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 180, start: true }),
        command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "休息眼睛", dueAt: "2026-06-19T08:03:00.000Z" })
      ];
    }
    if (input === commandText["287"]) return [play("287")];
    if (input === commandText["288"]) return [search("288")];
    if (input === commandText["289"]) return [play("289")];
    if (input === commandText["290"]) return [play("290")];
    if (input === commandText["291"]) return [play("291")];
    if (input === commandText["292"]) return [search("292")];
    if (input === commandText["293"]) return [command("tv.pause", { widgetId: existingOrPlanned("tv") }), play("293")];
    if (input === commandText["294"]) return [search("294")];
    if (input === commandText["295"]) return [play("295")];
    if (input === commandText["296"]) return [play("296")];
    if (input === commandText["297"]) return [search("297")];
    if (input === commandText["298"]) return [play("298")];
    if (input === commandText["299"]) return [command("music.pause", { widgetId: existingOrPlanned("music") }), play("299")];
    if (input === commandText["300"]) return [play("300")];
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
        music: ["音乐播放器", "Apple Music", "试听"],
        countdown: ["倒计时"],
        todo: ["待办"],
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

  const musicMatches = (state, id) => {
    const item = expected[id];
    const musicText = state.music?.text ?? "";
    return Boolean(state.music) && state.musicQuery === item.query && musicText.includes(item.title) && musicText.includes(item.artist);
  };

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    forcedWidgetIds.music = undefined;
    forcedWidgetIds.todo = undefined;
    forcedWidgetIds.countdown = undefined;
    forcedWidgetIds.tv = undefined;

    await ensureWidget("打开音乐", "music");
    if (["286"].includes(id)) {
      await ensureWidget("打开倒计时", "countdown");
      await ensureWidget("打开待办", "todo");
    }
    if (id === "293") {
      await ensureWidget("打开电视", "tv");
    }

    const seededState = await snapshot();
    forcedWidgetIds.music = seededState.music?.id;
    forcedWidgetIds.todo = seededState.todo?.id;
    forcedWidgetIds.countdown = seededState.countdown?.id;
    forcedWidgetIds.tv = seededState.tv?.id;

    if (["283", "291", "294"].includes(id)) {
      await sendCommand("播放陈奕迅的十年", 900);
      forcedWidgetIds.music = (await snapshot()).music?.id;
    }

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["286", "293"].includes(id) ? 1_500 : 1_200);
    const state = await snapshot();
    const ok = await noAssistantError();

    if (id === "284") {
      await push(
        id,
        musicMatches(state, id) && (state.music?.rect.x ?? 9999) < 340 && (state.music?.rect.y ?? 0) > 430 && ok,
        `musicQuery=${state.musicQuery}; musicRect=${JSON.stringify(state.music?.rect)}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else if (id === "286") {
      await push(
        id,
        musicMatches(state, id) && /03:00|02:59|180|三分钟/.test(state.countdown?.text ?? "") && /休息眼睛/.test(state.todo?.text ?? "") && ok,
        `musicQuery=${state.musicQuery}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 300))}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 300))}`
      );
    } else if (id === "293") {
      await push(
        id,
        musicMatches(state, id) && Boolean(state.tv) && ok,
        `musicQuery=${state.musicQuery}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 300))}; operation=${await operation()}`
      );
    } else if (id === "297") {
      await push(
        id,
        musicMatches(state, id) && !state.tv && ok,
        `musicQuery=${state.musicQuery}; tv=${Boolean(state.tv)}; bodyHasTv=${/电视播放/.test(state.bodyText)}`
      );
    } else if (["281", "282", "285", "288", "292", "294"].includes(id)) {
      await push(
        id,
        musicMatches(state, id) && ok,
        `searchOnly=true; musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    } else {
      await push(
        id,
        musicMatches(state, id) && ok,
        `musicQuery=${state.musicQuery}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`
      );
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageMusicMoodCorrectionResults = value;
    let pre = document.getElementById("xz-real-page-music-mood-correction-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-music-mood-correction-results";
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
    throw new Error(`Music mood/correction real-page group failed: ${failed.length}/${results.length}`);
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
