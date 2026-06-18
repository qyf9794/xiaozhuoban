async (page) => {
  const results = [];

  const push = async (id, command, passed, evidence, notes = "") => {
    const operation = await page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
    results.push({ id, command, passed, evidence, operation, notes });
  };
  const bodyText = () => page.locator("body").innerText();
  const sendCommand = async (command) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(700);
  };
  const closeDialogIfPresent = async () => {
    const overlay = page.locator(".modal-overlay").first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 4, y: 4 } }).catch(() => undefined);
      await page.waitForTimeout(150);
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(150);
  };
  const mockPlan = async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const input = String(body.input ?? "");
    const phase = body.phase;
    const context = body.context ?? {};
    const availableBoards = Array.isArray(context.availableBoards) ? context.availableBoards : [];
    const activeBoardId = context.boardId;
    let tool = "board.create";
    let args = {};

    if (input.includes("工作台桌板") && /(新建|新开|创建|新增)/.test(input)) {
      tool = "board.create";
      args = { name: "工作台桌板" };
    } else if (input.includes("学习桌板")) {
      tool = "board.create";
      args = { name: "学习桌板" };
    } else if (input.includes("夜间工作")) {
      tool = "board.rename";
      args = { boardId: activeBoardId, name: "夜间工作" };
    } else if (input.includes("切回工作台桌板")) {
      const board = availableBoards.find((item) => String(item.name ?? "").includes("工作台桌板"));
      tool = "board.switch";
      args = { boardId: board?.boardId ?? activeBoardId };
    }

    if (phase === "plan_select") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ call: null, planSelection: { steps: [{ name: tool, confidence: 0.94 }] } })
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
                tool,
                args,
                risk: "safe",
                confidence: 0.94,
                source: "text",
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

  await page.route("**/api/realtime/tool-call", mockPlan);
  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8000 });

  await sendCommand("把左边栏先藏起来");
  await push("001", "把左边栏先藏起来", await page.getByRole("button", { name: "显示侧栏" }).isVisible(), "toolbar button changed to 显示侧栏");

  await sendCommand("侧边栏重新显示");
  await push("002", "侧边栏重新显示", await page.getByText("桌板").first().isVisible(), "sidebar title visible again");

  await sendCommand("进入沉浸全屏");
  const enterFullscreenText = await bodyText();
  await push("003", "进入沉浸全屏", enterFullscreenText.includes("已进入全屏"), "assistant reported 已进入全屏");

  await sendCommand("退出全屏回普通窗口");
  const exitFullscreenText = await bodyText();
  await push("004", "退出全屏回普通窗口", exitFullscreenText.includes("已退出全屏"), "assistant reported 已退出全屏");

  await sendCommand("打开小桌板设置");
  const settingsText = await bodyText();
  await push("005", "打开小桌板设置", settingsText.includes("设置") && settingsText.includes("修改用户名"), "settings/menu content visible");
  await closeDialogIfPresent();

  await sendCommand("打开搜索命令面板");
  const paletteText = await bodyText();
  await push("006", "打开搜索命令面板", paletteText.includes("搜索") && paletteText.includes("添加 Widget"), "command/search palette surface visible");
  await closeDialogIfPresent();

  await sendCommand("我要新建一个 AI 小工具");
  const aiText = await bodyText();
  await push("007", "我要新建一个 AI 小工具", /AI|生成|小工具/.test(aiText), "AI widget dialog visible");
  await closeDialogIfPresent();

  await sendCommand("整理一下桌面所有小工具");
  const confirmVisible = await page.getByRole("button", { name: "确认" }).isVisible().catch(() => false);
  if (confirmVisible) {
    await page.getByRole("button", { name: "确认" }).click();
    await page.waitForTimeout(700);
  }
  const alignText = await bodyText();
  await push("008", "整理一下桌面所有小工具", confirmVisible && alignText.includes("已整理桌面小工具"), "confirmation shown and confirmed");

  await sendCommand("新开一个工作台桌板");
  await sendCommand("新开一个学习桌板");
  const createText = await bodyText();
  await push("009", "新开一个学习桌板", createText.includes("学习桌板"), "Realtime mock plan created 学习桌板 board");

  await sendCommand("把当前桌板改名叫夜间工作");
  const renameText = await bodyText();
  await push("010", "把当前桌板改名叫夜间工作", renameText.includes("夜间工作"), "active board renamed to 夜间工作");

  await sendCommand("切回工作台桌板");
  const switchText = await bodyText();
  await push("011", "切回工作台桌板", switchText.includes("工作台桌板"), "Realtime mock plan switched to seeded 工作台桌板");

  const learningPreview = page.getByText("确认后相同说法将优先本地命中");
  if (await learningPreview.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "取消" }).click();
    await page.waitForTimeout(300);
  }

  const existing = await page.locator("#xz-real-page-group-results").count();
  if (existing === 0) {
    await page.evaluate(() => {
      const pre = document.createElement("pre");
      pre.id = "xz-real-page-group-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "520px";
      pre.style.maxHeight = "220px";
      pre.style.overflow = "auto";
      pre.style.zIndex = "99999";
      pre.style.background = "rgba(255,255,255,0.92)";
      pre.style.color = "#111827";
      pre.style.fontSize = "11px";
      pre.style.padding = "8px";
      document.body.appendChild(pre);
    });
  }
  await page.evaluate((value) => {
    window.__xzRealPageGroupResults = value;
    const pre = document.getElementById("xz-real-page-group-results");
    if (pre) pre.textContent = JSON.stringify(value, null, 2);
  }, results);
}
