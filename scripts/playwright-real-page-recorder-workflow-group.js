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
        if (this.state === "inactive") return;
        this.state = "inactive";
        const blob = new Blob(["fake audio"], { type: this.mimeType });
        this.ondataavailable?.({ data: blob });
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
    "441": "开始录音，并在便签写下会议开始",
    "442": "停止录音后播放刚才录音检查声音",
    "443": "暂停录音回放，同时把电视也暂停",
    "444": "开始录一段测试音频，十秒后提醒我停止",
    "445": "打开录音机但先不要开始录",
    "446": "会议开始，打开录音机、便签和倒计时",
    "447": "停止录音并把文件状态写到留言板",
    "448": "播放刚才录音，如果没有录音就告诉我",
    "449": "录音机放到音乐旁边，避免遮住封面",
    "450": "开始录音后把表盘时钟调成夜间模式",
    "451": "暂停录音播放，再继续音乐",
    "452": "帮我录一段语音命令复现过程",
    "453": "停止录音并打开剪贴板保存测试编号",
    "454": "录音之前先关闭电视声音",
    "455": "开始录音，然后三分钟倒计时",
    "456": "播放录音时把音乐暂停",
    "457": "打开录音机，窗口放到左上角",
    "458": "如果录音还在进行就先停止再播放",
    "459": "会议结束，停止录音并追加纪要到便签",
    "460": "录音回放暂停后聚焦待办窗口"
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
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text: el.innerText,
          noteContent: noteInput ? noteInput.value : "",
          media: Array.from(el.querySelectorAll("audio,video")).map((media) => ({
            tag: media.tagName.toLowerCase(),
            src: media.getAttribute("src") || media.currentSrc || ""
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
        recorder: find(["录音机", "录音中", "录音 "]),
        note: find(["便签"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        countdown: find(["倒计时"]),
        todo: find(["待办"]),
        messageBoard: find(["留言板"]),
        music: find(["音乐播放器", "Apple Music", "试听"]),
        dialClock: find(["BALMUDA", "进入夜间模式", "退出夜间模式"]),
        clipboard: find(["剪贴板"]),
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
    trackId: 9800 + index,
    trackName: query || "继续播放测试音乐",
    artistName: "测试歌手",
    collectionName: "录音联动测试",
    artworkUrl100: `https://example.test/recorder-music-${index}.jpg`,
    previewUrl: `https://example.test/recorder-music-${index}.m4a`,
    trackViewUrl: `https://example.test/recorder-music-${index}`
  });

  await page.route("https://itunes.apple.com/search**", async (route) => {
    const url = new URL(route.request().url());
    const term = url.searchParams.get("term") ?? "继续播放测试音乐";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: 2, results: [createTrack(term, 0), createTrack(term, 1)] })
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
    const withRecorder = (tool, args = {}) => [...addIfNeeded("recorder"), command(tool, { widgetId: existingOrPlanned("recorder"), ...args })];

    if (input === "seed:recorder") return [add("recorder")];
    if (input === "seed:note") return [add("note")];
    if (input === "seed:tv") return [add("tv")];
    if (input === "seed:countdown") return [add("countdown")];
    if (input === "seed:todo") return [add("todo")];
    if (input === "seed:messageBoard") return [add("messageBoard")];
    if (input === "seed:music") return [add("music"), command("music.play", { widgetId: planned("music"), query: "继续播放测试音乐", kind: "song" })];
    if (input === "seed:dialClock") return [add("dialClock")];
    if (input === "seed:clipboard") return [add("clipboard")];
    if (input === "seed:recording-start") return withRecorder("recorder.start");
    if (input === "seed:recording-stop") return withRecorder("recorder.stop");
    if (input === "seed:recording-play") return withRecorder("recorder.play");

    if (input === commandText["441"]) return [...withRecorder("recorder.start"), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "会议开始", mode: "append" })];
    if (input === commandText["442"]) return [command("recorder.stop", { widgetId: existingOrPlanned("recorder") }), command("recorder.play", { widgetId: existingOrPlanned("recorder") })];
    if (input === commandText["443"]) return [command("recorder.pause", { widgetId: existingOrPlanned("recorder") }), command("tv.pause", { widgetId: existingOrPlanned("tv") })];
    if (input === commandText["444"]) return [...withRecorder("recorder.start"), ...addIfNeeded("countdown"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 10, start: true, label: "停止录音" }), ...addIfNeeded("todo"), command("todo.add_item", { widgetId: existingOrPlanned("todo"), text: "十秒后停止录音" })];
    if (input === commandText["445"]) return [add("recorder")];
    if (input === commandText["446"]) return [...withRecorder("recorder.start"), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "会议开始", mode: "append" }), ...addIfNeeded("countdown"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 1800, start: true, label: "会议" })];
    if (input === commandText["447"]) return [command("recorder.stop", { widgetId: existingOrPlanned("recorder") }), ...addIfNeeded("messageBoard"), command("messageBoard.send", { widgetId: existingOrPlanned("messageBoard"), text: "录音文件已保存" })];
    if (input === commandText["448"]) return [...withRecorder("recorder.play")];
    if (input === commandText["449"]) return [...withRecorder("recorder.start"), command("widget.move", { widgetId: existingOrPlanned("recorder"), x: 440, y: 72 })];
    if (input === commandText["450"]) return [...withRecorder("recorder.start"), ...addIfNeeded("dialClock"), command("dialClock.set_night_mode", { widgetId: existingOrPlanned("dialClock"), enabled: true })];
    if (input === commandText["451"]) return [command("recorder.pause", { widgetId: existingOrPlanned("recorder") }), command("music.resume", { widgetId: existingOrPlanned("music") })];
    if (input === commandText["452"]) return withRecorder("recorder.start");
    if (input === commandText["453"]) return [command("recorder.stop", { widgetId: existingOrPlanned("recorder") }), ...addIfNeeded("clipboard"), command("clipboard.add_text", { widgetId: existingOrPlanned("clipboard"), text: "录音测试编号 REC-441-460" })];
    if (input === commandText["454"]) return [command("tv.pause", { widgetId: existingOrPlanned("tv") }), ...withRecorder("recorder.start")];
    if (input === commandText["455"]) return [...withRecorder("recorder.start"), ...addIfNeeded("countdown"), command("countdown.set", { widgetId: existingOrPlanned("countdown"), totalSeconds: 180, start: true, label: "录音" })];
    if (input === commandText["456"]) return [command("music.pause", { widgetId: existingOrPlanned("music") }), ...withRecorder("recorder.play")];
    if (input === commandText["457"]) return [add("recorder"), command("widget.move", { widgetId: planned("recorder"), x: 40, y: 48 })];
    if (input === commandText["458"]) return [command("recorder.stop", { widgetId: existingOrPlanned("recorder") }), command("recorder.play", { widgetId: existingOrPlanned("recorder") })];
    if (input === commandText["459"]) return [command("recorder.stop", { widgetId: existingOrPlanned("recorder") }), ...addIfNeeded("note"), command("note.write", { widgetId: existingOrPlanned("note"), content: "会议结束：录音已停止，纪要待整理", mode: "append" })];
    if (input === commandText["460"]) return [command("recorder.pause", { widgetId: existingOrPlanned("recorder") }), ...addIfNeeded("todo"), command("widget.focus", { widgetId: existingOrPlanned("todo") })];
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
        recorder: ["录音机", "录音中", "录音 "],
        note: ["便签"],
        tv: ["电视播放", "CCTV", "央视"],
        countdown: ["倒计时"],
        todo: ["待办"],
        messageBoard: ["留言板"],
        music: ["音乐播放器", "Apple Music", "试听"],
        dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
        clipboard: ["剪贴板"]
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

  const ensureWidget = async (seedCommand, key, waitMs = 1_000) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(seedCommand, waitMs);
    state = await snapshot();
    return state[key];
  };

  const captureForcedIds = async () => {
    const state = await snapshot();
    forcedWidgetIds.recorder = state.recorder?.id;
    forcedWidgetIds.note = state.note?.id;
    forcedWidgetIds.tv = state.tv?.id;
    forcedWidgetIds.countdown = state.countdown?.id;
    forcedWidgetIds.todo = state.todo?.id;
    forcedWidgetIds.messageBoard = state.messageBoard?.id;
    forcedWidgetIds.music = state.music?.id;
    forcedWidgetIds.dialClock = state.dialClock?.id;
    forcedWidgetIds.clipboard = state.clipboard?.id;
  };

  const waitForRecordingItem = async () => {
    await page
      .waitForFunction(() => /录音\s+\d|录音\s+[0-9:]/.test(document.body.innerText), null, { timeout: 4_000 })
      .catch(() => undefined);
  };

  const waitForRecordingActive = async () => {
    await page
      .waitForFunction(() => document.body.innerText.includes("录音中"), null, { timeout: 4_000 })
      .catch(() => undefined);
  };

  const seedRecordingFile = async () => {
    await ensureWidget("seed:recorder", "recorder", 900);
    await captureForcedIds();
    await sendCommand("seed:recording-start", 1_400);
    await waitForRecordingActive();
    await sendCommand("seed:recording-stop", 1_500);
    await waitForRecordingItem();
    await captureForcedIds();
  };

  const seedActiveRecording = async () => {
    await ensureWidget("seed:recorder", "recorder", 900);
    await captureForcedIds();
    await sendCommand("seed:recording-start", 1_400);
    await waitForRecordingActive();
    await captureForcedIds();
  };

  const seedBase = async (id) => {
    if (!["445", "457"].includes(id)) await ensureWidget("seed:recorder", "recorder");
    if (["441", "446", "459"].includes(id)) await ensureWidget("seed:note", "note");
    if (["443", "454"].includes(id)) await ensureWidget("seed:tv", "tv");
    if (["444", "446", "455"].includes(id)) await ensureWidget("seed:countdown", "countdown");
    if (["444", "460"].includes(id)) await ensureWidget("seed:todo", "todo");
    if (id === "447") await ensureWidget("seed:messageBoard", "messageBoard");
    if (["449", "451", "456"].includes(id)) await ensureWidget("seed:music", "music", 1_300);
    if (id === "450") await ensureWidget("seed:dialClock", "dialClock");
    if (id === "453") await ensureWidget("seed:clipboard", "clipboard");
    if (["442", "447", "453", "458", "459"].includes(id)) await seedActiveRecording();
    if (["443", "448", "451", "456", "460"].includes(id)) {
      await seedRecordingFile();
      if (["443", "451", "460"].includes(id)) {
        await sendCommand("seed:recording-play", 1_000);
      }
    }
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

  for (const id of Object.keys(commandText).sort((left, right) => Number(left) - Number(right))) {
    await resetAppState();
    for (const key of Object.keys(forcedWidgetIds)) delete forcedWidgetIds[key];
    await seedBase(id);
    await captureForcedIds();

    targetInputs.add(commandText[id]);
    await sendCommand(commandText[id], ["442", "447", "453", "458", "459"].includes(id) ? 1_700 : 1_300);
    if (["442", "447", "453", "458", "459"].includes(id)) await waitForRecordingItem();
    const state = await snapshot();
    const ok = await noAssistantError();
    const recorderText = state.recorder?.text ?? "";
    const noteText = `${state.note?.noteContent ?? ""} ${state.note?.text ?? ""}`;
    const operationText = await operation();

    if (id === "441") {
      await push(id, /录音中|停止录音/.test(recorderText) && /会议开始/.test(noteText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 500))}; note=${JSON.stringify(noteText.slice(0, 500))}`);
    } else if (id === "442") {
      await push(id, /录音\s+\d|录音\s+[0-9:]/.test(recorderText) && /已播放录音|完成/.test(operationText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 700))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "443") {
      await push(id, Boolean(state.tv) && /已暂停录音|完成/.test(operationText) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 400))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "444") {
      await push(id, /录音中|停止录音/.test(recorderText) && /00:10|10|停止录音/.test(state.countdown?.text ?? "") && /十秒后停止录音/.test(state.todo?.text ?? "") && ok, `recorder=${JSON.stringify(recorderText.slice(0, 400))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}; todo=${JSON.stringify((state.todo?.text || "").slice(0, 400))}`);
    } else if (id === "445") {
      await push(id, Boolean(state.recorder) && !/录音中/.test(recorderText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "446") {
      await push(id, /录音中|停止录音/.test(recorderText) && /会议开始/.test(noteText) && /30:00|29:/.test(state.countdown?.text ?? "") && ok, `recorder=${JSON.stringify(recorderText.slice(0, 400))}; note=${JSON.stringify(noteText.slice(0, 400))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`);
    } else if (id === "447") {
      await push(id, /录音文件已保存/.test(state.messageBoard?.text ?? "") && /录音\s+\d|录音\s+[0-9:]/.test(recorderText) && ok, `messageBoard=${JSON.stringify((state.messageBoard?.text || "").slice(0, 500))}; recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "448") {
      await push(id, /已播放录音|完成/.test(operationText) && ok, `operation=${JSON.stringify(operationText)}; recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "449") {
      await push(id, /录音中|停止录音/.test(recorderText) && Boolean(state.music) && (state.recorder?.rect.x ?? 0) > (state.music?.rect.x ?? -1) && ok, `recorderRect=${JSON.stringify(state.recorder?.rect)}; musicRect=${JSON.stringify(state.music?.rect)}`);
    } else if (id === "450") {
      await push(id, /录音中|停止录音/.test(recorderText) && /已进入夜间模式|完成/.test(operationText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 400))}; dialClock=${JSON.stringify((state.dialClock?.text || "").slice(0, 500))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "451") {
      await push(id, Boolean(state.music) && /已开始播放音乐|完成/.test(operationText) && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 500))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "452") {
      await push(id, /录音中|停止录音/.test(recorderText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "453") {
      await push(id, /录音测试编号 REC-441-460/.test(state.clipboard?.text ?? "") && /录音\s+\d|录音\s+[0-9:]/.test(recorderText) && ok, `clipboard=${JSON.stringify((state.clipboard?.text || "").slice(0, 500))}; recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "454") {
      await push(id, Boolean(state.tv) && /录音中|停止录音/.test(recorderText) && ok, `tv=${JSON.stringify((state.tv?.text || "").slice(0, 300))}; recorder=${JSON.stringify(recorderText.slice(0, 400))}`);
    } else if (id === "455") {
      await push(id, /录音中|停止录音/.test(recorderText) && /03:00|02:59|180|录音/.test(state.countdown?.text ?? "") && ok, `recorder=${JSON.stringify(recorderText.slice(0, 400))}; countdown=${JSON.stringify((state.countdown?.text || "").slice(0, 400))}`);
    } else if (id === "456") {
      await push(id, Boolean(state.music) && /已播放录音|完成/.test(operationText) && ok, `music=${JSON.stringify((state.music?.text || "").slice(0, 400))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "457") {
      await push(id, Boolean(state.recorder) && (state.recorder?.rect.x ?? 999) <= 360 && (state.recorder?.rect.y ?? 999) < 130 && ok, `recorderRect=${JSON.stringify(state.recorder?.rect)}`);
    } else if (id === "458") {
      await push(id, /录音\s+\d|录音\s+[0-9:]/.test(recorderText) && /已播放录音|完成/.test(operationText) && ok, `recorder=${JSON.stringify(recorderText.slice(0, 700))}; operation=${JSON.stringify(operationText)}`);
    } else if (id === "459") {
      await push(id, /会议结束/.test(noteText) && /录音\s+\d|录音\s+[0-9:]/.test(recorderText) && ok, `note=${JSON.stringify(noteText.slice(0, 500))}; recorder=${JSON.stringify(recorderText.slice(0, 500))}`);
    } else if (id === "460") {
      await push(id, /is-focused/.test(state.todo?.className ?? "") && /已暂停录音|完成/.test(operationText) && ok, `todoClass=${state.todo?.className}; operation=${JSON.stringify(operationText)}`);
    }
    targetInputs.delete(commandText[id]);
  }

  await page.evaluate((value) => {
    window.__xzRealPageRecorderWorkflowResults = value;
    let pre = document.getElementById("xz-real-page-recorder-workflow-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-recorder-workflow-results";
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
    throw new Error(`Recorder workflow real-page group failed: ${failed.length}/${results.length}`);
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
