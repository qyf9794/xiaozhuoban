const { test } = require("@playwright/test");
const run = require("./playwright-real-page-time-countdown-clock-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 341-360 time countdown and clock group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
