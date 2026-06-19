const { test } = require("@playwright/test");
const run = require("./playwright-real-page-correction-negation-group.js");

test("real-page catalog commands 501-520 correction and negation group", async ({ page }) => {
  await run(page);
});
