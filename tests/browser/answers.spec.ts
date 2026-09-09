import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("ask a selected PDF and follow a saved citation to highlighted evidence", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`answers-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Evidence");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page
    .getByLabel("Choose PDF")
    .setInputFiles({
      name: "contract.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await samplePdf()),
    });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible({
    timeout: 20_000,
  });
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
  await page.reload();
  await expect(page.locator("#answer-history")).toContainText(
    "When are shop drawings due?",
  );
  await expect(
    page.getByText("Simulated provider · Not live AI"),
  ).toBeVisible();
});
