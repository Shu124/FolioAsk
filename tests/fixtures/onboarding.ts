import { expect, type Page } from "@playwright/test";

export async function completeOnboarding(page: Page) {
  await expect(page.locator("#signin")).toBeHidden();
  const profile = await (await page.request.get("/api/account")).json();
  const projects = await (await page.request.get("/api/workspaces")).json();
  if (profile.onboardingComplete || projects.length) return;
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Pilot researcher");
  await page
    .getByLabel("Industry", { exact: true })
    .selectOption("Construction");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I understand the document restrictions and free allowance.",
    })
    .check();
  await page
    .getByRole("button", { name: "Continue to project", exact: true })
    .click();
}
