import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "../fixtures/onboarding";
import { openProjectView } from "../fixtures/navigation";
import { samplePdf } from "../fixtures/pdf";

test.setTimeout(60_000);

async function prepareChat(page: Page) {
  await page.goto("/app");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`recovery-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Answer recovery");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator("#project-main")).toBeVisible();
  const workspace = new URL(page.url()).searchParams.get("workspace")!;
  const uploaded = await page.request.post(
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
  expect(uploaded.status()).toBe(201);
  await page.reload();
  await openProjectView(page, "Chat");
}

for (const failure of ["capacity", "network"] as const) {
  test(`${failure} failure removes thinking, restores the draft and retries without a duplicate turn`, async ({
    page,
  }) => {
    await prepareChat(page);
    await page.getByLabel("Your question").fill("When are shop drawings due?");
    await page.getByRole("button", { name: "Ask selected document" }).click();
    await expect(page.locator(".saved-answer")).toHaveCount(1);
    const prompt = "Are shop drawings due within 14 calendar days?";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: {
      requestKey: string;
      question: string;
      threadId: string;
    }[] = [];
    await page.route("**/api/workspaces/*/answers", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push(route.request().postDataJSON());
      if (requests.length > 1) return route.continue();
      await gate;
      if (failure === "network") await route.abort();
      else
        await route.fulfill({
          status: 429,
          json: {
            error:
              "Shared free AI capacity is paused. Your draft is preserved; no answer allowance was used.",
          },
        });
    });
    try {
      await page.getByLabel("Your question").fill(prompt);
      await page.getByRole("button", { name: "Ask selected document" }).click();
      await expect(page.locator(".pending-answer h4")).toHaveText(prompt);
      await expect(
        page.locator(".pending-answer").getByRole("status"),
      ).toHaveText("Finding an answer…");
      await expect(page.getByLabel("Your question")).toHaveValue("");
      await expect(page.locator(".saved-answer")).toHaveCount(1);
      await openProjectView(page, "Dashboard");
      await page
        .getByRole("button", {
          name: "When are shop drawings due?",
          exact: true,
        })
        .click();
      await expect(page.locator(".pending-answer h4")).toHaveText(prompt);
    } finally {
      release();
    }
    await expect(page.locator(".pending-answer")).toHaveCount(0);
    await expect(page.getByLabel("Your question")).toHaveValue(prompt);
    await expect(page.locator("#question-status")).not.toHaveText("");
    if (failure === "network")
      await expect(page.locator("#question-status")).toContainText(
        "Your draft is preserved. Check your connection, then retry",
      );
    await expect(
      page.getByRole("button", { name: "Ask selected document" }),
    ).toBeEnabled();
    await expect(page.locator("#answer-usage")).toContainText("19 of 20");
    await expect(page.locator(".saved-answer")).toHaveCount(1);
    await page.getByRole("button", { name: "Ask selected document" }).click();
    await expect(page.locator(".saved-answer")).toHaveCount(2);
    await expect(page.locator(".pending-answer")).toHaveCount(0);
    await expect(page.locator("#answer-usage")).toContainText("18 of 20");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await expect(page.locator("#answer-history h4")).toHaveText([
      "When are shop drawings due?",
      prompt,
    ]);
  });
}

for (const change of ["rename", "delete"] as const) {
  test(`${change} during an answer preserves pending feedback without resurrecting deleted history`, async ({
    page,
  }) => {
    await prepareChat(page);
    await page.getByLabel("Your question").fill("When are shop drawings due?");
    await page.getByRole("button", { name: "Ask selected document" }).click();
    await expect(page.locator(".saved-answer")).toHaveCount(1);
    let release!: () => void, responseReady!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      responseReady = resolve;
    });
    let failReads = false;
    const staleCounts: number[] = [];
    await page.route("**/api/workspaces/*/answers", async (route) => {
      if (route.request().method() === "GET") {
        if (!failReads) return route.continue();
        staleCounts.push(await page.locator(".saved-answer").count());
        return route.fulfill({
          status: 503,
          json: { error: "History temporarily unavailable" },
        });
      }
      if (change === "delete") {
        const response = await route.fetch();
        responseReady();
        await gate;
        await route.fulfill({ response });
      } else {
        await gate;
        await route.continue();
      }
    });
    const prompt = "Shop drawings follow-up during a history change";
    try {
      await page.getByLabel("Your question").fill(prompt);
      await page.getByRole("button", { name: "Ask selected document" }).click();
      await expect(page.locator(".pending-answer h4")).toHaveText(prompt);
      if (change === "delete") await ready;
      await openProjectView(page, "Settings");
      await page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("button", { name: "Chat history", exact: true })
        .click();
      const library = page.locator(".settings-history");
      await library
        .getByLabel("Conversation", { exact: true })
        .selectOption({ label: "When are shop drawings due?" });
      await library
        .getByRole("button", { name: "Conversation actions", exact: true })
        .click();
      if (change === "rename") {
        await library
          .getByRole("button", { name: "Rename", exact: true })
          .click();
        await library
          .getByLabel("Conversation title", { exact: true })
          .fill("Updated drawing research");
        await library
          .getByRole("button", { name: "Save title", exact: true })
          .click();
      } else {
        await library
          .getByRole("button", { name: "Delete", exact: true })
          .click();
        await library
          .getByRole("button", { name: "Delete conversation", exact: true })
          .click();
      }
      await expect(
        library.getByText("Conversation updated.", { exact: true }),
      ).toBeVisible();
      failReads = change === "rename";
      await openProjectView(page, "Chat");
      if (change === "rename") {
        await expect(
          page.getByRole("status", { name: "Project status" }),
        ).toContainText("Could not refresh conversation history");
      } else {
        await expect(
          page.getByText("Reloading conversation history.", { exact: false }),
        ).toBeHidden({ timeout: 15_000 });
      }
      await expect(page.locator(".pending-answer h4")).toHaveText(prompt);
      await expect(
        page.locator(".pending-answer").getByRole("status"),
      ).toHaveText("Finding an answer…");
      failReads = change === "delete";
    } finally {
      release();
    }
    await expect(page.locator(".pending-answer")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask selected document" }),
    ).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator(".saved-answer")).toHaveCount(
      change === "delete" ? 0 : 2,
    );
    if (change === "delete") {
      expect(staleCounts).toEqual([0, 0]);
      await expect(page.locator("#question-status")).toContainText(
        "could not refresh",
      );
    } else
      await expect(page.locator(".answer-panel .chat-title-row h3")).toHaveText(
        "Updated drawing research",
      );
  });
}
