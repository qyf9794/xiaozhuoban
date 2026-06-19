const { chromium, test } = require("@playwright/test");
const run = require("./playwright-real-page-news-market-group");

test("700 catalog real-page group 421-440 news and market commands", async () => {
  test.setTimeout(90_000);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await run(page);
  } finally {
    await browser.close();
  }
});
