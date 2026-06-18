async (page) => {
  const results = [];

  const cases = [
    { id: "020", command: "查北京今天冷不冷", label: "北京" },
    { id: "021", command: "上海天气给我看一下", label: "上海" },
    { id: "022", command: "看看洛杉矶天气", label: "洛杉矶" },
    { id: "023", command: "杭州现在什么天气", label: "杭州" },
    { id: "024", command: "帮我换到武汉天气", label: "武汉" },
    { id: "025", command: "波士顿天气", label: "波士顿" },
    { id: "026", command: "广州天气怎么样", label: "广州" },
    { id: "027", command: "成都天气打开看看", label: "成都" }
  ];

  const sendCommand = async (command) => {
    await page.getByTestId("voice-assistant-command-input").fill(command);
    await page.getByTestId("voice-assistant-send").click();
    await page.waitForTimeout(900);
  };
  const weatherSnapshot = async () =>
    page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
        const el = element;
        return {
          id: el.getAttribute("data-widget-id") || "",
          text: el.innerText,
          className: el.className
        };
      });
      const weather = widgets.find((widget) => widget.text.includes("天气"));
      return {
        weather,
        weatherCount: widgets.filter((widget) => widget.text.includes("天气")).length
      };
    });
  const push = async (item, passed, evidence, notes = "") => {
    const operation = await page.getByTestId("voice-assistant-operation").innerText().catch(() => "");
    results.push({ id: item.id, command: item.command, passed, evidence, operation, notes });
  };

  await page.goto("http://localhost:5174/app");
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 8000 });

  for (const item of cases) {
    await sendCommand(item.command);
    const snapshot = await weatherSnapshot();
    const text = snapshot.weather?.text || "";
    const passed =
      snapshot.weatherCount === 1 &&
      text.includes(item.label) &&
      !/AUTH_REQUIRED|REALTIME_|失败：/.test(await page.locator("body").innerText());
    await push(
      item,
      passed,
      `weatherCount=${snapshot.weatherCount}; expectedLabel=${item.label}; widgetText=${JSON.stringify(text.slice(0, 120))}`
    );
  }

  await page.evaluate((value) => {
    window.__xzRealPageWeatherResults = value;
    let pre = document.getElementById("xz-real-page-weather-results");
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "xz-real-page-weather-results";
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
