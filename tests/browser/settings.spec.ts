import { test, expect } from "@playwright/test";

test("settings theme persists across app, landing and system appearance", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`settings-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Settings project");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const appearance = page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Appearance", exact: true });
  await appearance.click();
  await expect(appearance).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Display name", { exact: true })).toBeHidden();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".paper")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await appearance.click();
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await page.screenshot({
    path: test.info().outputPath("settings-dark.png"),
    fullPage: true,
  });
});

test("account and project settings save, show usage, and require password reauthentication", async ({
  page,
}) => {
  const email = `account-${crypto.randomUUID()}@example.test`;
  await page.goto("/app");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Before rename");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Researcher");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Account settings status" }),
  ).toHaveText("Display name saved.");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await sections.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByLabel("Rename project", { exact: true })
    .fill("Renamed project");
  await page
    .getByRole("button", { name: "Save project name", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Renamed project", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#settings-usage")).toContainText(
    "3 of 3 lifetime uploads remaining",
  );
  await expect(page.locator("#settings-usage")).toContainText(
    "20 of 20 lifetime answers remaining",
  );
  await page.reload();
  await sections.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Researcher",
  );
  await expect(page.getByLabel("Rename project", { exact: true })).toHaveValue(
    "Renamed project",
  );
  await sections.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(page.locator("#settings-usage")).toBeVisible();
  await expect(
    sections.getByRole("button", { name: "Usage", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await sections.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill("incorrect");
  await page
    .getByLabel("New password", { exact: true })
    .fill("updated-test-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("updated-test-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Account settings status" }),
  ).toContainText("could not be changed");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("local-test-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("updated-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed project", exact: true }),
  ).toBeVisible();
});
