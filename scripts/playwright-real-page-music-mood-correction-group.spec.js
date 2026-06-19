const { test } = require("@playwright/test");
const run = require("./playwright-real-page-music-mood-correction-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 281-300 music mood and correction group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
