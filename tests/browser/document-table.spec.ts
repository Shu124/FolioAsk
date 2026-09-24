import { confirmPublicUpload } from "../fixtures/public-upload";
import { openProjectView } from "../fixtures/navigation";
import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("document table searches, trashes and restores without resetting allowance", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`trash-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Document library");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const nav = page.getByRole("navigation", {
    name: "Project navigation",
    includeHidden: true,
  });
  await openProjectView(page, "Documents");
  await expect(page.getByLabel("Choose document")).toBeHidden();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Choose document").setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  });
  await confirmPublicUpload(page);
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible();
  await page.getByRole("button", { name: "Close source" }).click();
  await expect(
    page.getByRole("table", { name: "Project documents" }),
  ).toContainText("contract.pdf");
  await page.getByLabel("Search documents").fill("missing");
  await expect(page.getByText("No matching documents.")).toBeVisible();
  await page.getByLabel("Search documents").fill("");
  await openProjectView(page, "Chat");
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(1);
  await openProjectView(page, "Documents");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Move contract.pdf to Trash" })
    .click();
  await expect(page.getByText("No documents here yet.")).toBeVisible();
  await expect(
    page.getByText("2 of 3 lifetime uploads remaining"),
  ).toBeVisible();
  await openProjectView(page, "Chat");
  await expect(
    page.getByRole("button", { name: "Source · page 1 · In Trash" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Source · page 1 · In Trash" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("in Trash");
  await page.getByRole("button", { name: "Close source" }).click();
  await openProjectView(page, "Documents");
  await page.reload();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore contract.pdf" }).click();
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "contract.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("2 of 3 lifetime uploads remaining"),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("document-table.png"),
    fullPage: true,
  });
});
