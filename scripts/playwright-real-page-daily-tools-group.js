async (page) => {
  const results = [];

  const sendCommand = async (command, waitMs = 800) => {
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
        const text = el.innerText;
        const inputs = Array.from(el.querySelectorAll("textarea,input")).map((input) => ({
          placeholder: input.getAttribute("placeholder"),
          value: input.value
        }));
        return {
          id: el.getAttribute("data-widget-id") || "",
          text,
          inputs
        };
      });
      const find = (needle) => widgets.find((widget) => widget.text.includes(needle));
      return {
        bodyText: document.body.innerText,
        todo: find("支持子任务的待办清单"),
        clipboard: find("剪贴板历史"),
        translate: find("快速翻译"),
        calculator: find("calculator"),
        converter: find("单位换算"),
        worldClock: find("世界时钟")
      };
    });

  const noRealtimeError = (state) => !/AUTH_REQUIRED|REALTIME_|失败：/.test(state.bodyText);

  const operation = async () => page.getByTestId("voice-assistant-operation").innerText().catch(() => "");

  const push = async (id, command, passed, evidence) => {
    results.push({ id, command, passed, operation: await operation(), evidence });
  };

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8000 });

  await sendCommand("添加待办买牛奶");
  let state = await snapshot();
  if (!(state.todo?.text || "").includes("买牛奶")) {
    await push("setup", "添加待办买牛奶", false, `todoText=${JSON.stringify(state.todo?.text || "")}`);
  }

  await sendCommand("明早九点提醒我提交报告");
  state = await snapshot();
  await push(
    "040",
    "明早九点提醒我提交报告",
    (state.todo?.text || "").includes("提交报告") && (state.todo?.text || "").includes("截止 2026/6/19 09:00:00") && noRealtimeError(state),
    `todoText=${JSON.stringify(state.todo?.text || "")}`
  );

  await sendCommand("把买牛奶这项勾掉");
  state = await snapshot();
  await push(
    "041",
    "把买牛奶这项勾掉",
    !(state.todo?.text || "").includes("买牛奶") && (state.todo?.text || "").includes("提交报告") && noRealtimeError(state),
    `todoText=${JSON.stringify(state.todo?.text || "")}`
  );

  await sendCommand("复制演示账号到剪贴板");
  state = await snapshot();
  await push(
    "042",
    "复制演示账号到剪贴板",
    (state.clipboard?.text || "").includes("演示账号") && noRealtimeError(state),
    `clipboardText=${JSON.stringify(state.clipboard?.text || "")}`
  );

  await sendCommand("固定保存项目口令 demo");
  state = await snapshot();
  await push(
    "043",
    "固定保存项目口令 demo",
    (state.clipboard?.text || "").includes("项目口令 demo") && (state.clipboard?.text || "").includes("演示账号") && noRealtimeError(state),
    `clipboardText=${JSON.stringify(state.clipboard?.text || "")}`
  );

  await sendCommand("清理剪贴板普通记录");
  state = await snapshot();
  await push(
    "044",
    "清理剪贴板普通记录",
    (state.clipboard?.text || "").includes("项目口令 demo") && !(state.clipboard?.text || "").includes("演示账号") && noRealtimeError(state),
    `clipboardText=${JSON.stringify(state.clipboard?.text || "")}`
  );

  await sendCommand("把 hello world 翻译成中文");
  state = await snapshot();
  const translateSource = state.translate?.inputs.find((input) => input.placeholder === "输入要翻译的文本...")?.value || "";
  await push(
    "045",
    "把 hello world 翻译成中文",
    translateSource === "hello world" && (state.translate?.text || "").includes("中文") && noRealtimeError(state),
    `source=${JSON.stringify(translateSource)}; translateText=${JSON.stringify(state.translate?.text || "")}`
  );

  await sendCommand("你好翻译成英文");
  state = await snapshot();
  const translateChineseSource = state.translate?.inputs.find((input) => input.placeholder === "输入要翻译的文本...")?.value || "";
  await push(
    "046",
    "你好翻译成英文",
    translateChineseSource === "你好" && (state.translate?.text || "").includes("英文") && noRealtimeError(state),
    `source=${JSON.stringify(translateChineseSource)}; translateText=${JSON.stringify(state.translate?.text || "")}`
  );

  await sendCommand("十二加三十算一下");
  state = await snapshot();
  await push(
    "047",
    "十二加三十算一下",
    /\n42\n/.test(state.calculator?.text || "") && noRealtimeError(state),
    `calculatorText=${JSON.stringify(state.calculator?.text || "")}`
  );

  await sendCommand("2斤是多少克");
  state = await snapshot();
  await push(
    "048",
    "2斤是多少克",
    (state.converter?.text || "").includes("1000 g") && noRealtimeError(state),
    `converterText=${JSON.stringify(state.converter?.text || "")}`
  );

  await sendCommand("十二米换算公里");
  state = await snapshot();
  await push(
    "049",
    "十二米换算公里",
    (state.converter?.text || "").includes("0.012 km") && noRealtimeError(state),
    `converterText=${JSON.stringify(state.converter?.text || "")}`
  );

  await sendCommand("两公斤换算成克");
  state = await snapshot();
  await push(
    "050",
    "两公斤换算成克",
    (state.converter?.text || "").includes("2000 g") && noRealtimeError(state),
    `converterText=${JSON.stringify(state.converter?.text || "")}`
  );

  await sendCommand("世界时钟显示北京伦敦纽约");
  state = await snapshot();
  await push(
    "051",
    "世界时钟显示北京伦敦纽约",
    ["北京", "伦敦", "纽约"].every((city) => (state.worldClock?.text || "").includes(city)) && noRealtimeError(state),
    `worldClockText=${JSON.stringify(state.worldClock?.text || "")}`
  );

  await page.evaluate((value) => {
    window.__xzRealPageDailyToolsResults = value;
    let pre = document.getElementById("xz-real-page-daily-tools-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-daily-tools-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "680px";
      pre.style.maxHeight = "280px";
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
