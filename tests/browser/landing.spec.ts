import { test, expect } from "@playwright/test";

test("landing explains the current pilot and its calls to action work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "From a file to a source you can check.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Content expires after 30 days of inactivity"),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  await nav.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page.locator("#how-it-works")).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("landing-light.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    localStorage.setItem("folioask-theme", "dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await nav.getByRole("link", { name: "Get started", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Create your FolioAsk account" }),
  ).toBeVisible();
});
