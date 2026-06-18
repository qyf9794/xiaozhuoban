async (page) => {
  const appUrl = globalThis.__XZ_E2E_APP_URL || "http://localhost:5174/app";
  const results = [];

  const diagnostics = async () =>
    page.evaluate(() => {
      const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
      return exported && typeof exported === "object" ? exported : { events: [], lastHarnessDiagnostics: null };
    });

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");

  const musicSnapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        return {
          id: el.getAttribute("data-widget-id") || "",
          text: el.innerText,
          inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
            ariaLabel: input.getAttribute("aria-label"),
            value: input.value
          }))
        };
      });
      const music = widgets.find((widget) => widget.text.includes("音乐播放器") || widget.text.includes("music"));
      return {
        bodyText: document.body.innerText,
        music,
        query: music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || ""
      };
    });

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
        .slice(-24)
    });
  };

  const sendCommand = async (command, waitMs = 800) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
  };

  const waitForDiagnostic = async (predicate, timeoutMs = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const diag = await diagnostics();
      const events = Array.isArray(diag.events) ? diag.events : [];
      const found = events.find(predicate);
      if (found) return found;
      await page.waitForTimeout(250);
    }
    return null;
  };

  const publish = async () => {
    await page.evaluate((value) => {
      window.__xzRealtime2MusicParseLiveResults = value;
      let pre = document.getElementById("xz-realtime2-music-parse-live-results");
      if (!pre) {
        pre = document.createElement("pre");
        pre.id = "xz-realtime2-music-parse-live-results";
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
  };

  await page.goto(appUrl);
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
  });

  await sendCommand("关闭音乐", 1000);
  await sendCommand("打开音乐", 1000);
  let state = await musicSnapshot();
  if (!state.music) {
    await push("rt2-music-setup", "打开音乐", false, `music=${JSON.stringify(state.music)}; body=${JSON.stringify(state.bodyText.slice(0, 600))}`);
    await publish();
    return;
  }

  try {
    await page.getByRole("button", { name: "连接文字 Realtime" }).click();
    await page.waitForFunction(
      () => document.body.innerText.includes("文字 Realtime 已连接") || document.body.innerText.includes("断开文字"),
      null,
      { timeout: 30_000 }
    );
  } catch {
    const diag = await diagnostics();
    const bodyText = await page.evaluate(() => document.body.innerText);
    await push(
      "rt2-music-connect",
      "连接文字 Realtime",
      false,
      `body=${JSON.stringify(bodyText.slice(0, 600))}; diagnostics=${JSON.stringify((diag.events || []).slice(-12))}`
    );
    await publish();
    return;
  }

  await sendCommand("播放陈奕迅的十年", 500);
  const toolCall = await waitForDiagnostic(
    (event) =>
      event.type === "realtime.function_call.tool" &&
      event.toolName === "music.play" &&
      event.data?.query === "陈奕迅 十年",
    35_000
  );
  const toolResult = toolCall
    ? await waitForDiagnostic(
        (event) =>
          event.type === "realtime.tool_result.send" &&
          event.operationId === toolCall.operationId &&
          event.toolName === "music.play" &&
          event.status === "success",
        20_000
      )
    : null;
  await page.waitForTimeout(1000);
  state = await musicSnapshot();
  const op = await operation();
  await push(
    "rt2-music-parse-001",
    "播放陈奕迅的十年",
    Boolean(toolCall) && Boolean(toolResult) && state.query === "陈奕迅 十年" && /Apple Music 播放中|十年/.test(state.music?.text || ""),
    `toolCall=${JSON.stringify(toolCall)}; toolResult=${JSON.stringify(toolResult)}; musicQuery=${JSON.stringify(state.query)}; operation=${JSON.stringify(op)}; music=${JSON.stringify((state.music?.text || "").slice(0, 900))}`
  );
  await publish();
}
