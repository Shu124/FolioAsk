import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

test("public demo and signup remain usable with enlarged text", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        (font) =>
          font.family.includes("Inter Variable") && font.status === "loaded",
      ),
    ),
  ).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      localStorage.setItem("folioask-theme", theme);
    }, theme);
    await page.reload();
    await page
      .locator(".product-hero")
      .screenshot({ path: test.info().outputPath(`hero-${theme}.png`) });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const navigation = page.getByRole("navigation", {
      name: "Demo navigation",
    });
    for (const view of ["Dashboard", "Documents", "Chat"]) {
      await navigation.getByRole("button", { name: view, exact: true }).click();
      const overflow = await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        nodes: [...document.querySelectorAll<HTMLElement>("body *")]
          .filter(
            (node) =>
              node.getBoundingClientRect().right > innerWidth &&
              !node.closest(".table-scroll, .activity-chart"),
          )
          .map((node) => node.className || node.tagName)
          .slice(0, 15),
      }));
      expect(overflow.fits, `${view}: ${overflow.nodes.join(", ")}`).toBe(true);
      await page.locator(".demo-grid").screenshot({
        path: test
          .info()
          .outputPath(`demo-${view.toLowerCase()}-${theme}-200.png`),
      });
    }
  }
  await page.goto("/app?auth=signup");
  await expect(
    page.getByRole("heading", { name: "Create your FolioAsk account" }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("signup-text-200.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("readable product UI across populated screens and themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".product-hero")
    .screenshot({ path: test.info().outputPath("hero-light.png") });
  await page.screenshot({
    path: test.info().outputPath("landing-light.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Get started", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create your FolioAsk account" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("signup-light.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`design-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await completeOnboarding(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Elm Street renovation");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await nav.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.getByLabel("Choose PDF").setInputFiles({
    name: "Construction agreement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf()),
  });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(page.getByText("Ready · 1 page")).toBeVisible();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(page.locator("#upload-status")).toContainText(
    "Your document is ready.",
  );
  await nav.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Your question").fill("When are shop drawings due?");
  await page.getByRole("button", { name: "Ask selected document" }).click();
  await expect(page.locator(".saved-answer")).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
    for (const view of ["Dashboard", "Documents", "Chat", "Settings"]) {
      await nav.getByRole("button", { name: view, exact: true }).click();
      if (view === "Chat") {
        await expect(
          page.getByRole("button", { name: "New chat", exact: true }),
        ).toBeVisible();
        const historyHeight = await page
          .locator("#answer-history")
          .evaluate((node) => node.clientHeight);
        expect(
          historyHeight,
          "chat should provide a readable message area",
        ).toBeGreaterThanOrEqual(160);
        await page.getByLabel("Your question").focus();
        await page.keyboard.press("Tab");
        await expect(
          page.getByLabel("Selected document", { exact: true }),
        ).toBeFocused();
      }
      if (view === "Documents") {
        const table = await page.locator("#document-buttons").boundingBox();
        const allowance = await page
          .getByRole("region", { name: "Document allowance" })
          .boundingBox();
        expect(
          table!.y,
          "documents should appear before the expanded capacity panel",
        ).toBeLessThan(allowance!.y);
      }
      if (view === "Dashboard")
        await expect(
          page.getByLabel("Active documents", { exact: true }),
        ).toHaveText("1");
      await page.screenshot({
        path: test.info().outputPath(`${view.toLowerCase()}-${theme}.png`),
        fullPage: true,
      });
      const controls = await page
        .locator("button, input, select, textarea")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.checkVisibility())
            .map((node) => ({
              label:
                node.getAttribute("aria-label") ||
                node.textContent?.trim().slice(0, 35) ||
                node.tagName,
              size: parseFloat(getComputedStyle(node).fontSize),
              height: node.matches('input[type="checkbox"]')
                ? (node.closest("label") ?? node).getBoundingClientRect().height
                : node.getBoundingClientRect().height,
            })),
        );
      for (const control of controls) {
        expect(
          control.size,
          `${view}: ${control.label} readable type`,
        ).toBeGreaterThanOrEqual(14);
        expect(
          control.height,
          `${view}: ${control.label} usable target`,
        ).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (view === "Settings") {
        const sections = page.getByRole("navigation", {
          name: "Settings sections",
        });
        for (const section of ["Project", "Appearance", "Usage", "Account"]) {
          await sections
            .getByRole("button", { name: section, exact: true })
            .click();
          await expect(
            sections.getByRole("button", { name: section, exact: true }),
          ).toHaveAttribute("aria-pressed", "true");
          await page.screenshot({
            path: test
              .info()
              .outputPath(`settings-${section.toLowerCase()}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
  }
  const typeSizes = await page
    .locator(
      ".project-sidebar nav button, .settings-navigation button, #profile-form label, #profile-form input",
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        tag: node.tagName,
        size: parseFloat(getComputedStyle(node).fontSize),
      })),
    );
  for (const item of typeSizes)
    expect(item.size, `${item.tag} should be readable`).toBeGreaterThanOrEqual(
      item.tag === "INPUT" ? 16 : 14,
    );
  for (const button of await nav.getByRole("button").all()) {
    await expect(button.locator("svg")).toHaveCount(1);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const button of await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button")
    .all())
    await expect(button.locator("svg")).toHaveCount(1);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const view of ["Dashboard", "Documents", "Chat", "Settings"]) {
    await nav.getByRole("button", { name: view, exact: true }).click();
    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= innerWidth,
      overflow: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(
          (node) =>
            node.getBoundingClientRect().right > innerWidth &&
            !node.closest(".table-scroll, .activity-chart"),
        )
        .map((node) => node.className || node.tagName)
        .slice(0, 12),
    }));
    expect(
      layout.fits,
      `${view} fits at 200% text size: ${layout.overflow.join(", ")}`,
    ).toBe(true);
  }
  await nav.getByRole("button", { name: "Settings", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineWidth,
    ),
  ).toBe("3px");
  await page.screenshot({
    path: test.info().outputPath("settings-text-200.png"),
    fullPage: true,
  });
});
