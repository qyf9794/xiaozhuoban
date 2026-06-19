const { test } = require("@playwright/test");
const run = require("./playwright-real-page-translate-calc-converter-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 401-420 translate calculator and converter group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
