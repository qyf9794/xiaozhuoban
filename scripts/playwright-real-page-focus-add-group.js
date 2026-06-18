async (page) => {
  const results = [];

  const sendCommand = async (command, waitMs = 900) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
    const confirm = page.getByRole("button", { name: /^确认$/ });
    if ((await confirm.count().catch(() => 0)) > 0 && (await confirm.first().isVisible().catch(() => false))) {
      await confirm.first().click();
      await page.waitForTimeout(500);
    }
  };

  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const rect = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-widget-id") || "",
          className: el.className,
          text: el.innerText,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0
        };
      });
      const find = (needles) => widgets.find((widget) => needles.some((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        music: find(["音乐播放器", "Apple Music", "试听"]),
        tv: find(["电视播放", "CCTV", "央视"]),
        recorder: find(["录音机", "录音中", "录音 "]),
        weather: find(["天气"]),
        todo: find(["待办"]),
        messageBoard: find(["留言板"]),
        dialClock: find(["BALMUDA", "进入夜间模式"]),
        note: find(["便签"]),
        countdown: find(["倒计时", "计时器"]),
        clipboard: find(["剪贴板"]),
        translate: find(["翻译"]),
        calculator: find(["计算器"]),
        market: find(["全球指数", "标普500", "上证指数"]),
        headline: find(["重大新闻", "新闻"]),
        worldClock: find(["世界时钟", "东京", "巴黎", "北京"])
      };
    });

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noAssistantError = async () => !/失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_/.test(await operation());
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

  const focused = (widget) => Boolean(widget?.className?.includes("is-focused"));

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });

  for (const [command, key] of [
    ["看北京和伦敦时间", "worldClock"],
    ["打开音乐", "music"],
    ["打开电视", "tv"],
    ["打开录音机", "recorder"],
    ["打开天气", "weather"],
    ["打开待办", "todo"],
    ["打开一个表盘时钟", "dialClock"],
    ["新建便签实例用于测试", "note"],
    ["打开倒计时", "countdown"],
    ["打开剪贴板", "clipboard"],
    ["打开翻译", "translate"],
    ["打开计算器", "calculator"],
    ["打开行情", "market"],
    ["打开新闻", "headline"]
  ]) {
    await ensureWidget(command, key);
  }

  await sendCommand("把世界时钟收起来");
  let state = await snapshot();
  await push(
    "086",
    "把世界时钟收起来",
    !state.worldClock && await noAssistantError(),
    `worldClock widget present=${Boolean(state.worldClock)}; widgets=${state.widgets.map((widget) => widget.id).join(",")}`
  );
  await ensureWidget("看北京和伦敦时间", "worldClock");

  for (const item of [
    ["087", "切到音乐窗口", "music"],
    ["088", "切到电视窗口", "tv"],
    ["089", "切到录音机窗口", "recorder"],
    ["090", "切到天气窗口", "weather"],
    ["091", "切到待办窗口", "todo"],
    ["092", "切到留言板窗口", "messageBoard"],
    ["093", "切到表盘时钟窗口", "dialClock"],
    ["094", "切到便签窗口", "note"]
  ]) {
    const [id, command, key] = item;
    await sendCommand(command);
    state = await snapshot();
    await push(
      id,
      command,
      Boolean(state[key]) && focused(state[key]) && await noAssistantError(),
      `${key} present=${Boolean(state[key])}; focused=${focused(state[key])}; class=${state[key]?.className || ""}`
    );
  }

  const beforeCounts = await snapshot();
  const countByKey = (snap, key) => (snap[key] ? snap.widgets.filter((widget) => widget.text === snap[key].text).length : 0);

  for (const item of [
    ["095", "再打开一个音乐", "music"],
    ["096", "再打开一个电视", "tv"],
    ["097", "再打开一个天气", "weather"],
    ["098", "再打开一个倒计时", "countdown"],
    ["099", "再打开一个待办", "todo"],
    ["100", "再打开一个剪贴板", "clipboard"],
    ["101", "再打开一个翻译", "translate"],
    ["102", "再打开一个计算器", "calculator"],
    ["103", "再打开一个行情", "market"],
    ["104", "再打开一个新闻", "headline"],
    ["105", "再打开一个世界时钟", "worldClock"],
    ["106", "再打开一个录音机", "recorder"]
  ]) {
    const [id, command, key] = item;
    const previousCount = countByKey(beforeCounts, key);
    await sendCommand(command);
    state = await snapshot();
    await push(
      id,
      command,
      Boolean(state[key]) && focused(state[key]) && await noAssistantError(),
      `${key} present=${Boolean(state[key])}; focused=${focused(state[key])}; previousTextCount=${previousCount}; class=${state[key]?.className || ""}`
    );
  }

  await page.evaluate((value) => {
    window.__xzRealPageFocusAddResults = value;
    let pre = document.getElementById("xz-real-page-focus-add-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-focus-add-results";
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
