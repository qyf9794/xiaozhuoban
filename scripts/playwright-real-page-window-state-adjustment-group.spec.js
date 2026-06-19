const { test } = require("@playwright/test");
const run = require("./playwright-real-page-window-state-adjustment-group.js");

test("real-page catalog commands 541-560 window state adjustment group", async ({ page }) => {
  await run(page);
});
