import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect, type Page } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

async function account(page: Page) {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`limits-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page.getByLabel("Project name", { exact: true }).fill("Free allowance");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Free allowance", exact: true }),
  ).toBeVisible();
  const workspace = new URL(page.url()).searchParams.get("workspace")!;
  return {
    workspace,
    navigate: async (name: string) =>
      page
        .getByRole("navigation", { name: "Project navigation" })
        .getByRole("button", { name, exact: true })
        .click(),
    upload: async () => {
      const result = await page.request.post(
        `/api/workspaces/${workspace}/documents?name=contract.pdf`,
        {
          headers: {
            Origin: new URL(page.url()).origin,
            "Content-Type": "application/pdf",
            "Idempotency-Key": crypto.randomUUID(),
          },
          data: Buffer.from(await samplePdf()),
        },
      );
      expect(result.status()).toBe(201);
      return result.json();
    },
  };
}

test("shared AI warnings are distinct from account limits, preserve drafts, and recover", async ({
  page,
}) => {
  let state = "warning";
  await page.route("**/api/ai-capacity", (route) =>
    route.fulfill({ json: { state } }),
  );
  const user = await account(page);
  await user.upload();
  await page.reload();
  await user.navigate("Chat");
  const shared = page.getByRole("region", { name: "Shared AI capacity" });
  await expect(shared).toContainText("At least 80%");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("When are shop drawings due?");
  await page.route(`**/api/workspaces/${user.workspace}/answers`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 429,
          json: {
            error:
              "Shared free AI capacity is paused. Your draft is preserved; no answer allowance was used.",
          },
        })
      : route.continue(),
  );
  state = "paused";
  await page
    .getByRole("button", { name: "Ask selected document", exact: true })
    .click();
  await expect(page.getByLabel("Your question", { exact: true })).toHaveValue(
    "When are shop drawings due?",
  );
  await expect(shared).toContainText("Upgrading cannot bypass");
  await expect(page.locator("#answer-usage")).toContainText("20 of 20");
  state = "available";
  await shared.getByRole("button", { name: "Refresh AI status" }).click();
  await expect(shared).toBeHidden();
  state = "warning";
  await user.navigate("Settings");
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Shared AI capacity" }),
  ).toContainText("At least 80%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("shared-ai-warning.png"),
    fullPage: true,
  });
});

test("free upload limit shows a truthful upgrade prompt, retains saved files and survives reload", async ({
  page,
}) => {
  const user = await account(page);
  for (let i = 0; i < 3; i++) await user.upload();
  await user.navigate("Documents");
  await page.reload();
  const allowance = page.getByRole("region", { name: "Document allowance" });
  await expect(allowance).toContainText("Free upload limit reached");
  await expect(allowance).toContainText("/ 30 MB used");
  await expect(
    page.getByRole("button", { name: "Add document", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "contract.pdf", exact: true }),
  ).toHaveCount(3);
  const upgrade = allowance.getByRole("button", {
    name: "Upgrade plan",
    exact: true,
  });
  await upgrade.click();
  const dialog = page.getByRole("dialog", { name: "Upgrade your plan" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Paid plans are coming soon");
  await expect(dialog).toContainText("No payment will be taken");
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close upgrade" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close upgrade" }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Checkout not available yet" }),
  ).toBeDisabled();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: test.info().outputPath("upgrade-dialog.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(upgrade).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("upload-limit.png"),
    fullPage: true,
  });
  await page.route("**/api/documents/*/original", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Too many storage requests. Wait a minute and try again.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "contract.pdf", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status", { name: "Source status" }),
  ).toContainText("Too many storage requests");
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await user.navigate("Settings");
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Usage", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Plan allowance" }),
  ).toContainText("Free upload limit reached");
});

test("the last free answer disables new questions and offers upgrading without hiding conversation history", async ({
  page,
}) => {
  const user = await account(page);
  const doc = await user.upload();
  for (let i = 0; i < 20; i++) {
    const result = await page.request.post(
      `/api/workspaces/${user.workspace}/answers`,
      {
        headers: { Origin: new URL(page.url()).origin },
        data: {
          question: "When are shop drawings due?",
          documentIds: [doc.id],
          requestKey: crypto.randomUUID(),
        },
      },
    );
    expect(result.status()).toBe(201);
  }
  await user.navigate("Chat");
  await page.reload();
  const allowance = page.getByRole("region", { name: "Answer allowance" });
  await expect(allowance).toContainText("Free answer limit reached");
  await expect(
    page.getByRole("button", { name: "Ask selected document", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Conversation", { exact: true }).locator("option"),
  ).toHaveCount(21);
  await allowance
    .getByRole("button", { name: "Upgrade plan", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Upgrade your plan" }),
  ).toBeVisible();
});

test("80 percent storage warning and the upgrade dialog fit narrow dark-mode screens", async ({
  page,
}) => {
  const user = await account(page);
  // UI-only boundary fixture: server quota enforcement is covered through real API/SQL tests.
  await page.route("**/api/usage", async (route) => {
    const response = await route.fetch();
    const usage = await response.json();
    await route.fulfill({
      response,
      json: {
        ...usage,
        storedBytes: 24_000_000,
        storageRemainingBytes: 6_000_000,
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await user.navigate("Documents");
  await page.reload();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  const allowance = page.getByRole("region", { name: "Document allowance" });
  await expect(allowance).toContainText("24.00 MB / 30 MB used");
  await expect(allowance).toContainText("at least 80%");
  await expect(allowance.getByRole("meter")).toHaveAttribute(
    "value",
    "24000000",
  );
  await expect(
    page.getByRole("button", { name: "Add document", exact: true }),
  ).toBeEnabled();
  await allowance
    .getByRole("button", { name: "Upgrade plan", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Upgrade your plan" });
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("upgrade-dark-320.png"),
    fullPage: true,
  });
});
