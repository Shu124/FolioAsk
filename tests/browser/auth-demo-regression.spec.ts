import { test, expect } from "@playwright/test";

test("Create account opens registration before requiring credentials", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your FolioAsk account" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeHidden();
});

test("registration validates passwords, confirms submission and recovers from failure", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/signup", async (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({
      email: "new-user@example.test",
      password: "local-test-password",
    });
    await route.fulfill({
      status: submissions === 1 ? 503 : 202,
      json:
        submissions === 1
          ? { error: "Signup is unavailable. Try again later." }
          : {
              message:
                "Check your email to confirm your account, then sign in.",
            },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Create your FolioAsk account" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("new-user@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  expect(submissions).toBe(0);
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveJSProperty("validationMessage", "Passwords must match.");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("local-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Signup is unavailable");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "new-user@example.test",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "new-user@example.test",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Name your first project" }),
  ).toBeVisible();
});

test("demo source and navigation fit a narrow mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#demo");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const sector of ["Construction", "Finance", "Healthcare"]) {
    await page.getByRole("button", { name: sector, exact: true }).click();
    await page.getByRole("button", { name: "Document", exact: true }).click();
    const source = page.getByRole("region", {
      name: "Source document",
      exact: true,
    });
    await expect(source).toBeVisible();
    expect(
      await source.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "View source · page 1" }).click();
    await expect(page.locator("mark")).toBeInViewport();
  }
});

test("inspect demo at desktop, tablet and mobile widths", async ({ page }) => {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#demo");
    const documentView = page.getByRole("button", {
      name: "Document",
      exact: true,
    });
    if (await documentView.isVisible()) await documentView.click();
    await expect(
      page.getByRole("region", { name: "Source document", exact: true }),
    ).toBeVisible();
    const chat = page.getByRole("region", { name: "Sample conversation" });
    if (width > 650) await expect(chat).toBeVisible();
    else await expect(chat).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".source-panel")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page
      .locator(".demo-grid")
      .screenshot({ path: test.info().outputPath(`demo-${width}.png`) });
  }
});

test("mobile demo opens the source directly and citations select the document view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#demo");
  const documentButton = page.getByRole("button", {
    name: "Document",
    exact: true,
  });
  const chatButton = page.getByRole("button", { name: "Chat", exact: true });
  await expect(documentButton).toBeVisible();
  await documentButton.click();
  await expect(
    page.getByRole("region", { name: "Source document", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sample conversation" }),
  ).toBeHidden();
  await chatButton.click();
  await expect(
    page.getByRole("region", { name: "Sample conversation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View source · page 1" }).click();
  await expect(documentButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("mark")).toBeInViewport();
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await expect(page.locator("#source-heading")).toHaveText(
    "02 / Revenue overview",
  );
  await expect(page.locator("mark")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("region", { name: "Source document", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sample conversation" }),
  ).toBeVisible();
});
