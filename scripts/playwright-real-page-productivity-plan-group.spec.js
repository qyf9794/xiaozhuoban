const { test } = require("@playwright/test");
const run = require("./playwright-real-page-productivity-plan-group.js");

test("real-page catalog commands 561-580 productivity plan group", async ({ page }) => {
  await run(page);
});
