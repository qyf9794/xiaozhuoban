const { test } = require("@playwright/test");
const run = require("./playwright-realtime-policy-recovery-probe.js");

test("realtime policy recovery and rejection probe", async ({ page }) => {
  await run(page);
});
