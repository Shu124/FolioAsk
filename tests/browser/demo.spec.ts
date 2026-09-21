import { test, expect } from "@playwright/test";

test("visitor inspects all three prepared samples without model requests", async ({
  page,
}) => {
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || url.pathname.startsWith("/api/")) {
      unexpectedRequests.push(url.href);
    }
  });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Demo navigation" });
  await navigation
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(
    page.getByText("Simulated example activity · Not your account data"),
  ).toBeVisible();
  await navigation
    .getByRole("button", { name: "Documents", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Demo documents" }),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Demo documents" }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", {
      name: "Your documents. Clear answers. Visible evidence.",
    }),
  ).toBeVisible();
  for (const [sector, evidence] of [
    ["Construction", "within 14 calendar days"],
    ["Finance", "$1.2 million"],
    ["Healthcare", "120 adult volunteers"],
  ]) {
    await page.getByRole("button", { name: sector, exact: true }).click();
    const chatView = page.getByRole("button", { name: "Chat", exact: true });
    if (await chatView.isVisible()) await chatView.click();
    await expect(page.getByText("Prepared answer · No live AI")).toBeVisible();
    await page.getByRole("button", { name: "View source · page 1" }).click();
    await expect(page.locator("mark")).toContainText(evidence);
    await expect(page.locator("mark")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "View source · page 1" }),
    ).toBeFocused();
  }
  await expect(
    page.getByRole("button", { name: "Paid plan not yet available" }),
  ).toBeDisabled();
  expect(unexpectedRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
