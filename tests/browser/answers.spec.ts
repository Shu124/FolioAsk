import { openProjectView } from "../fixtures/navigation";
import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("ask a selected PDF and follow a saved citation to highlighted evidence", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`answers-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name").fill("Evidence");
  await page.getByRole("button", { name: "Create project" }).click();
  await openProjectView(page, "Documents");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Choose PDF").setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await openProjectView(page, "Chat");
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator("#answer-history")).toContainText(
    "Shop drawings are due within 14 calendar days.",
  );
  await expect(
    page.getByText("19 of 20 lifetime answers remaining"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Source · page 1" }).click();
  await expect(page.locator("mark")).toHaveText(
    "Shop drawings are due within 14 calendar days.",
  );
  await expect(page.getByLabel("Highlighted source passage")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Source document" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Source · page 1" }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator("#answer-history")).toContainText(
    "When are shop drawings due?",
  );
  await expect(
    page.getByText("Simulated provider · Not live AI"),
  ).toBeVisible();
});

test("upload completion keeps Ask disabled while an answer is pending", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`pending-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name").fill("Concurrent UI");
  await page.getByRole("button", { name: "Create project" }).click();
  await openProjectView(page, "Documents");
  const file = {
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  };
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Choose PDF").setInputFiles(file);
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  const navigation = page.getByRole("navigation", {
    name: "Project navigation",
    includeHidden: true,
  });
  await openProjectView(page, "Chat");
  await page
    .getByLabel("Your question")
    .fill("When are shop drawings due? [slow fixture]");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await openProjectView(page, "Documents");
  await page
    .getByLabel("Choose PDF")
    .setInputFiles({ ...file, name: "second.pdf" });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByText("1 of 3 lifetime uploads remaining"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await openProjectView(page, "Chat");
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeDisabled({ timeout: 250 });
  await expect(
    page.getByText("19 of 20 lifetime answers remaining"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeEnabled();
});
