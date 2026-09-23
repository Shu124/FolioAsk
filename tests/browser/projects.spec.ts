import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";

test("an inaccessible project link cannot skip setup and existing project owners keep access", async ({
  page,
}) => {
  await page.goto("/app?workspace=missing");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`legacy-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make this workspace yours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeHidden();
  // Arrange a legacy account through the existing public project API, without
  // marking the new profile flow complete. Such accounts must retain access.
  const project = await (
    await page.request.post("/api/workspaces", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name: "Existing research" },
    })
  ).json();
  await page.goto(`/app?workspace=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "Existing research", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make this workspace yours" }),
  ).toHaveCount(0);
});

test("profile setup resumes saved preferences and project search is keyboard accessible", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`setup-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Avery");
  await page.getByLabel("Industry", { exact: true }).selectOption("Healthcare");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Start with source-backed research", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Start with source-backed research", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Avery",
  );
  await expect(page.getByLabel("Industry", { exact: true })).toHaveValue(
    "Healthcare",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to project" }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Alpha research");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alpha research", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Beta research");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Beta research", exact: true }),
  ).toBeVisible();
  await page.locator(".project-switcher-trigger").click();
  await page.getByLabel("Find project").fill("alpha");
  await expect(page.locator(".project-options button")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Alpha research", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".project-switcher-trigger")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("project-switcher.png"),
    fullPage: true,
  });
});

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
  await completeOnboarding(page);
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
