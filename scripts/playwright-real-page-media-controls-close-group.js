async (page) => {
  const results = [];

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
      value: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop() {}
            }
          ]
        })
      }
    });
    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
  });

  const sendCommand = async (command, waitMs = 1000) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
    const confirm = page.getByRole("button", { name: /^确认$/ });
    if ((await confirm.count().catch(() => 0)) > 0 && (await confirm.first().isVisible().catch(() => false))) {
      await confirm.first().click();
      await page.waitForTimeout(500);
    }
  };

  const toolForRealtimeMock = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const byType = (type) => widgets.find((widget) => widget.type === type);
    const recorder = byType("recorder");
    if (input.includes("停止录音")) return { tool: "recorder.stop", args: { widgetId: recorder?.widgetId } };
    if (input.includes("播放刚才录音")) return { tool: "recorder.play", args: { widgetId: recorder?.widgetId } };
    if (input.includes("暂停录音")) return { tool: "recorder.pause", args: { widgetId: recorder?.widgetId } };
    return null;
  };

  const mockRealtimePlan = async (route) => {
    const body = route.request().postDataJSON();
    const input = String(body.input ?? "");
    const phase = body.phase;
    const selected = toolForRealtimeMock(input, body.context ?? {});
    if (!selected) {
      await route.continue();
      return;
    }
    if (phase === "plan_select") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ call: null, planSelection: { steps: [{ name: selected.tool, confidence: 0.94 }] } })
      });
      return;
    }
    if (phase === "plan_execute") {
      const commandId = `cmd_${Date.now()}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_plan_${Date.now()}`,
            sourceText: input,
            commands: [
              {
                id: commandId,
                tool: selected.tool,
                args: selected.args,
                risk: "safe",
                confidence: 0.94,
                source: "text-llm",
                requiresHarnessValidation: true
              }
            ],
            executionGroups: [{ mode: "sequential", commandIds: [commandId] }],
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

  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const rect = el.getBoundingClientRect();
        const text = el.innerText;
        const inputs = Array.from(el.querySelectorAll("textarea,input")).map((input) => ({
          ariaLabel: input.getAttribute("aria-label"),
          placeholder: input.getAttribute("placeholder"),
          value: input.value
        }));
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          text,
          inputs
        };
      });
      const includesAny = (text, needles) => needles.some((needle) => text.includes(needle));
      const find = (needles) => widgets.find((widget) => includesAny(widget.text, needles));
      return {
        bodyText: document.body.innerText,
        fullscreenWidgetId: document.fullscreenElement?.getAttribute("data-widget-id") || "",
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        weather: find(["天气"]),
        countdown: find(["倒计时", "计时器"]),
        todo: find(["待办"]),
        clipboard: find(["剪贴板"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
        market: find(["全球指数", "标普500", "上证指数"]),
        headline: find(["重大新闻", "新闻"])
      };
    });

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () => !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|RECORDER_/.test(await operation());
  const push = async (id, command, passed, evidence) => {
    results.push({ id, command, passed, operation: await operation(), evidence });
  };
  const ensureWidget = async (command, key, waitMs = 900) => {
    let state = await snapshot();
    if (state[key]) return state[key];
    await sendCommand(command, waitMs);
    state = await snapshot();
    return state[key];
  };

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });

  await page.route("**/api/realtime/tool-call", mockRealtimePlan);
  await page.route("https://itunes.apple.com/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 3,
        results: [
          {
            wrapperType: "track",
            kind: "song",
            trackId: 1001,
            trackName: "十年",
            artistName: "陈奕迅",
            collectionName: "黑白灰",
            artworkUrl100: "https://example.test/cover-1.jpg",
            previewUrl: "https://example.test/audio-1.m4a",
            trackViewUrl: "https://example.test/track-1"
          },
          {
            wrapperType: "track",
            kind: "song",
            trackId: 1002,
            trackName: "红豆",
            artistName: "王菲",
            collectionName: "唱游",
            artworkUrl100: "https://example.test/cover-2.jpg",
            previewUrl: "https://example.test/audio-2.m4a",
            trackViewUrl: "https://example.test/track-2"
          },
          {
            wrapperType: "track",
            kind: "song",
            trackId: 1003,
            trackName: "轻松一点",
            artistName: "测试歌手",
            collectionName: "测试歌单",
            artworkUrl100: "https://example.test/cover-3.jpg",
            previewUrl: "https://example.test/audio-3.m4a",
            trackViewUrl: "https://example.test/track-3"
          }
        ]
      })
    });
  });

  await ensureWidget("打开音乐", "music");
  await ensureWidget("打开电视", "tv");
  await ensureWidget("打开录音机", "recorder");

  const musicSearch = page.locator('[aria-label="音乐搜索"]').first();
  await musicSearch.fill("陈奕迅 十年");
  await musicSearch.press("Enter");
  await page.getByText("十年").first().waitFor({ state: "visible", timeout: 6_000 });

  await sendCommand("继续刚才的歌");
  let state = await snapshot();
  await push(
    "064",
    "继续刚才的歌",
    Boolean(state.music) && /已继续播放音乐|已开始播放音乐|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`
  );

  await sendCommand("下一首歌");
  state = await snapshot();
  await push(
    "065",
    "下一首歌",
    Boolean(state.music) && /下一首|已切换|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`
  );

  await sendCommand("上一首");
  state = await snapshot();
  await push(
    "066",
    "上一首",
    Boolean(state.music) && /上一首|已切换|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`
  );

  await sendCommand("电视切到 CCTV13", 1400);
  state = await snapshot();
  await push(
    "067",
    "电视切到 CCTV13",
    Boolean(state.tv) && /CCTV-?13|新闻/.test(state.tv.text) && await noAssistantError(state),
    `operation=${await operation()}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 900))}`
  );

  await sendCommand("播放 CCTV1", 1400);
  state = await snapshot();
  await push(
    "068",
    "播放 CCTV1",
    Boolean(state.tv) && (/CCTV-?1|综合/.test(state.tv.text) || /已播放电视|完成/.test(await operation())) && await noAssistantError(state),
    `operation=${await operation()}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 900))}`
  );

  await sendCommand("暂停电视直播");
  state = await snapshot();
  await push(
    "069",
    "暂停电视直播",
    Boolean(state.tv) && /已暂停电视|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; tv=${JSON.stringify((state.tv?.text || "").slice(0, 700))}`
  );

  await sendCommand("电视全屏");
  await page.waitForTimeout(300);
  state = await snapshot();
  await push(
    "070",
    "电视全屏",
    Boolean(state.tv) && /已全屏电视|完成/.test(await operation()) && await noAssistantError(state),
    `fullscreenWidgetId=${state.fullscreenWidgetId || "none"}; tvId=${state.tv?.id || "missing"}; class=${state.tv?.className || ""}`
  );
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => undefined);
  await page.waitForTimeout(300);

  await sendCommand("开始录音", 1200);
  state = await snapshot();
  await push(
    "071",
    "开始录音",
    Boolean(state.recorder) && /录音中|已开始录音|录音已经在进行中/.test(`${state.recorder?.text || ""} ${await operation()}`) && await noAssistantError(state),
    `operation=${await operation()}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 900))}`
  );

  await sendCommand("停止录音", 1800);
  await page.waitForFunction(() => document.body.innerText.includes("录音 ") || !document.body.innerText.includes("录音中"), null, { timeout: 6_000 }).catch(() => undefined);
  state = await snapshot();
  await push(
    "072",
    "停止录音",
    Boolean(state.recorder) && /录音 \d|已停止录音|当前没有正在录音/.test(`${state.recorder?.text || ""} ${await operation()}`) && await noAssistantError(state),
    `operation=${await operation()}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 900))}`
  );

  await sendCommand("播放刚才录音");
  state = await snapshot();
  await push(
    "073",
    "播放刚才录音",
    Boolean(state.recorder) && /已播放录音|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 900))}`
  );

  await sendCommand("暂停录音回放");
  state = await snapshot();
  await push(
    "074",
    "暂停录音回放",
    Boolean(state.recorder) && /已暂停录音|完成/.test(await operation()) && await noAssistantError(state),
    `operation=${await operation()}; recorder=${JSON.stringify((state.recorder?.text || "").slice(0, 900))}`
  );

  for (const [command, key] of [
    ["打开音乐", "music"],
    ["打开电视", "tv"],
    ["打开录音机", "recorder"],
    ["打开天气", "weather"],
    ["打开倒计时", "countdown"],
    ["打开待办", "todo"],
    ["打开剪贴板", "clipboard"],
    ["打开翻译", "translate"],
    ["打开计算器", "calculator"],
    ["打开行情", "market"],
    ["打开新闻", "headline"]
  ]) {
    await ensureWidget(command, key);
  }

  for (const item of [
    ["075", "把音乐收起来", "music"],
    ["076", "把电视收起来", "tv"],
    ["077", "把录音机收起来", "recorder"],
    ["078", "把天气收起来", "weather"],
    ["079", "把倒计时收起来", "countdown"],
    ["080", "把待办收起来", "todo"],
    ["081", "把剪贴板收起来", "clipboard"],
    ["082", "把翻译收起来", "translate"],
    ["083", "把计算器收起来", "calculator"],
    ["084", "把行情收起来", "market"],
    ["085", "把新闻收起来", "headline"]
  ]) {
    const [id, command, key] = item;
    await sendCommand(command);
    state = await snapshot();
    await push(id, command, !state[key] && await noAssistantError(state), `${key} widget present=${Boolean(state[key])}; widgets=${state.widgets.map((widget) => widget.id).join(",")}`);
  }

  await page.evaluate((value) => {
    window.__xzRealPageMediaCloseResults = value;
    let pre = document.getElementById("xz-real-page-media-close-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-media-close-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "760px";
      pre.style.maxHeight = "320px";
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
}
