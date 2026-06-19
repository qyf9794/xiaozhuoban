const { test } = require("@playwright/test");
const run = require("./playwright-real-page-tv-media-control-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 301-320 TV and media control group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
