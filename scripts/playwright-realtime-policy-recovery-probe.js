const run = async (page) => {
  const results = [];
  const realtimeHits = [];
  const seededWidgetIds = {};

  const commandText = {
    seedMessageBoard: "打开留言板",
    forbiddenMessageSend: "我说关闭留言板时执行关闭，不是发送消息",
    nonActionAutoAlign: "整理桌面，需要确认就弹确认，不要说没有工具",
    forbiddenMusicSearch: "清空搜索结果不要影响播放中的歌曲"
  };

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const diagnostics = async () =>
    page.evaluate(() => {
      const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
      return exported && typeof exported === "object" ? exported : { events: [], lastHarnessDiagnostics: null };
    });
  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute("data-widget-id") || "",
          text: element.textContent || "",
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
        };
      });
      const find = (needle) => widgets.find((widget) => widget.text.includes(needle));
      return {
        bodyText: document.body.innerText,
        widgets,
        messageBoard: find("留言板"),
        confirmationText: document.querySelector(".voice-assistant-dock__confirm")?.textContent || ""
      };
    });

  const sendCommand = async (command, waitMs = 1_200) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click({ force: true });
    await page.waitForTimeout(waitMs);
  };

  const widgetIdFromDom = async (needle) =>
    page.locator("[data-widget-id]").evaluateAll(
      (elements, text) => {
        const target = elements.find((element) => element.textContent?.includes(text));
        return target?.getAttribute("data-widget-id") ?? undefined;
      },
      needle
    );

  const createPlan = async (input, phase, context) => {
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const definitionId = (type) => definitions.find((definition) => definition.type === type)?.definitionId ?? `wd_${type}`;
    const messageBoardId = seededWidgetIds.messageBoard ?? (await widgetIdFromDom("留言板")) ?? "planned_widget_messageBoard";
    const command = (tool, args = {}, risk = "safe") => ({
      id: `mock_${tool.replace(/\W+/g, "_")}_${Date.now()}`,
      module: "policy-recovery-probe",
      tool,
      args,
      risk,
      confidence: 0.94,
      source: "text",
      requiresHarnessValidation: true
    });

    if (input === commandText.seedMessageBoard) {
      return [command("board.add_widget", { definitionId: definitionId("messageBoard") })];
    }
    if (input === commandText.forbiddenMessageSend) {
      return [command("messageBoard.send", { widgetId: messageBoardId, text: "关闭" })];
    }
    if (input === commandText.nonActionAutoAlign) {
      return [command("assistant.runtime_diagnostics", { reason: "tool_missing" })];
    }
    if (input === commandText.forbiddenMusicSearch) {
      return [command("music.search", { query: "清空搜索结果" })];
    }
    return null;
  };

  await page.route("**/api/realtime/tool-call", async (route) => {
    const body = route.request().postDataJSON();
    const input = String(body.input ?? "");
    const phase = body.phase;
    const commands = await createPlan(input, phase, body.context ?? {});
    if (!commands) {
      await route.continue();
      return;
    }

    realtimeHits.push({ input, phase, tools: commands.map((item) => item.tool) });
    if (phase === "plan_select") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          planSelection: { steps: commands.map((item) => ({ name: item.tool, confidence: item.confidence })) }
        })
      });
      return;
    }
    if (phase === "plan_execute") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          call: null,
          plan: {
            id: `mock_policy_recovery_${Date.now()}`,
            sourceText: input,
            normalizedText: input,
            commands,
            dependencies: [],
            executionGroups: [{ id: "group_1", mode: "sequential", commandIds: commands.map((item) => item.id) }],
            confidence: 0.94,
            needsConfirmation: false,
            createdBy: "text-llm",
            requiresHarnessValidation: true
          }
        })
      });
      return;
    }
    await route.continue();
  });

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
  });

  await sendCommand(commandText.seedMessageBoard, 1_200);
  seededWidgetIds.messageBoard = await widgetIdFromDom("留言板");

  await sendCommand(commandText.forbiddenMessageSend, 1_400);
  let state = await snapshot();
  let diag = await diagnostics();
  results.push({
    id: "policy-recovery-message-board-close",
    command: commandText.forbiddenMessageSend,
    passed:
      !state.messageBoard &&
      diag.lastHarnessDiagnostics?.recovery?.reason === "forbidden_model_tools" &&
      diag.lastHarnessDiagnostics?.recovery?.recoveredTool === "widget.remove",
    operation: await operation(),
    evidence: {
      hasMessageBoard: Boolean(state.messageBoard),
      recovery: diag.lastHarnessDiagnostics?.recovery,
      realtimeHits: realtimeHits.filter((hit) => hit.input === commandText.forbiddenMessageSend)
    }
  });

  await sendCommand(commandText.nonActionAutoAlign, 1_400);
  state = await snapshot();
  diag = await diagnostics();
  results.push({
    id: "policy-recovery-auto-align-confirmation",
    command: commandText.nonActionAutoAlign,
    passed:
      /确认|待确认|整理|排列|对齐/.test(state.confirmationText || (await operation())) &&
      diag.lastHarnessDiagnostics?.recovery?.reason === "non_action_model_tools" &&
      diag.lastHarnessDiagnostics?.recovery?.recoveredTool === "board.auto_align",
    operation: await operation(),
    evidence: {
      confirmationText: state.confirmationText,
      recovery: diag.lastHarnessDiagnostics?.recovery,
      realtimeHits: realtimeHits.filter((hit) => hit.input === commandText.nonActionAutoAlign)
    }
  });

  await sendCommand("取消", 600);
  await sendCommand(commandText.forbiddenMusicSearch, 1_400);
  diag = await diagnostics();
  results.push({
    id: "policy-reject-forbidden-music-search",
    command: commandText.forbiddenMusicSearch,
    passed:
      diag.lastHarnessDiagnostics?.status === "failed" &&
      diag.lastHarnessDiagnostics?.message?.includes("Realtime 计划包含被本地策略禁止的工具") &&
      (diag.lastHarnessDiagnostics?.validationErrors ?? []).some((error) => error.code === "POLICY_FORBIDDEN_TOOL"),
    operation: await operation(),
    evidence: {
      status: diag.lastHarnessDiagnostics?.status,
      message: diag.lastHarnessDiagnostics?.message,
      validationErrors: diag.lastHarnessDiagnostics?.validationErrors,
      realtimeHits: realtimeHits.filter((hit) => hit.input === commandText.forbiddenMusicSearch)
    }
  });

  await page.evaluate((value) => {
    window.__xzRealtimePolicyRecoveryProbeResults = value;
    let pre = document.getElementById("xz-realtime-policy-recovery-probe-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-realtime-policy-recovery-probe-results";
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
    throw new Error(`Realtime policy recovery probe failed: ${failed.length}/${results.length}`);
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
