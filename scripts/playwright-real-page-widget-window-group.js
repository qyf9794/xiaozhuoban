async (page) => {
  const results = [];

  const getWidgets = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const rect = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-widget-id") || "",
          text: el.innerText,
          className: el.className,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0
        };
      })
    );
  const findWidget = (widgets, matcher) => widgets.find((widget) => matcher(widget.text));
  const sendCommand = async (command) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(800);
  };
  const push = async (id, command, passed, evidence, notes = "") => {
    const operation = await page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
    results.push({ id, command, passed, evidence, operation, notes });
  };
  const toolForInput = (input, context) => {
    const widgets = Array.isArray(context.widgets) ? context.widgets : [];
    const byType = (type) => widgets.find((widget) => widget.type === type);
    const definitions = Array.isArray(context.availableDefinitions) ? context.availableDefinitions : [];
    const defByType = (type) => definitions.find((definition) => definition.type === type);
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const tv = byType("tv");
    const music = byType("music");
    const weather = byType("weather");
    const messageBoard = byType("messageBoard");
    if (input.includes("拖到右上角")) {
      return { tool: "widget.move", args: { widgetId: tv?.widgetId, x: Math.max(340, viewport.width - 360), y: 0 } };
    }
    if (input.includes("调大")) {
      return { tool: "widget.resize", args: { widgetId: tv?.widgetId, w: 520, h: 320 } };
    }
    if (input.includes("放最前")) {
      return { tool: "widget.bring_to_front", args: { widgetId: music?.widgetId } };
    }
    if (input.includes("聚焦天气")) {
      return { tool: "widget.focus", args: { widgetId: weather?.widgetId } };
    }
    if (input.includes("全屏看电视")) {
      return { tool: "widget.fullscreen_focus", args: { widgetId: tv?.widgetId } };
    }
    if (input.includes("关闭留言板")) {
      return { tool: "widget.remove", args: { widgetId: messageBoard?.widgetId } };
    }
    if (input.includes("表盘时钟")) {
      const dialClock = byType("dialClock");
      if (dialClock) return { tool: "widget.focus", args: { widgetId: dialClock.widgetId } };
      return { tool: "board.add_widget", args: { definitionId: defByType("dialClock")?.definitionId } };
    }
    if (input.includes("便签实例")) {
      return { tool: "board.add_widget", args: { definitionId: defByType("note")?.definitionId } };
    }
    return { tool: "widget.focus", args: { widgetId: weather?.widgetId } };
  };
  const mockPlan = async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const input = String(body.input ?? "");
    const phase = body.phase;
    const context = body.context ?? {};
    const selected = toolForInput(input, context);
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

  for (const setupCommand of ["打开电视", "打开音乐", "打开天气"]) {
    await sendCommand(setupCommand);
  }

  let widgets = await getWidgets();
  const tvBefore = findWidget(widgets, (text) => text.includes("电视播放"));
  const musicBefore = findWidget(widgets, (text) => text.includes("音乐播放器"));
  const weatherBefore = findWidget(widgets, (text) => text.includes("天气"));

  await sendCommand("把电视拖到右上角");
  widgets = await getWidgets();
  const tvMoved = findWidget(widgets, (text) => text.includes("电视播放"));
  await push(
    "012",
    "把电视拖到右上角",
    Boolean(tvBefore && tvMoved && tvMoved.rect.x > tvBefore.rect.x + 80 && tvMoved.rect.y < tvBefore.rect.y),
    `tv rect moved from ${JSON.stringify(tvBefore?.rect)} to ${JSON.stringify(tvMoved?.rect)}`
  );

  await sendCommand("把电视面板调大一点");
  widgets = await getWidgets();
  const tvResized = findWidget(widgets, (text) => text.includes("电视播放"));
  await push(
    "013",
    "把电视面板调大一点",
    Boolean(tvMoved && tvResized && tvResized.rect.w > tvMoved.rect.w + 100),
    `tv width changed from ${tvMoved?.rect.w} to ${tvResized?.rect.w}`
  );

  await sendCommand("把音乐播放器放最前");
  widgets = await getWidgets();
  const musicFront = findWidget(widgets, (text) => text.includes("音乐播放器"));
  const maxZ = Math.max(...widgets.map((widget) => widget.zIndex));
  await push(
    "014",
    "把音乐播放器放最前",
    Boolean(musicBefore && musicFront && musicFront.zIndex === maxZ && musicFront.zIndex > musicBefore.zIndex),
    `music zIndex changed from ${musicBefore?.zIndex} to ${musicFront?.zIndex}`
  );

  await sendCommand("聚焦天气卡片");
  widgets = await getWidgets();
  const weatherFocused = findWidget(widgets, (text) => text.includes("天气"));
  await push(
    "015",
    "聚焦天气卡片",
    Boolean(weatherBefore && weatherFocused && weatherFocused.className.includes("is-focused")),
    `weather className=${weatherFocused?.className}`
  );

  await sendCommand("全屏看电视");
  await page.waitForTimeout(300);
  const fullscreenWidgetId = await page.evaluate(() => document.fullscreenElement?.getAttribute("data-widget-id") || "");
  widgets = await getWidgets();
  const tvFullscreen = findWidget(widgets, (text) => text.includes("电视播放"));
  await push(
    "016",
    "全屏看电视",
    Boolean(tvFullscreen && (fullscreenWidgetId === tvFullscreen.id || tvFullscreen.className.includes("is-focused"))),
    `fullscreenWidgetId=${fullscreenWidgetId || "none"} tvClass=${tvFullscreen?.className}`
  );
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => undefined);
  await page.waitForTimeout(300);

  await sendCommand("关闭留言板");
  widgets = await getWidgets();
  const messageBoardGone = !widgets.some((widget) => widget.text.includes("留言板"));
  await push("017", "关闭留言板", messageBoardGone, "message board widget absent from [data-widget-id] nodes");

  await sendCommand("打开一个表盘时钟");
  widgets = await getWidgets();
  const dialClock = findWidget(widgets, (text) => text.includes("BALMUDA") || text.includes("进入夜间模式"));
  await push("018", "打开一个表盘时钟", Boolean(dialClock), `dial clock widget id=${dialClock?.id || "missing"}`);

  await sendCommand("新建便签实例用于测试");
  widgets = await getWidgets();
  const note = findWidget(widgets, (text) => text.includes("便签"));
  await push("019", "新建便签实例用于测试", Boolean(note), `note widget id=${note?.id || "missing"}`);

  const learningPreview = page.getByText("确认后相同说法将优先本地命中");
  if (await learningPreview.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "取消" }).click();
    await page.waitForTimeout(300);
  }

  await page.evaluate((value) => {
    window.__xzRealPageWidgetWindowResults = value;
    let pre = document.getElementById("xz-real-page-widget-window-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-widget-window-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "560px";
      pre.style.maxHeight = "240px";
      pre.style.overflow = "auto";
      pre.style.zIndex = "99999";
      pre.style.background = "rgba(255,255,255,0.92)";
      pre.style.color = "#111827";
      pre.style.fontSize = "11px";
      pre.style.padding = "8px";
      document.body.appendChild(pre);
    }
    pre.textContent = JSON.stringify(value, null, 2);
  }, results);
}
