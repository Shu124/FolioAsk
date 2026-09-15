import { test, expect } from "@playwright/test";

test("password visibility is independent and resets when changing auth mode", async ({
  page,
}) => {
  await page.goto("/app?auth=signup");
  const password = page.getByLabel("Password", { exact: true });
  const confirmation = page.getByLabel("Confirm password", { exact: true });
  await password.fill("local-test-password");
  await confirmation.fill("local-test-password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmation).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show confirm password", exact: true })
    .click();
  await expect(confirmation).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Google unavailable leaves email login usable and callback errors remove codes", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Google sign-in is not configured",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await page.goto(
    "/app?oauth=google&state=invalid&code=sensitive-provider-code",
  );
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("status")).toContainText(
    "Google sign-in is not configured",
  );
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
