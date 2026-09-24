import { test, expect } from "@playwright/test";
import { openProjectView } from "../fixtures/navigation";
import { completeOnboarding } from "../fixtures/onboarding";
import { confirmPublicUpload } from "../fixtures/public-upload";

test("public upload consent, private warning and safe text citations on desktop and phones", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`real-doc-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name").fill("Public research");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await openProjectView(page, "Documents");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  const submit = page.getByRole("button", {
    name: "Upload document",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page
    .getByLabel("Document privacy", { exact: true })
    .selectOption("private");
  await expect(page.locator(".private-upload-notice")).toBeVisible();
  await expect(submit).toBeDisabled();
  await page
    .getByRole("button", { name: "View paid options", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    /not available|not enabled/,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close upgrade", exact: true })
    .click();
  await page
    .getByLabel("Document privacy", { exact: true })
    .selectOption("unsure");
  await expect(submit).toBeDisabled();
  const file = {
    name: "public-notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "Shop drawings are due within 14 calendar days.\n<script>alert('not-executed')</script>",
    ),
  };
  await page.getByLabel("Choose document").setInputFiles(file);
  await confirmPublicUpload(page);
  await page.getByLabel("Choose document").setInputFiles(file);
  await expect(submit).toBeDisabled();
  await confirmPublicUpload(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() =>
      page
        .locator(".public-upload-consent")
        .evaluate((node) => getComputedStyle(node).flexDirection),
    )
    .toBe("row");
  await page.screenshot({
    path: test.info().outputPath("public-upload-dark.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({
    path: test.info().outputPath("public-upload-light.png"),
    fullPage: true,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await submit.click();
  await expect(page.getByLabel("Extracted document text")).toContainText(
    "14 calendar days",
    { timeout: 20_000 },
  );
  await expect(page.getByLabel("Extracted document text")).toContainText(
    "<script>",
  );
  await expect(
    page.getByLabel("Extracted document text").locator("script"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await openProjectView(page, "Chat");
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page
    .getByRole("button", { name: "Ask selected document", exact: true })
    .click();
  const citation = page.getByRole("button", { name: /Source · Line/ });
  await expect(citation).toBeVisible({ timeout: 20_000 });
  await citation.click();
  await expect(page.getByLabel("Highlighted source passage")).toContainText(
    "14 calendar days",
  );
  await page.screenshot({
    path: test.info().outputPath("text-source.png"),
    fullPage: true,
  });
});
