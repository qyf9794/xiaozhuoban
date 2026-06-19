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
    "521": "清空便签内容，但必须先问我确认",
    "522": "整理桌面所有小工具，等我确认后再执行",
    "523": "清理剪贴板普通记录，不要删固定项",
    "524": "关闭音乐和电视之前先确认一次",
    "525": "删除临时倒计时，保留正在运行的那个",
    "526": "清空待办已完成项，需要弹确认",
    "527": "关闭全部新闻和行情窗口，确认后执行",
    "528": "把留言板收起来但不要删除历史消息",
    "529": "重置倒计时前先告诉我当前状态",
    "530": "清空搜索结果不要影响播放中的歌曲",
    "531": "关闭所有临时小工具，保留桌板",
    "532": "把便签清空并写新内容，先确认清空",
    "533": "清理剪贴板时保留 pinned 内容",
    "534": "撤销刚才的关闭动作，如果不能撤销就提示",
    "535": "自动整理桌面后不要改变全屏状态",
    "536": "关闭电视直播，但不要清除频道选择",
    "537": "停止录音前确认当前是否正在录",
    "538": "删除临时桌板之前先让我确认",
    "539": "清除留言板输入框，不要发送空消息",
    "540": "关闭全部媒体小工具前先弹统一确认"
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
    await page.waitForTimeout(900);
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

  const confirmPendingCommand = async () => {
    await page.getByTestId("voice-assistant-command-input").fill("确认");
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(1_400);
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
        const noteInput = Array.from(el.querySelectorAll("textarea,input")).find(
          (input) => input.getAttribute("placeholder") === "在这里记录你的想法..."
        );
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
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
      const all = (needles) => widgets.filter((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        boardNames: Array.from(document.querySelectorAll(".sidebar-board-button")).map((element) => element.textContent?.trim() ?? ""),
        widgets,
        note: find(["便签"]),
        todo: find(["待办"]),
        clipboard: find(["剪贴板"]),
        countdown: find(["倒计时"]),
        countdowns: all(["倒计时"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        headline: find(["重大新闻", "头条新闻", "财经新闻"]),
        market: find(["全球指数", "标普500", "上证指数", "恒生指数"]),
        messageBoard: find(["留言板"]),
        recorder: find(["录音机", "录音中", "录音 "])
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
    trackId: 14000 + index,
    trackName: query || "确认测试音乐",
    artistName: "测试歌手",
    collectionName: "确认保留测试",
    artworkUrl100: `https://example.test/confirmation-${index}.jpg`,
    previewUrl: `https://example.test/confirmation-${index}.m4a`,
    trackViewUrl: `https://example.test/confirmation-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "确认测试音乐";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack(term, 0), createTrack(term, 1)] })
    });
  });

  const createPlan = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const boards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const byType = (type) => widgets.find((widget) => widget.type === type || widget.definitionId === `wd_${type}`);
    const widgetId = (type) => byType(type)?.widgetId ?? forcedWidgetIds[type];
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
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
    const tempBoard = () => boards.find((board) => String(board.name ?? "").includes("临时"))?.boardId ?? context.boardId;

    if (input === "seed:note") return withTarget("note", "note.write", { content: "待清空内容", mode: "replace" });
    if (input === "seed:note-old") return withTarget("note", "note.write", { content: "旧便签内容", mode: "replace" });
    if (input === "seed:clipboard") {
      return [
        ...addIfNeeded("clipboard"),
        command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "普通记录" }),
        command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "固定记录", pinned: true })
      ];
    }
    if (input === "seed:todo") {
      return [
        ...addIfNeeded("todo"),
        command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "已完成任务" }),
        command("todo.complete_item", { widgetId: existingOrPlanned("todo"), text: "已完成任务" }),
        command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "保留任务" })
      ];
    }
    if (input === "seed:music") return withTarget("music", "music.play", { query: "正在播放测试", kind: "song" });
    if (input === "seed:tv") {
      return withTarget("tv", "tv.play", { channelName: "CCTV1", channelUrl: "https://example.test/cctv1.m3u8" });
    }
    if (input === "seed:headline-market") return [...addIfNeeded("headline"), ...addIfNeeded("market")];
    if (input === "seed:messageBoard") return addIfNeeded("messageBoard");
    if (input === "seed:temp-countdown") {
      return [add("countdown"), command("countdown.set", { widgetId: planned("countdown"), totalSeconds: 90, label: "临时倒计时" })];
    }
    if (input === "seed:running-countdown") {
      return [add("countdown"), command("countdown.set", { widgetId: planned("countdown"), totalSeconds: 180, start: true, label: "正在运行倒计时" })];
    }
    if (input === "seed:temp-note") {
      return [add("note"), command("note.write", { widgetId: planned("note"), content: "临时小工具", mode: "replace" })];
    }
    if (input === "seed:board") return [command("board.create", { name: "临时桌板" })];
    if (input === "seed:recorder") return addIfNeeded("recorder");

    if (input === commandText["521"]) return withTarget("note", "note.clear");
    if (input === commandText["522"]) return [command("board.auto_align", {}, "confirm")];
    if (input === commandText["523"]) return withTarget("clipboard", "clipboard.clear", { includePinned: false });
    if (input === commandText["524"]) {
      return [
        command("widget.remove", { widgetId: existingOrPlanned("music") }, "confirm"),
        command("widget.remove", { widgetId: existingOrPlanned("tv") })
      ];
    }
    if (input === commandText["525"]) return [command("widget.remove", { widgetId: forcedWidgetIds.tempCountdown ?? existingOrPlanned("countdown") })];
    if (input === commandText["526"]) return withTarget("todo", "todo.clear_completed");
    if (input === commandText["527"]) {
      return [
        command("widget.remove", { widgetId: existingOrPlanned("headline") }, "confirm"),
        command("widget.remove", { widgetId: existingOrPlanned("market") })
      ];
    }
    if (input === commandText["528"]) return [command("widget.remove", { widgetId: existingOrPlanned("messageBoard") })];
    if (input === commandText["529"]) return [];
    if (input === commandText["530"]) return [];
    if (input === commandText["531"]) return [command("widget.remove", { widgetId: forcedWidgetIds.tempNote ?? existingOrPlanned("note") })];
    if (input === commandText["532"]) {
      return [
        command("note.clear", { widgetId: existingOrPlanned("note") }, "destructive"),
        command("note.write", { widgetId: existingOrPlanned("note"), content: "新内容", mode: "replace" })
      ];
    }
    if (input === commandText["533"]) return withTarget("clipboard", "clipboard.clear", { includePinned: false });
    if (input === commandText["534"]) return [];
    if (input === commandText["535"]) return [command("board.auto_align", {}, "confirm")];
    if (input === commandText["536"]) return withTarget("tv", "tv.pause");
    if (input === commandText["537"]) return [];
    if (input === commandText["538"]) return [command("board.delete", { boardId: tempBoard() }, "confirm")];
    if (input === commandText["539"]) return withTarget("messageBoard", "messageBoard.clear_draft");
    if (input === commandText["540"]) {
      return [
        command("widget.remove", { widgetId: existingOrPlanned("music") }, "confirm"),
        command("widget.remove", { widgetId: existingOrPlanned("tv") }),
        command("widget.remove", { widgetId: existingOrPlanned("recorder") })
      ];
    }
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
    if (targetInputs.has(input)) {
      realtimeHits.push({ input, phase, matched: true, tools: commands.map((item) => item.tool), args: commands.map((item) => item.args) });
    }
    if (commands.length === 0) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ call: null, selection: null, planSelection: { steps: [] } }) });
      return;
    }

    const addedTypes = new Set(
      commands.filter((item) => item.tool === "board.add_widget").map((item) => String(item.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0])
    );
    const fallbackByType = {
      note: ["便签"],
      todo: ["待办"],
      clipboard: ["剪贴板"],
      countdown: ["倒计时"],
      music: ["音乐播放器", "Apple Music", "试听"],
      tv: ["电视播放", "CCTV", "央视"],
      headline: ["重大新闻", "头条新闻", "财经新闻"],
      market: ["全球指数", "标普500", "上证指数", "恒生指数"],
      messageBoard: ["留言板"],
      recorder: ["录音机", "录音中", "录音 "]
    };
    for (const item of commands) {
      if (!item.args || typeof item.args.widgetId !== "string" || !item.args.widgetId.startsWith("planned_widget_")) continue;
      const type = item.args.widgetId.slice("planned_widget_".length);
      if (addedTypes.has(type)) continue;
      const existingWidgetId = await widgetIdFromDom(fallbackByType[type] ?? []);
      if (existingWidgetId) item.args.widgetId = existingWidgetId;
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
      const plannedCommands = commands.map((item, index) => ({ id: `cmd_${index + 1}_${Date.now()}`, module: "confirmation-preservation", ...item }));
      for (const [index, commandItem] of plannedCommands.entries()) {
        const widgetIdArg = typeof commandItem.args?.widgetId === "string" ? commandItem.args.widgetId : "";
        const plannedType = widgetIdArg.startsWith("planned_widget_") ? widgetIdArg.slice("planned_widget_".length) : "";
        if (!plannedType) continue;
        const addDependency = plannedCommands
          .slice(0, index)
          .find((candidate) => candidate.tool === "board.add_widget" && String(candidate.args?.definitionId ?? "").replace(/^wd_/, "").split("_")[0] === plannedType);
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
            normalizedText: input,
            commands: plannedCommands,
            dependencies: [],
            executionGroups: plannedCommands.map((item, index) => ({ id: `group_${index + 1}`, mode: "sequential", commandIds: [item.id] })),
            confidence: 0.94,
            needsConfirmation: plannedCommands.some((item) => item.risk !== "safe"),
            createdBy: "text-llm",
            requiresHarnessValidation: true
          }
        })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ call: null, selection: null }) });
  };

  await page.route("**/api/realtime/tool-call", mockRealtimePlan);

  const ensureSeed = async (command, waitMs = 1_000) => {
    await sendCommand(command, waitMs);
    await page.waitForTimeout(200);
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    for (const key of ["note", "todo", "clipboard", "countdown", "music", "tv", "headline", "market", "messageBoard", "recorder"]) {
      forcedWidgetIds[key] = state[key]?.id;
    }
    forcedWidgetIds.tempCountdown = state.countdowns.find((widget) => widget.text.includes("临时倒计时"))?.id;
    forcedWidgetIds.runningCountdown = state.countdowns.find((widget) => widget.text.includes("正在运行倒计时"))?.id;
    forcedWidgetIds.tempNote = state.note?.text.includes("临时小工具") ? state.note.id : forcedWidgetIds.tempNote;
  };

  const seedBase = async (id) => {
    if (["521", "532"].includes(id)) await ensureSeed(id === "521" ? "seed:note" : "seed:note-old");
    if (["523", "533"].includes(id)) await ensureSeed("seed:clipboard");
    if (id === "524") {
      await ensureSeed("seed:music", 1_300);
      await captureForcedIds();
      await ensureSeed("seed:tv", 1_000);
    }
    if (id === "525") {
      await ensureSeed("seed:temp-countdown");
      await captureForcedIds();
      await ensureSeed("seed:running-countdown");
    }
    if (id === "526") await ensureSeed("seed:todo");
    if (id === "527") await ensureSeed("seed:headline-market");
    if (id === "528" || id === "539") await ensureSeed("seed:messageBoard");
    if (id === "529") await ensureSeed("seed:temp-countdown");
    if (id === "530") await ensureSeed("seed:music", 1_300);
    if (id === "531") await ensureSeed("seed:temp-note");
    if (id === "536") await ensureSeed("seed:tv", 1_000);
    if (id === "537") await ensureSeed("seed:recorder");
    if (id === "538") await ensureSeed("seed:board", 1_000);
    if (id === "540") {
      await ensureSeed("seed:music", 1_300);
      await captureForcedIds();
      await ensureSeed("seed:tv", 1_000);
      await captureForcedIds();
      await ensureSeed("seed:recorder");
    }
    await captureForcedIds();
    if (id === "539") {
      await page
        .locator("[data-widget-id]")
        .filter({ hasText: "留言板" })
        .locator("textarea")
        .fill("不要发送的草稿");
    }
  };

  const confirmIds = new Set(["521", "522", "523", "524", "526", "527", "532", "533", "535", "538", "540"]);
  const confirmsTool = (text, tool) => new RegExp(`(?:待确认：|确认执行 )${tool.replace(".", "\\.")}`).test(text);

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
    const before = await snapshot();
    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], 1_250, { keepConfirmation: confirmIds.has(id) });
    const beforeConfirm = await snapshot();
    const pendingOperation = await operation();
    if (confirmIds.has(id)) await confirmPendingCommand();
    await page.waitForTimeout(500);
    const state = await snapshot();
    const ok = await noAssistantError();
    const op = await operation();
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;
    const beforeConfirmNote = `${beforeConfirm.note?.noteContent ?? ""} ${beforeConfirm.note?.text ?? ""}`;
    const body = state.bodyText;

    if (id === "521") {
      await push(id, confirmsTool(pendingOperation, "note.clear") && /待清空内容/.test(beforeConfirmNote) && !/待清空内容/.test(noteText) && ok, `pending=${JSON.stringify(pendingOperation)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "522") {
      await push(id, confirmsTool(pendingOperation, "board.auto_align") && ok, `pending=${JSON.stringify(pendingOperation)}; operation=${JSON.stringify(op)}`);
    } else if (id === "523") {
      await push(id, confirmsTool(pendingOperation, "clipboard.clear") && /固定记录/.test(state.clipboard?.text ?? "") && !/普通记录/.test(state.clipboard?.text ?? "") && ok, `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 500))}`);
    } else if (id === "524") {
      await push(id, confirmsTool(pendingOperation, "widget.remove") && !state.music && !state.tv && ok, `pending=${JSON.stringify(pendingOperation)}; music=${Boolean(state.music)}; tv=${Boolean(state.tv)}`);
    } else if (id === "525") {
      await push(id, !state.countdowns.some((widget) => widget.text.includes("临时倒计时")) && state.countdowns.some((widget) => widget.text.includes("正在运行倒计时")) && ok, `countdowns=${JSON.stringify(state.countdowns.map((widget) => widget.text.slice(0, 120)))}`);
    } else if (id === "526") {
      await push(id, confirmsTool(pendingOperation, "todo.clear_completed") && !/已完成任务/.test(state.todo?.text ?? "") && /保留任务/.test(state.todo?.text ?? "") && ok, `todo=${JSON.stringify((state.todo?.text || "").slice(0, 500))}`);
    } else if (id === "527") {
      await push(id, confirmsTool(pendingOperation, "widget.remove") && !state.headline && !state.market && ok, `headline=${Boolean(state.headline)}; market=${Boolean(state.market)}`);
    } else if (id === "528") {
      await push(id, !state.messageBoard && ok, `messageBoard=${Boolean(state.messageBoard)}; beforeHadMessageBoard=${Boolean(before.messageBoard)}`);
    } else if (id === "529") {
      await push(id, Boolean(state.countdown) && /临时倒计时/.test(state.countdown?.text ?? "") && ok, `operation=${JSON.stringify(op)}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`);
    } else if (id === "530") {
      await push(id, Boolean(state.music) && /正在播放测试/.test(state.music?.text ?? "") && ok, `operation=${JSON.stringify(op)}; music=${JSON.stringify((state.music?.text || "").slice(0, 500))}`);
    } else if (id === "531") {
      await push(id, !state.widgets.some((widget) => widget.text.includes("临时小工具")) && state.boardNames.length > 0 && ok, `boardNames=${JSON.stringify(state.boardNames)}; widgets=${JSON.stringify(state.widgets.map((widget) => widget.text.slice(0, 120)))}`);
    } else if (id === "532") {
      await push(id, confirmsTool(pendingOperation, "note.clear") && /旧便签内容/.test(beforeConfirmNote) && /新内容/.test(noteText) && !/旧便签内容/.test(noteText) && ok, `pending=${JSON.stringify(pendingOperation)}; note=${JSON.stringify(noteText)}`);
    } else if (id === "533") {
      await push(id, /固定记录/.test(state.clipboard?.text ?? "") && !/普通记录/.test(state.clipboard?.text ?? "") && ok, `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 500))}`);
    } else if (id === "534") {
      await push(id, /没听懂|再说短一点|需要|撤销/.test(op) && ok, `operation=${JSON.stringify(op)}`);
    } else if (id === "535") {
      await push(id, confirmsTool(pendingOperation, "board.auto_align") && !/退出全屏/.test(op) && ok, `operation=${JSON.stringify(op)}`);
    } else if (id === "536") {
      await push(id, Boolean(state.tv) && /CCTV1|综合/.test(state.tv?.text ?? "") && /已暂停电视|完成|tv\.pause/.test(op) && ok, `operation=${JSON.stringify(op)}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 500))}`);
    } else if (id === "537") {
      await push(id, Boolean(state.recorder) && ok, `operation=${JSON.stringify(op)}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 500))}`);
    } else if (id === "538") {
      await push(id, confirmsTool(pendingOperation, "board.delete") && !state.boardNames.some((name) => name.includes("临时桌板")) && ok, `pending=${JSON.stringify(pendingOperation)}; boardNames=${JSON.stringify(state.boardNames)}`);
    } else if (id === "539") {
      const draftValue = state.messageBoard?.inputs.find((input) => input.placeholder?.includes("输入留言"))?.value ?? "";
      await push(id, Boolean(state.messageBoard) && draftValue === "" && !/不要发送的草稿/.test(state.messageBoard?.text ?? "") && ok, `draft=${JSON.stringify(draftValue)}; messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 500))}`);
    } else if (id === "540") {
      await push(id, confirmsTool(pendingOperation, "widget.remove") && !state.music && !state.tv && !state.recorder && ok, `pending=${JSON.stringify(pendingOperation)}; music=${Boolean(state.music)}; tv=${Boolean(state.tv)}; recorder=${Boolean(state.recorder)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageConfirmationPreservationResults = value;
    let pre = document.getElementById("xz-real-page-confirmation-preservation-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-confirmation-preservation-results";
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
  if (failed.length > 0) throw new Error(`Confirmation/preservation real-page group failed: ${failed.length}/${results.length}`);
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
