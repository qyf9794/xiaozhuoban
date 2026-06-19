const { test } = require("@playwright/test");
const run = require("./playwright-real-page-note-todo-reminder-group.js");

test.use({ channel: "chrome", viewport: { width: 1440, height: 1000 } });

test("real-page catalog commands 361-380 note todo and reminder group", async ({ page }) => {
  test.setTimeout(120_000);
  await run(page);
});
