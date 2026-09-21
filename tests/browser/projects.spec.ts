import { test, expect } from "@playwright/test";

test("first project onboarding leads to persistent sidebar navigation", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`project-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Name your first project" }),
  ).toBeVisible();
  await page.getByLabel("Project name", { exact: true }).fill("Elm Street");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(page.getByLabel("Choose PDF")).toBeVisible();
  await nav.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Your question")).toBeVisible();
  await nav.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recent activity" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Elm Street", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("project-dashboard.png"),
    fullPage: true,
  });
});
