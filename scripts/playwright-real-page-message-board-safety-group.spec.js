const { test } = require("@playwright/test");
const run = require("./playwright-real-page-message-board-safety-group.js");

test("real-page catalog commands 461-480 message board safety group", async ({ page }) => {
  await run(page);
});
