import { test, expect } from "@playwright/test";

test("dashboard shows honest zero metrics and active time stops when hidden or idle", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(Date.now() - 45000) });
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`metrics-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Dashboard metrics");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByLabel("Active documents", { exact: true })).toHaveText(
    "0",
  );
  await page.getByText("View chart data", { exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Seven-day activity data" }),
  ).toBeVisible();
  await expect(
    page.getByText("No activity yet. Add an approved document to get started."),
  ).toBeVisible();
  let sent = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/activity"))
      sent++;
  });
  await page.clock.runFor(31000);
  await expect.poll(() => sent).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Refresh activity" }).click();
  await expect(
    page.getByLabel("Approximate active time", { exact: true }),
  ).not.toHaveText("0s");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(20000);
  const afterFlush = sent;
  await page.clock.runFor(20000);
  expect(sent).toBe(afterFlush);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(125000);
  const afterIdle = sent;
  await page.clock.runFor(30000);
  expect(sent).toBe(afterIdle);
  await page.screenshot({
    path: test.info().outputPath("dashboard.png"),
    fullPage: true,
  });
});
