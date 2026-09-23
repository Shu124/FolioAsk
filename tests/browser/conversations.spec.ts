import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("separate conversations reopen from dashboard with their own saved answers", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`threads-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name", { exact: true }).fill("Conversations");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Choose PDF").setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible();
  await page.getByRole("button", { name: "Close source" }).click();
  await nav.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(1);
  await page.getByLabel("Your question").fill("Are those calendar days?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(2);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(0);
  await page.getByLabel("Your question").fill("What is the project budget?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(1);
  await nav.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("button", { name: "When are shop drawings due?", exact: true })
    .click();
  await expect(page.locator(".saved-answer")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".saved-answer")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Source · page 1", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Highlighted source passage")).toBeVisible();
  await page.getByRole("button", { name: "Close source" }).click();
  let failRead = true;
  await page.route("**/api/workspaces/*/answers", async (route) => {
    if (route.request().method() === "GET" && failRead) {
      failRead = false;
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByLabel("Your question")
    .fill("Shop drawings follow-up with a failed history read");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeEnabled();
  await page.getByLabel("Your question").fill("A new shop drawings question");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator("#answer-history")
        .evaluate(
          (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
        ),
    )
    .toBeLessThan(2);
  expect(
    await page
      .locator("#answer-history")
      .evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
});
