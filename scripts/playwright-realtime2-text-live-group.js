async (page) => {
  const results = [];

  const waitForRealtimeConnected = async () => {
    await page.getByRole("button", { name: "连接文字 Realtime" }).click();
    await page.waitForFunction(
      () => document.body.innerText.includes("文字 Realtime 已连接") || document.body.innerText.includes("断开文字"),
      null,
      { timeout: 30_000 }
    );
  };

  const sendCommand = async (command) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
  };

  const diagnostics = async () =>
    page.evaluate(() => {
      const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
      return exported && typeof exported === "object" ? exported : { events: [], lastHarnessDiagnostics: null };
    });

  const widgetTexts = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => ({
        id: element.getAttribute("data-widget-id") || "",
        text: element.innerText
      }))
    );

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");

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
        .slice(-16)
    });
  };

  const waitForDiagnostic = async (predicate, timeoutMs = 20_000) => {
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

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
  });

  try {
    await waitForRealtimeConnected();
  } catch {
    const diag = await diagnostics();
    const bodyText = await page.evaluate(() => document.body.innerText);
    await push(
      "rt2-connect",
      "连接文字 Realtime",
      false,
      `body=${JSON.stringify(bodyText.slice(0, 600))}; diagnostics=${JSON.stringify((diag.events || []).slice(-12))}`
    );
    await page.evaluate((value) => {
      window.__xzRealtime2TextLiveResults = value;
      let pre = document.getElementById("xz-realtime2-text-live-results");
      if (!pre) {
        pre = document.createElement("pre");
        pre.id = "xz-realtime2-text-live-results";
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
    return;
  }

  await sendCommand("关闭留言板");
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll("[data-widget-id]")).some((element) => element.innerText.includes("留言板")),
    null,
    { timeout: 25_000 }
  ).catch(() => null);
  let widgets = await widgetTexts();
  const closeSelection = await waitForDiagnostic(
    (event) => event.type === "realtime.function_call.selection" || event.type === "realtime.function_call.tool",
    2_000
  );
  await push(
    "rt2-001",
    "关闭留言板",
    !widgets.some((widget) => widget.text.includes("留言板")) && Boolean(closeSelection),
    `widgets=${JSON.stringify(widgets.map((widget) => widget.text.slice(0, 40)))}; selection=${JSON.stringify(closeSelection)}`
  );

  await sendCommand("打开一个表盘时钟");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("[data-widget-id]")).some((element) => element.innerText.includes("BALMUDA")),
    null,
    { timeout: 25_000 }
  ).catch(() => null);
  widgets = await widgetTexts();
  const clockTool = await waitForDiagnostic(
    (event) =>
      (event.type === "realtime.function_call.tool" || event.type === "assistant.operation") &&
      (event.toolName === "board.add_widget" || String(event.message || "").includes("已添加小工具")),
    2_000
  );
  await push(
    "rt2-002",
    "打开一个表盘时钟",
    widgets.some((widget) => widget.text.includes("BALMUDA")) && Boolean(clockTool),
    `widgets=${JSON.stringify(widgets.map((widget) => widget.text.slice(0, 40)))}; tool=${JSON.stringify(clockTool)}`
  );

  await page.evaluate((value) => {
    window.__xzRealtime2TextLiveResults = value;
    let pre = document.getElementById("xz-realtime2-text-live-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-realtime2-text-live-results";
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
