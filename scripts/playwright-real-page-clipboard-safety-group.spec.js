const { test } = require("@playwright/test");
const run = require("./playwright-real-page-clipboard-safety-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 381-400 clipboard and safety text group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
