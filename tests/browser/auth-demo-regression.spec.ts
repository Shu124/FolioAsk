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
  await page.getByRole("link", { name: "Get started", exact: true }).click();
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
    page.getByRole("heading", { name: "Make this workspace yours" }),
  ).toBeVisible();
});

test("demo source and navigation fit desktop, tablet and narrow mobile", async ({
  page,
}) => {
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#demo");
    const nav = page.getByRole("navigation", { name: "Demo navigation" });
    for (const view of ["Dashboard", "Documents", "Chat"]) {
      await nav.getByRole("button", { name: view, exact: true }).click();
      await expect(
        nav.getByRole("button", { name: view, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "View source · page 1", exact: true })
      .click();
    const drawer = page.getByRole("dialog", { name: "Source document" });
    await expect(drawer).toBeVisible();
    await expect(page.locator("mark")).toBeInViewport();
    expect(
      await drawer.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page
      .locator(".demo-grid")
      .screenshot({ path: test.info().outputPath(`demo-${width}.png`) });
  }
});

test("demo Trash is simulated and source drawer traps keyboard focus in dark mode", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("folioask-theme", "dark"));
  await page.reload();
  const nav = page.getByRole("navigation", { name: "Demo navigation" });
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Move sample to Trash" }).click();
  await expect(
    page.getByText("No sample documents in this view."),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByRole("button", { name: "View source · page 1 · In Trash" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "This sample is in Trash.",
  );
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore sample" }).click();
  await nav.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByRole("button", { name: "View source · page 1", exact: true })
    .click();
  const close = page.getByRole("button", { name: "Close source" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBe(true);
  await expect(page.locator(".paper")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({
    path: test.info().outputPath("demo-dark-source.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View source · page 1", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page
    .getByRole("button", { name: "View source · page 1", exact: true })
    .click();
  await expect(page.locator("#source-heading")).toHaveText(
    "02 / Revenue overview",
  );
  await expect(page.locator("mark")).toContainText("$1.2 million");
});
