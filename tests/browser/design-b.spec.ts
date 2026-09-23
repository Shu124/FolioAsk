import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "../fixtures/onboarding";
import { samplePdf } from "../fixtures/pdf";
import {
  openProjectView,
  openNavigation,
  openChatHistory,
  closeChatHistory,
} from "../fixtures/navigation";

async function workspace(page: Page) {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`design-b-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Design B research");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator("#project-main")).toBeVisible();
  return new URL(page.url()).searchParams.get("workspace")!;
}

async function seedHistory(
  page: Page,
  workspaceId: string,
  questions: string[],
) {
  const headers = { Origin: new URL(page.url()).origin };
  const uploaded = await page.request.post(
    `/api/workspaces/${workspaceId}/documents?name=contract.pdf`,
    {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: Buffer.from(await samplePdf()),
    },
  );
  expect(uploaded.status()).toBe(201);
  const document = await uploaded.json();
  for (const question of questions) {
    const answer = await page.request.post(
      `/api/workspaces/${workspaceId}/answers`,
      {
        headers,
        data: {
          question,
          documentIds: [document.id],
          requestKey: crypto.randomUUID(),
        },
      },
    );
    expect(answer.ok()).toBe(true);
  }
}

test("history settings manage only the selected project and report partial clear failures", async ({
  page,
}) => {
  test.setTimeout(60000);
  const id = await workspace(page);
  await seedHistory(page, id, [
    "When are shop drawings due?",
    "What is the budget?",
  ]);
  const other = await (
    await page.request.post("/api/workspaces", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name: "Keep this project" },
    })
  ).json();
  await seedHistory(page, other.id, ["When are shop drawings due?"]);
  await page.reload();
  await openProjectView(page, "Settings");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toBeHidden();
  await sections
    .getByRole("button", { name: "Chat history", exact: true })
    .click();
  const history = page.locator(".settings-history");
  await history
    .getByLabel("Conversation", { exact: true })
    .selectOption({ label: "When are shop drawings due?" });
  await history
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click();
  await history.getByRole("button", { name: "Rename", exact: true }).click();
  await history
    .getByLabel("Conversation title", { exact: true })
    .fill("Drawing deadlines");
  await history
    .getByRole("button", { name: "Save title", exact: true })
    .click();
  await expect(
    history.getByRole("heading", { name: "Drawing deadlines", exact: true }),
  ).toBeVisible();
  await history
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click();
  await history.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    history.getByText(
      "This conversation is archived. Restore it to ask more questions.",
      { exact: true },
    ),
  ).toBeVisible();
  await history.getByLabel("Show archived conversations").check();
  await history.getByLabel("Search conversations").fill("Drawing");
  await expect(history.locator(".conversation-list button")).toHaveCount(1);
  await history
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click();
  await history.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    history.getByText(
      "This conversation is archived. Restore it to ask more questions.",
      { exact: true },
    ),
  ).toBeHidden();
  await history
    .getByRole("button", { name: "Clear project history", exact: true })
    .click();
  const clearDialog = page.getByRole("dialog", {
    name: "Clear project history",
    exact: true,
  });
  await expect(
    clearDialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await clearDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${id}/conversations`)
      ).json()
    ).length,
  ).toBe(2);
  let deletes = 0;
  await page.route(`**/api/workspaces/${id}/conversations/*`, (route) => {
    if (route.request().method() === "DELETE" && ++deletes === 2)
      return route.fulfill({ status: 503, json: { error: "Fixture failure" } });
    return route.continue();
  });
  await history
    .getByRole("button", { name: "Clear project history", exact: true })
    .click();
  await clearDialog
    .getByRole("button", { name: "Delete all conversations", exact: true })
    .click();
  await expect(
    history.getByRole("status", { name: "History settings status" }),
  ).toContainText("Deleted 1 of 2 conversations");
  await page.unrouteAll({ behavior: "wait" });
  await history
    .getByRole("button", { name: "Clear project history", exact: true })
    .click();
  await clearDialog
    .getByRole("button", { name: "Delete all conversations", exact: true })
    .click();
  await expect(
    history.getByRole("status", { name: "History settings status" }),
  ).toContainText("Project chat history cleared");
  await expect(
    history.getByRole("button", { name: "Clear project history", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${other.id}/conversations`)
      ).json()
    ).length,
  ).toBe(1);
  expect(
    (await (await page.request.get(`/api/workspaces/${id}/documents`)).json())
      .length,
  ).toBe(1);
  expect(
    (await (await page.request.get("/api/usage")).json()).answersRemaining,
  ).toBe(17);
  let failHistory = true;
  await page.route(`**/api/workspaces/${id}/answers`, (route) => {
    if (failHistory && route.request().method() === "GET") {
      failHistory = false;
      return route.fulfill({
        status: 503,
        json: { error: "Fixture history unavailable" },
      });
    }
    return route.continue();
  });
  await openProjectView(page, "Chat");
  await expect(
    page.getByRole("status", { name: "Project status" }),
  ).toContainText("Could not refresh conversation history");
  await expect(page.locator(".saved-answer")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ask selected document" }),
  ).toBeDisabled();
  await openProjectView(page, "Chat");
  await expect(
    page.getByRole("status", { name: "Project status", includeHidden: true }),
  ).toBeEmpty();
  await openChatHistory(page);
  await expect(
    page.locator(".conversation-sidebar .conversation-list button"),
  ).toHaveCount(0);
  await closeChatHistory(page);
});

test("folding, rotating and drawer focus preserve a draft and keep the composer reachable", async ({
  page,
}) => {
  const id = await workspace(page);
  await seedHistory(page, id, ["When are shop drawings due?"]);
  await page.reload();
  await openProjectView(page, "Chat");
  const question = page.getByLabel("Your question");
  await question.fill("Keep this draft while folding the phone");
  for (const viewport of [
    { width: 344, height: 882 },
    { width: 717, height: 512 },
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 390, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(question).toHaveValue(
      "Keep this draft while folding the phone",
    );
    await openChatHistory(page);
    const drawer = page.getByRole("dialog", {
      name: "Chat history",
      exact: true,
    });
    if (viewport.width <= 1100) {
      await expect(drawer).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Close chat history" }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      expect(
        await drawer.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Chat history", exact: true }),
      ).toBeFocused();
    }
    await question.focus();
    await expect(question).toBeInViewport();
    const send = page.getByRole("button", { name: "Ask selected document" });
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test
        .info()
        .outputPath(`chat-${viewport.width}-${viewport.height}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 344, height: 882 });
  await openNavigation(page);
  const navigation = page.getByRole("dialog", {
    name: "Navigation",
    exact: true,
  });
  await page.keyboard.press("Shift+Tab");
  expect(
    await navigation.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(navigation).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Project navigation" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".project-sidebar")
      .evaluate(
        (node) =>
          node.contains(document.activeElement) &&
          document.activeElement instanceof HTMLElement &&
          document.activeElement.checkVisibility(),
      ),
  ).toBe(true);
  await expect(question).toHaveValue("Keep this draft while folding the phone");
  await page.setViewportSize({ width: 344, height: 882 });
  await openChatHistory(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.getByRole("dialog", { name: "Chat history", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".conversation-sidebar")).toBeVisible();
  expect(
    await page
      .locator(".conversation-sidebar")
      .evaluate(
        (node) =>
          node.contains(document.activeElement) &&
          document.activeElement instanceof HTMLElement &&
          document.activeElement.checkVisibility(),
      ),
  ).toBe(true);
  await expect(question).toHaveValue("Keep this draft while folding the phone");
});

test("a stalled clear request can be dismissed without scheduling more deletions", async ({
  page,
}) => {
  const id = await workspace(page);
  await seedHistory(page, id, [
    "When are shop drawings due?",
    "What is the budget?",
  ]);
  await openProjectView(page, "Settings");
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Chat history", exact: true })
    .click();
  const history = page.locator(".settings-history");
  let release!: () => void,
    started!: () => void,
    deletes = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`**/api/workspaces/${id}/conversations/*`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deletes++;
    const response = await route.fetch();
    started();
    await pending;
    await route.fulfill({ response });
  });
  await history
    .getByRole("button", { name: "Clear project history", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Clear project history",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Delete all conversations", exact: true })
    .click();
  try {
    await ready;
    await expect(
      dialog.getByRole("button", { name: "Stop clearing", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      history.getByRole("status", { name: "History settings status" }),
    ).toContainText("Stopping after the current deletion");
    await history.getByLabel("Search conversations").fill("Keep typing");
  } finally {
    release();
  }
  await expect(
    history.getByRole("status", { name: "History settings status" }),
  ).toContainText("Clearing stopped. Deleted 1 of 2");
  await expect(history.getByLabel("Search conversations")).toBeFocused();
  expect(deletes).toBe(1);
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${id}/conversations`)
      ).json()
    ).length,
  ).toBe(1);
});
