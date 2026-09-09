import { test, expect } from "@playwright/test";

test("sign in, create and reopen an owned workspace, then sign out", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`owner-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Elm Street");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Elm Street", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Elm Street", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await expect(page.getByText("Elm Street", { exact: true })).toHaveCount(0);
});

test("a second browser account cannot open or rename the first account workspace", async ({
  page,
  browser,
}) => {
  await page.goto("/app");
  await page
    .getByLabel("Email")
    .fill(`alice-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Private project title");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Private project title" }),
  ).toBeVisible();
  const url = page.url();
  const id = new URL(url).searchParams.get("workspace")!;
  const other = await browser.newContext();
  try {
    const bob = await other.newPage();
    await bob.goto(url);
    await bob
      .getByLabel("Email")
      .fill(`bob-${crypto.randomUUID()}@example.test`);
    await bob.getByLabel("Password").fill("local-test-password");
    await bob.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(bob.getByRole("status")).toHaveText("Workspace not found.");
    await expect(
      bob.getByText("Private project title", { exact: true }),
    ).toHaveCount(0);
    const status = await bob.evaluate(
      async (workspaceId) =>
        (
          await fetch(`/api/workspaces/${workspaceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Stolen" }),
          })
        ).status,
      id,
    );
    expect(status).toBe(404);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Private project title" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
