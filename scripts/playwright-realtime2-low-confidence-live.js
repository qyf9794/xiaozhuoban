async (page) => {
  const appUrl = globalThis.__XZ_E2E_APP_URL || "https://xiaozhuoban.bqxb.org/app";
  const results = [];

  const diagnostics = async () =>
    page.evaluate(() => {
      const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
      return exported && typeof exported === "object" ? exported : { events: [], lastHarnessDiagnostics: null };
    });

  const realtimeEvents = async () => {
    const diag = await diagnostics();
    return Array.isArray(diag.events)
      ? diag.events.filter((event) => String(event.type || "").startsWith("realtime.") || String(event.type || "").startsWith("voice.realtime"))
      : [];
  };

  const eventCount = async () => (await diagnostics()).events?.length ?? 0;

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");

  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        return {
          id: el.getAttribute("data-widget-id") || "",
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
        musicQuery: music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "",
        weather: find(["天气", "上海", "北京"]),
        messageBoard: find(["留言板"])
      };
    });

  const publish = async () => {
    await page.evaluate((value) => {
      window.__xzRealtime2LowConfidenceLiveResults = value;
      let pre = document.getElementById("xz-realtime2-low-confidence-live-results");
      if (!pre) {
        pre = document.createElement("pre");
        pre.id = "xz-realtime2-low-confidence-live-results";
        pre.style.position = "fixed";
        pre.style.left = "8px";
        pre.style.bottom = "8px";
        pre.style.maxWidth = "820px";
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
  };

  const push = async (id, command, passed, evidence) => {
    const diag = await diagnostics();
    results.push({
      id,
      command,
      passed,
      operation: await operation(),
      evidence,
      realtimeEvents: (diag.events || [])
        .filter((event) => String(event.type || "").startsWith("realtime.") || String(event.type || "").startsWith("voice.realtime"))
        .slice(-28)
    });
    await publish();
  };

  const sendCommand = async (command, waitMs = 500) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
  };

  const waitForNewDiagnostic = async (startIndex, predicate, timeoutMs = 35_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const diag = await diagnostics();
      const events = Array.isArray(diag.events) ? diag.events.slice(startIndex) : [];
      const found = events.find(predicate);
      if (found) return found;
      await page.waitForTimeout(250);
    }
    return null;
  };

  const waitForToolResult = async (startIndex, toolCall, timeoutMs = 25_000) => {
    if (!toolCall) return null;
    return waitForNewDiagnostic(
      startIndex,
      (event) =>
        event.type === "realtime.tool_result.send" &&
        event.operationId === toolCall.operationId &&
        event.toolName === toolCall.toolName,
      timeoutMs
    );
  };

  await page.goto(appUrl);
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 12_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
  });

  for (const setupCommand of ["打开音乐", "打开天气", "打开留言板"]) {
    await sendCommand(setupCommand, 1000);
  }
  let state = await snapshot();
  if (!state.music || !state.weather || !state.messageBoard) {
    await push(
      "rt2-low-setup",
      "打开音乐/天气/留言板",
      false,
      `music=${Boolean(state.music)} weather=${Boolean(state.weather)} messageBoard=${Boolean(state.messageBoard)} body=${JSON.stringify(state.bodyText.slice(0, 800))}`
    );
    return;
  }

  try {
    await page.getByRole("button", { name: "连接文字 Realtime" }).click();
    await page.waitForFunction(
      () => document.body.innerText.includes("文字 Realtime 已连接") || document.body.innerText.includes("断开文字"),
      null,
      { timeout: 35_000 }
    );
  } catch {
    await push("rt2-low-connect", "连接文字 Realtime", false, `events=${JSON.stringify((await realtimeEvents()).slice(-14))}; body=${JSON.stringify((await snapshot()).bodyText.slice(0, 900))}`);
    return;
  }

  let start = await eventCount();
  await sendCommand("我想听点放松的不一定播放");
  const relaxSearch = await waitForNewDiagnostic(
    start,
    (event) =>
      event.type === "realtime.function_call.tool" &&
      event.toolName === "music.search" &&
      /放松|轻/.test(String(event.data?.query || "")),
    40_000
  );
  const relaxResult = await waitForToolResult(start, relaxSearch);
  await page.waitForTimeout(1000);
  state = await snapshot();
  await push(
    "rt2-low-001",
    "我想听点放松的不一定播放",
    Boolean(relaxSearch) && Boolean(relaxResult) && relaxResult?.status === "success" && /放松|轻/.test(state.musicQuery),
    `toolCall=${JSON.stringify(relaxSearch)}; toolResult=${JSON.stringify(relaxResult)}; musicQuery=${JSON.stringify(state.musicQuery)}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`
  );

  start = await eventCount();
  await sendCommand("来个周杰伦经典");
  const jayPlay = await waitForNewDiagnostic(
    start,
    (event) =>
      event.type === "realtime.function_call.tool" &&
      event.toolName === "music.play" &&
      /周杰伦/.test(String(event.data?.query || "")),
    40_000
  );
  const jayResult = await waitForToolResult(start, jayPlay);
  await page.waitForTimeout(1000);
  state = await snapshot();
  await push(
    "rt2-low-002",
    "来个周杰伦经典",
    Boolean(jayPlay) && Boolean(jayResult) && /周杰伦/.test(state.musicQuery || JSON.stringify(jayPlay?.data || {})),
    `toolCall=${JSON.stringify(jayPlay)}; toolResult=${JSON.stringify(jayResult)}; musicQuery=${JSON.stringify(state.musicQuery)}; operation=${JSON.stringify(await operation())}; music=${JSON.stringify((state.music?.text || "").slice(0, 700))}`
  );

  start = await eventCount();
  await sendCommand("播放陈奕迅十年，然后查上海天气");
  const multiMusic = await waitForNewDiagnostic(
    start,
    (event) =>
      event.type === "realtime.function_call.tool" &&
      event.toolName === "music.play" &&
      /陈奕迅|十年/.test(String(event.data?.query || "")),
    45_000
  );
  const multiWeather = await waitForNewDiagnostic(
    start,
    (event) =>
      event.type === "realtime.function_call.tool" &&
      event.toolName === "weather.set_city" &&
      (event.data?.cityCode === "shanghai" || event.data?.cityName === "上海"),
    45_000
  );
  const multiMusicResult = await waitForToolResult(start, multiMusic);
  const multiWeatherResult = await waitForToolResult(start, multiWeather);
  await page.waitForTimeout(1500);
  state = await snapshot();
  await push(
    "rt2-low-003",
    "播放陈奕迅十年，然后查上海天气",
    Boolean(multiMusic) &&
      Boolean(multiWeather) &&
      Boolean(multiMusicResult) &&
      Boolean(multiWeatherResult) &&
      /陈奕迅|十年/.test(state.musicQuery || JSON.stringify(multiMusic?.data || {})) &&
      /上海/.test(state.weather?.text || ""),
    `musicCall=${JSON.stringify(multiMusic)}; weatherCall=${JSON.stringify(multiWeather)}; musicResult=${JSON.stringify(multiMusicResult)}; weatherResult=${JSON.stringify(multiWeatherResult)}; musicQuery=${JSON.stringify(state.musicQuery)}; weather=${JSON.stringify((state.weather?.text || "").slice(0, 700))}; operation=${JSON.stringify(await operation())}`
  );

  start = await eventCount();
  await sendCommand("关闭音乐和留言板");
  const removeCalls = [];
  const started = Date.now();
  while (Date.now() - started < 35_000 && removeCalls.length < 2) {
    const diag = await diagnostics();
    const events = Array.isArray(diag.events) ? diag.events.slice(start) : [];
    for (const event of events) {
      if (
        event.type === "realtime.function_call.tool" &&
        event.toolName === "widget.remove" &&
        !removeCalls.some((item) => item.operationId === event.operationId)
      ) {
        removeCalls.push(event);
      }
    }
    if (removeCalls.length >= 2) break;
    await page.waitForTimeout(250);
  }
  const removeResults = [];
  for (const call of removeCalls) {
    removeResults.push(await waitForToolResult(start, call, 20_000));
  }
  await page.waitForFunction(
    () => {
      const text = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => element.innerText).join("\n");
      return !text.includes("音乐播放器") && !text.includes("留言板");
    },
    null,
    { timeout: 25_000 }
  ).catch(() => undefined);
  state = await snapshot();
  await push(
    "rt2-low-004",
    "关闭音乐和留言板",
    removeCalls.length >= 2 &&
      removeResults.length >= 2 &&
      removeResults.every((result) => result?.status === "success") &&
      !state.music &&
      !state.messageBoard,
    `removeCalls=${JSON.stringify(removeCalls)}; removeResults=${JSON.stringify(removeResults)}; music=${Boolean(state.music)}; messageBoard=${Boolean(state.messageBoard)}; widgets=${JSON.stringify(state.widgets.map((widget) => widget.text.slice(0, 60)))}`
  );

  await publish();
}
