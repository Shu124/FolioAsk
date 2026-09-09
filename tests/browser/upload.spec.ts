import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("upload an approved PDF and inspect rendered original and extracted page", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`upload-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Upload journey");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByLabel("Choose PDF").setInputFiles({
    name: "contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("2 of 3 lifetime uploads remaining"),
  ).toBeVisible();
  await expect(
    page.locator('canvas[aria-label="Original page 1"]'),
  ).toBeVisible();
  await expect(
    page.getByText("Shop drawings are due within 14 calendar days."),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("upload.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "contract.pdf", exact: true }).click();
  await expect(
    page.locator('canvas[aria-label="Original page 1"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
