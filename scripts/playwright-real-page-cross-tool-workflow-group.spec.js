const { test } = require("@playwright/test");
const run = require("./playwright-real-page-cross-tool-workflow-group.js");

test("real-page catalog commands 481-500 cross-tool workflow group", async ({ page }) => {
  await run(page);
});
