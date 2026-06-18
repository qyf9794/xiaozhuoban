async (page) => {
  const results = [];

  const sendCommand = async (command, waitMs = 800) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(waitMs);
  };

  const secondsFromDisplay = (value) => {
    const match = value.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  };

  const pageSnapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        const text = el.innerText;
        const noteInput = Array.from(el.querySelectorAll("textarea,input")).find(
          (input) => input.getAttribute("placeholder") === "在这里记录你的想法..."
        );
        return {
          id: el.getAttribute("data-widget-id") || "",
          text,
          noteContent: noteInput ? noteInput.value : ""
        };
      });
      const countdown = widgets.find((widget) => widget.text.includes("倒计时") && widget.text.includes("countdown"));
      const note = widgets.find((widget) => widget.text.includes("便签") && widget.text.includes("Markdown/富文本便签"));
      const todo = widgets.find((widget) => widget.text.includes("待办") && widget.text.includes("支持子任务"));
      return {
        countdown,
        note,
        todo,
        counts: {
          countdown: widgets.filter((widget) => widget.text.includes("倒计时") && widget.text.includes("countdown")).length,
          note: widgets.filter((widget) => widget.text.includes("便签") && widget.text.includes("Markdown/富文本便签")).length,
          todo: widgets.filter((widget) => widget.text.includes("待办") && widget.text.includes("支持子任务")).length
        },
        bodyText: document.body.innerText
      };
    });

  const push = async (id, command, passed, evidence, notes = "") => {
    const operation = await page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
    results.push({ id, command, passed, evidence, operation, notes });
  };

  const hasNoRealtimeError = (snapshot) => !/AUTH_REQUIRED|REALTIME_|失败：/.test(snapshot.bodyText);

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8000 });

  await sendCommand("设一个三分钟倒计时");
  let snapshot = await pageSnapshot();
  let seconds = secondsFromDisplay(snapshot.countdown?.text || "");
  await push(
    "028",
    "设一个三分钟倒计时",
    snapshot.counts.countdown === 1 && seconds !== null && seconds >= 178 && seconds <= 180 && hasNoRealtimeError(snapshot),
    `countdownCount=${snapshot.counts.countdown}; seconds=${seconds}; text=${JSON.stringify(snapshot.countdown?.text || "")}`
  );

  await sendCommand("十分钟后提醒我");
  snapshot = await pageSnapshot();
  await push(
    "029",
    "十分钟后提醒我",
    snapshot.counts.todo === 1 && (snapshot.todo?.text || "").includes("提醒我") && (snapshot.todo?.text || "").includes("截止") && hasNoRealtimeError(snapshot),
    `todoCount=${snapshot.counts.todo}; todoText=${JSON.stringify(snapshot.todo?.text || "")}`
  );

  await sendCommand("暂停现在的计时器", 500);
  const pausedSnapshot = await pageSnapshot();
  const pausedSeconds = secondsFromDisplay(pausedSnapshot.countdown?.text || "");
  await page.waitForTimeout(1200);
  const stillPausedSnapshot = await pageSnapshot();
  const stillPausedSeconds = secondsFromDisplay(stillPausedSnapshot.countdown?.text || "");
  await push(
    "030",
    "暂停现在的计时器",
    pausedSeconds !== null && pausedSeconds === stillPausedSeconds && hasNoRealtimeError(stillPausedSnapshot),
    `pausedSeconds=${pausedSeconds}; after1200ms=${stillPausedSeconds}`
  );

  await sendCommand("继续刚才那个倒计时", 500);
  const resumedSnapshot = await pageSnapshot();
  const resumedSeconds = secondsFromDisplay(resumedSnapshot.countdown?.text || "");
  await page.waitForTimeout(1300);
  const runningSnapshot = await pageSnapshot();
  const runningSeconds = secondsFromDisplay(runningSnapshot.countdown?.text || "");
  await push(
    "031",
    "继续刚才那个倒计时",
    resumedSeconds !== null && runningSeconds !== null && runningSeconds < resumedSeconds && hasNoRealtimeError(runningSnapshot),
    `resumedSeconds=${resumedSeconds}; after1300ms=${runningSeconds}`
  );

  await sendCommand("重置倒计时");
  snapshot = await pageSnapshot();
  seconds = secondsFromDisplay(snapshot.countdown?.text || "");
  await push(
    "032",
    "重置倒计时",
    seconds !== null && seconds >= 179 && seconds <= 180 && hasNoRealtimeError(snapshot),
    `seconds=${seconds}; text=${JSON.stringify(snapshot.countdown?.text || "")}`
  );

  await sendCommand("设置二十五秒计时", 500);
  snapshot = await pageSnapshot();
  seconds = secondsFromDisplay(snapshot.countdown?.text || "");
  await push(
    "033",
    "设置二十五秒计时",
    seconds !== null && seconds >= 23 && seconds <= 25 && hasNoRealtimeError(snapshot),
    `seconds=${seconds}; text=${JSON.stringify(snapshot.countdown?.text || "")}`
  );

  await sendCommand("半小时倒计时开始", 500);
  snapshot = await pageSnapshot();
  seconds = secondsFromDisplay(snapshot.countdown?.text || "");
  await push(
    "034",
    "半小时倒计时开始",
    seconds !== null && seconds >= 1798 && seconds <= 1800 && hasNoRealtimeError(snapshot),
    `seconds=${seconds}; text=${JSON.stringify(snapshot.countdown?.text || "")}`
  );

  await sendCommand("先定时一小时", 500);
  snapshot = await pageSnapshot();
  seconds = secondsFromDisplay(snapshot.countdown?.text || "");
  await push(
    "035",
    "先定时一小时",
    seconds !== null && seconds >= 3598 && seconds <= 3600 && hasNoRealtimeError(snapshot),
    `seconds=${seconds}; text=${JSON.stringify(snapshot.countdown?.text || "")}`
  );

  await sendCommand("便签记下今天继续回归测试");
  snapshot = await pageSnapshot();
  await push(
    "036",
    "便签记下今天继续回归测试",
    snapshot.counts.note === 1 && (snapshot.note?.noteContent || "").includes("今天继续回归测试") && hasNoRealtimeError(snapshot),
    `noteCount=${snapshot.counts.note}; noteContent=${JSON.stringify(snapshot.note?.noteContent || "")}`
  );

  await sendCommand("把会议纪要追加到便签");
  snapshot = await pageSnapshot();
  await push(
    "037",
    "把会议纪要追加到便签",
    snapshot.counts.note === 1 &&
      (snapshot.note?.noteContent || "").includes("今天继续回归测试") &&
      (snapshot.note?.noteContent || "").includes("会议纪要") &&
      hasNoRealtimeError(snapshot),
    `noteCount=${snapshot.counts.note}; noteContent=${JSON.stringify(snapshot.note?.noteContent || "")}`
  );

  await sendCommand("清空便签内容");
  await page.getByRole("button", { name: "确认" }).click();
  await page.waitForTimeout(600);
  snapshot = await pageSnapshot();
  await push(
    "038",
    "清空便签内容",
    snapshot.counts.note === 1 && (snapshot.note?.noteContent || "") === "" && hasNoRealtimeError(snapshot),
    `noteCount=${snapshot.counts.note}; noteContent=${JSON.stringify(snapshot.note?.noteContent || "")}`
  );

  await sendCommand("添加待办买咖啡豆");
  snapshot = await pageSnapshot();
  await push(
    "039",
    "添加待办买咖啡豆",
    snapshot.counts.todo === 1 && (snapshot.todo?.text || "").includes("买咖啡豆") && hasNoRealtimeError(snapshot),
    `todoCount=${snapshot.counts.todo}; todoText=${JSON.stringify(snapshot.todo?.text || "")}`
  );

  await page.evaluate((value) => {
    window.__xzRealPageCountdownNoteTodoResults = value;
    let pre = document.getElementById("xz-real-page-countdown-note-todo-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-countdown-note-todo-results";
      pre.style.position = "fixed";
      pre.style.left = "8px";
      pre.style.bottom = "8px";
      pre.style.maxWidth = "640px";
      pre.style.maxHeight = "260px";
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
