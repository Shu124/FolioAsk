import type { Page } from "@playwright/test";

export async function confirmPublicUpload(page: Page) {
  await page
    .getByLabel("Document privacy", { exact: true })
    .selectOption("public");
  await page
    .getByLabel(
      "I confirm this document is public and contains no personal, confidential or sensitive data.",
      { exact: true },
    )
    .check();
}
