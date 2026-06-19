const { test } = require("@playwright/test");
const run = require("./playwright-real-page-weather-time-adjacent-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 321-340 weather and time-adjacent group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
