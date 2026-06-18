async (page) => {
  const results = [];

  const sendCommand = async (command, waitMs = 1200) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
    const confirm = page.getByRole("button", { name: /^确认$/ });
    if ((await confirm.count().catch(() => 0)) > 0 && (await confirm.first().isVisible().catch(() => false))) {
      await confirm.first().click();
      await page.waitForTimeout(600);
    }
  };

  const snapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const text = el.innerText;
        const inputs = Array.from(el.querySelectorAll("textarea,input")).map((input) => ({
          ariaLabel: input.getAttribute("aria-label"),
          placeholder: input.getAttribute("placeholder"),
          value: input.value
        }));
        return {
          id: el.getAttribute("data-widget-id") || "",
          text,
          inputs
        };
      });
      const find = (needles) => widgets.find((widget) => needles.every((needle) => widget.text.includes(needle)));
      return {
        bodyText: document.body.innerText,
        widgets,
        worldClock: find(["世界时钟"]),
        headline: find(["重大新闻"]),
        market: find(["全球指数"]),
        dialClock: find(["BALMUDA"]),
        messageBoard: find(["留言板"]),
        music: find(["音乐"])
      };
    });

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
  const noRealtimeError = (state) => !/AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|失败：/.test(state.bodyText);

  const push = async (id, command, passed, evidence) => {
    results.push({ id, command, passed, operation: await operation(), evidence });
  };

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8_000 });

  await sendCommand("看东京和巴黎时间");
  let state = await snapshot();
  await push(
    "052",
    "看东京和巴黎时间",
    ["东京", "巴黎"].every((city) => (state.worldClock?.text || "").includes(city)) && noRealtimeError(state),
    `worldClock=${JSON.stringify(state.worldClock?.text || "")}`
  );

  await sendCommand("刷新重大新闻");
  state = await snapshot();
  await push(
    "053",
    "刷新重大新闻",
    Boolean(state.headline?.text) && noRealtimeError(state),
    `headline=${JSON.stringify(state.headline?.text || "")}`
  );

  await sendCommand("今天有什么头条新闻");
  state = await snapshot();
  await push(
    "054",
    "今天有什么头条新闻",
    Boolean(state.headline?.text) && noRealtimeError(state),
    `headline=${JSON.stringify(state.headline?.text || "")}`
  );

  await sendCommand("看美股三大指数");
  state = await snapshot();
  await push(
    "055",
    "看美股三大指数",
    ["标普500", "纳斯达克", "道琼斯"].every((name) => (state.market?.text || "").includes(name)) && noRealtimeError(state),
    `market=${JSON.stringify(state.market?.text || "")}`
  );

  await sendCommand("打开恒生和上证行情");
  state = await snapshot();
  await push(
    "056",
    "打开恒生和上证行情",
    ["恒生指数", "上证指数"].every((name) => (state.market?.text || "").includes(name)) && noRealtimeError(state),
    `market=${JSON.stringify(state.market?.text || "")}`
  );

  await sendCommand("表盘开启夜间模式");
  state = await snapshot();
  await push(
    "057",
    "表盘开启夜间模式",
    Boolean(state.dialClock?.text) && /夜间|Night|关闭时钟夜间模式|睡眠/.test(state.bodyText) && noRealtimeError(state),
    `dialClock=${JSON.stringify(state.dialClock?.text || "")}; body=${JSON.stringify(state.bodyText.slice(0, 800))}`
  );

  await sendCommand("关闭时钟夜间模式");
  state = await snapshot();
  await push(
    "058",
    "关闭时钟夜间模式",
    Boolean(state.dialClock?.text) && noRealtimeError(state),
    `dialClock=${JSON.stringify(state.dialClock?.text || "")}; operation=${await operation()}`
  );

  await sendCommand("留言板发一句我在测试");
  state = await snapshot();
  await push(
    "059",
    "留言板发一句我在测试",
    (state.messageBoard?.text || "").includes("我在测试") && noRealtimeError(state),
    `messageBoard=${JSON.stringify(state.messageBoard?.text || "")}`
  );

  await sendCommand("搜一点轻松的音乐", 2500);
  state = await snapshot();
  const musicQuery = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
  await push(
    "060",
    "搜一点轻松的音乐",
    musicQuery === "轻松" && noRealtimeError(state),
    `musicQuery=${JSON.stringify(musicQuery)}; music=${JSON.stringify((state.music?.text || "").slice(0, 900))}`
  );

  await sendCommand("播放王菲的红豆", 3000);
  state = await snapshot();
  const wangfeiQuery = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
  await push(
    "061",
    "播放王菲的红豆",
    wangfeiQuery === "王菲 红豆" && noRealtimeError(state),
    `musicQuery=${JSON.stringify(wangfeiQuery)}; operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 900))}`
  );

  await sendCommand("来一首陈奕迅十年", 3000);
  state = await snapshot();
  const easonQuery = state.music?.inputs.find((input) => input.ariaLabel === "音乐搜索")?.value || "";
  await push(
    "062",
    "来一首陈奕迅十年",
    easonQuery === "陈奕迅 十年" && noRealtimeError(state),
    `musicQuery=${JSON.stringify(easonQuery)}; operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 900))}`
  );

  await sendCommand("音乐先暂停");
  state = await snapshot();
  await push(
    "063",
    "音乐先暂停",
    /已暂停音乐|完成/.test(await operation()) && noRealtimeError(state),
    `operation=${await operation()}; music=${JSON.stringify((state.music?.text || "").slice(0, 900))}`
  );

  await page.evaluate((value) => {
    window.__xzRealPageInfoMediaResults = value;
    let pre = document.getElementById("xz-real-page-info-media-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-info-media-results";
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
