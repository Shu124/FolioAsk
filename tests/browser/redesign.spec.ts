import { completeOnboarding } from "../fixtures/onboarding";
import { openProjectView } from "../fixtures/navigation";
import { test, expect } from "@playwright/test";

test("project creation stays in the body and Chat has no upload panel", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`layout-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Research studio");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("button", { name: /New project|Add project/ }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".project-content")
      .getByRole("button", { name: "Add project", exact: true }),
  ).toBeVisible();
  const chat = page
    .getByRole("navigation", {
      name: "Project navigation",
      includeHidden: true,
    })
    .getByRole("button", { name: "Chat", exact: true, includeHidden: true });
  await openProjectView(page, "Chat");
  await expect(chat).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Your question")).toBeVisible();
  await expect(page.getByLabel("Choose PDF")).toBeHidden();
  await expect(chat.locator("svg")).toHaveCount(1);
  if (page.viewportSize()!.width < 761) {
    await expect(chat).toBeHidden();
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(chat).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(chat).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Toggle navigation" }),
    ).toBeFocused();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
