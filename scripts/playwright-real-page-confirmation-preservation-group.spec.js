const { test } = require("@playwright/test");
const run = require("./playwright-real-page-confirmation-preservation-group.js");

test("real-page catalog commands 521-540 confirmation and preservation group", async ({ page }) => {
  await run(page);
});
