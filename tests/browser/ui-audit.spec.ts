import { openProjectView } from "../fixtures/navigation";
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "../fixtures/onboarding";

async function createWorkspace(page: Page) {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`picker-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name", { exact: true }).fill("NorthMark");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".project-switcher-trigger")).toBeVisible();
}

test("project picker stays bounded, searchable and keyboard accessible across screen sizes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await createWorkspace(page);
  for (const name of [
    "A long construction project name with multiple words",
    "Finance",
    "Healthcare",
    "Test",
  ]) {
    const response = await page.request.post("/api/workspaces", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name },
    });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  const trigger = page.locator(".project-switcher-trigger");
  const panel = page.getByRole("dialog", { name: "Choose project" });
  const search = page.getByLabel("Find project");
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 1280, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width > 760) {
      await expect(
        page.getByRole("button", { name: "Toggle navigation", exact: true }),
      ).toBeHidden();
      const bounds = await page.locator(".project-sidebar").boundingBox();
      for (const button of await page
        .getByRole("navigation", { name: "Project navigation" })
        .getByRole("button")
        .all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(
          await button.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1,
          ),
        ).toBe(true);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          bounds!.x + bounds!.width,
        );
      }
    }
    await trigger.click();
    await expect(search).toBeFocused();
    // Resize and mobile viewport events can arrive after the tap. Wait for the
    // public UI to settle, but still fail if the picker remains detached.
    await expect
      .poll(
        async () => {
          const box = await panel.boundingBox();
          const anchor = await trigger.boundingBox();
          if (!box || !anchor) return Infinity;
          return viewport.height - anchor.y - anchor.height > box.height + 24
            ? Math.abs(box.y - anchor.y - anchor.height - 8)
            : 0;
        },
        { message: "picker should settle against its project trigger" },
      )
      .toBeLessThan(2);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`picker-${viewport.width}.png`),
    });
    await search.fill("missing project");
    await expect(panel).toContainText("No matching projects.");
    await search.fill("Finance");
    await expect(
      panel.getByRole("button", { name: "Finance", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: "Finance", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await search.fill("Finance");
  await panel.getByRole("button", { name: "Finance", exact: true }).click();
  await expect(trigger).toHaveText("Finance");
  await expect(panel).toBeHidden();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await trigger.click();
  const enlarged = await panel.boundingBox();
  expect(enlarged!.x + enlarged!.width).toBeLessThanOrEqual(390);
  expect(enlarged!.y + enlarged!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("picker-enlarged-text.png"),
  });
  await page.getByRole("button", { name: "Add project", exact: true }).focus();
  await expect(panel).toBeHidden();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await trigger.click();
  await page.setViewportSize({ width: 600, height: 400 });
  await expect(panel).toBeVisible();
  const resized = await panel.boundingBox();
  expect(resized!.y + resized!.height).toBeLessThanOrEqual(400);
  await page.mouse.click(5, 5);
  await expect(panel).toBeHidden();
});

test("project switcher does not move or scroll navigation on a short laptop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`audit-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name", { exact: true }).fill("NorthMark");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const nav = page.getByRole("navigation", {
    name: "Project navigation",
    includeHidden: true,
  });
  await expect(nav).toBeVisible();
  const second = await page.request.post("/api/workspaces", {
    headers: { Origin: new URL(page.url()).origin },
    data: { name: "Test" },
  });
  expect(second.ok()).toBe(true);
  await page.reload();
  await openProjectView(page, "Settings");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  const before = await nav.boundingBox();
  await page.locator(".project-switcher-trigger").click();
  await expect(page.getByLabel("Find project")).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("switcher-short-laptop.png"),
    fullPage: true,
  });
  const after = await nav.boundingBox();
  expect(
    Math.abs(after!.y - before!.y),
    "opening the project picker must not push navigation",
  ).toBeLessThan(2);
  expect(
    await page.locator(".project-sidebar").evaluate((node) => node.scrollTop),
    "opening the project picker must not scroll its trigger out of sight",
  ).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-switcher-trigger")).toBeFocused();
});
