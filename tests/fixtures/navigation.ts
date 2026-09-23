import { expect, type Page } from "@playwright/test";

export async function openNavigation(page: Page) {
  await expect(page.locator("#project-main")).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: "Project navigation",
    includeHidden: true,
  });
  await expect(nav.getByRole("button", { includeHidden: true })).toHaveCount(4);
  if (!(await nav.isVisible()))
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
  await expect(nav).toBeVisible();
  return nav;
}

export async function openProjectView(page: Page, name: string) {
  const nav = await openNavigation(page);
  await nav.getByRole("button", { name, exact: true }).click();
}

export async function openChatHistory(page: Page) {
  const toggle = page.getByRole("button", {
    name: "Chat history",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  const library = page.locator(".conversation-sidebar .chat-library");
  if (!(await library.evaluate((node) => (node as HTMLDetailsElement).open)))
    await library.locator("summary").click();
}

export async function closeChatHistory(page: Page) {
  const close = page.getByRole("button", {
    name: "Close chat history",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
}
