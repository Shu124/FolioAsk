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
    await expect(page.getByText("Prepared answer · No live AI")).toBeVisible();
    await page.getByRole("button", { name: "View source · page 1" }).click();
    await expect(page.locator("mark")).toContainText(evidence);
    await expect(page.locator("mark")).toBeInViewport();
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
