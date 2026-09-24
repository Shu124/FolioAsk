import { confirmPublicUpload } from "../fixtures/public-upload";
import {
  openProjectView,
  openChatHistory,
  closeChatHistory,
} from "../fixtures/navigation";
import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect as baseExpect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test.setTimeout(120_000);
const expect = baseExpect.configure({ timeout: 15_000 });

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
  const nav = page.getByRole("navigation", {
    name: "Project navigation",
    includeHidden: true,
  });
  await openProjectView(page, "Documents");
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
  await openProjectView(page, "Chat");
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(1);
  await page.getByLabel("Your question").fill("Are those calendar days?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(2);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(0);
  let releaseHistory!: () => void;
  const historyGate = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route("**/api/workspaces/*/answers", async (route) => {
    if (route.request().method() === "GET") await historyGate;
    await route.continue();
  });
  try {
    await page.getByLabel("Your question").fill("What is the project budget?");
    await page.getByRole("button", { name: "Ask selected document" }).click();
    await expect(page.locator(".saved-answer")).toHaveCount(1);
    await openProjectView(page, "Dashboard");
    await page
      .getByRole("button", { name: "When are shop drawings due?", exact: true })
      .click();
  } finally {
    releaseHistory();
  }
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
  await expect(page.locator(".chat-title-row h3")).toHaveText(
    "When are shop drawings due?",
  );
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .getByLabel("Conversation title", { exact: true })
    .fill("Drawing deadlines");
  await page.getByRole("button", { name: "Save title", exact: true }).click();
  await expect(page.locator(".chat-title-row h3")).toHaveText(
    "Drawing deadlines",
  );
  await page.reload();
  await expect(page.locator(".chat-title-row h3")).toHaveText(
    "Drawing deadlines",
  );
  await page.screenshot({
    path: test.info().outputPath("populated-chat.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByText(
      "This conversation is archived. Restore it to ask more questions.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeDisabled();
  await openChatHistory(page);
  await page.getByLabel("Show archived conversations").check();
  expect(
    await page
      .getByLabel("Show archived conversations")
      .evaluate(
        (node) => node.closest("label")!.getBoundingClientRect().height,
      ),
  ).toBeGreaterThanOrEqual(44);
  await page.getByLabel("Search conversations").fill("deadlines");
  await expect(
    page.getByLabel("Conversation", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await closeChatHistory(page);
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(4);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete conversation", exact: true })
    .click();
  await expect(page.locator(".saved-answer")).toHaveCount(0);
  await expect(page.locator(".chat-title-row h3")).toHaveText(
    "New conversation",
  );
  await expect(
    page.getByText("15 of 20 lifetime answers remaining", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("managed-chat.png"),
    fullPage: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseResponse!: () => void, responseReady!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  await page.route("**/api/workspaces/*/answers", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    responseReady();
    await released;
    await route.fulfill({ response });
  });
  await page.getByLabel("Your question").fill("Shop drawings after sign-out");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await ready;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const late = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/answers"),
  );
  releaseResponse();
  await late;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(errors).toEqual([]);
});
