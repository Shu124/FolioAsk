import { confirmPublicUpload } from "../fixtures/public-upload";
import { openProjectView, openNavigation } from "../fixtures/navigation";
import { completeOnboarding } from "../fixtures/onboarding";
import { test, expect } from "@playwright/test";
import { samplePdf } from "../fixtures/pdf";

const screens = [
  { name: "narrow-phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "wide-phone", width: 500, height: 900 },
  { name: "small-tablet", width: 600, height: 960 },
  { name: "portrait-tablet", width: 768, height: 1024 },
  { name: "large-tablet", width: 820, height: 1180 },
  { name: "landscape-tablet", width: 1024, height: 768 },
  { name: "short-laptop", width: 1024, height: 600 },
  { name: "small-laptop", width: 1280, height: 720 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "landscape-phone", width: 844, height: 390 },
  { name: "fold-cover", width: 344, height: 882 },
  { name: "fold-open", width: 717, height: 512 },
];
for (const screen of screens) {
  test.describe(screen.name, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });
    test("public and populated workspace adapt comfortably", async ({
      page,
    }) => {
      test.setTimeout(60000);
      const fits = async () =>
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await fits();
      await page
        .locator(".product-hero")
        .screenshot({ path: test.info().outputPath("hero.png") });
      const demoNav = page.getByRole("navigation", { name: "Demo navigation" });
      for (const view of ["Dashboard", "Documents", "Chat"]) {
        await demoNav.getByRole("button", { name: view, exact: true }).click();
        await fits();
        await page.locator(".demo-grid").screenshot({
          path: test.info().outputPath(`demo-${view.toLowerCase()}.png`),
        });
      }
      if (screen.name === "short-laptop") {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await fits();
        expect(
          await page
            .locator(".demo-sidebar")
            .evaluate(
              (sidebar) => sidebar.scrollWidth <= sidebar.clientWidth + 1,
            ),
          "enlarged demo navigation should not need horizontal scrolling",
        ).toBe(true);
        await page.locator(".demo-grid").screenshot({
          path: test.info().outputPath("demo-text-200.png"),
        });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "";
        });
      }
      await page.goto("/app?auth=signup");
      await expect(
        page.getByRole("heading", { name: "Create your FolioAsk account" }),
      ).toBeVisible();
      await fits();
      await page.screenshot({
        path: test.info().outputPath("signup.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Back to sign in", exact: true })
        .click();
      await page
        .getByLabel("Email", { exact: true })
        .fill(`responsive-${crypto.randomUUID()}@example.test`);
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
      const nav = page.getByRole("navigation", {
        name: "Project navigation",
        includeHidden: true,
      });
      await openNavigation(page);
      await expect(nav.getByRole("button")).toHaveCount(4);
      if (screen.width <= 960) {
        const rowCounts = await nav
          .getByRole("button")
          .evaluateAll((buttons) => {
            const rows = new Map<number, number>();
            for (const button of buttons) {
              const row = Math.round(button.getBoundingClientRect().top);
              rows.set(row, (rows.get(row) ?? 0) + 1);
            }
            return [...rows.values()];
          });
        expect(new Set(rowCounts).size, "navigation rows stay balanced").toBe(
          1,
        );
      }
      await openProjectView(page, "Documents");
      await page
        .getByRole("button", { name: "Add document", exact: true })
        .click();
      await page.getByLabel("Choose document").setInputFiles({
        name: "Construction agreement.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await samplePdf()),
      });
      await confirmPublicUpload(page);
      await page
        .getByRole("button", { name: "Upload document", exact: true })
        .click();
      await expect(page.getByText("Ready · 1 page")).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("source.png") });
      await page
        .getByRole("button", { name: "Close source", exact: true })
        .click();
      await openProjectView(page, "Chat");
      await page
        .getByLabel("Your question")
        .fill("When are shop drawings due?");
      await page.getByRole("button", { name: "Ask selected document" }).click();
      await expect(page.locator(".saved-answer")).toHaveCount(1);
      for (const theme of ["light", "dark"]) {
        if (theme === "dark")
          await page
            .getByRole("button", { name: "Switch to dark mode" })
            .click();
        for (const view of ["Dashboard", "Documents", "Chat", "Settings"]) {
          await openProjectView(page, view);
          if (view === "Dashboard")
            await expect(
              page.getByLabel("Active documents", { exact: true }),
            ).toHaveText("1");
          await fits();
          if (view === "Documents" && screen.width <= 600) {
            const trash = page.getByRole("button", {
              name: "Move Construction agreement.pdf to Trash",
            });
            await expect(trash).toBeVisible();
            const bounds = (await trash.boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(screen.width);
            expect(
              await page
                .getByRole("table", { name: "Project documents" })
                .evaluate(
                  (table) => table.scrollWidth <= table.clientWidth + 1,
                ),
            ).toBe(true);
          }
          await page.screenshot({
            path: test.info().outputPath(`${view.toLowerCase()}-${theme}.png`),
            fullPage: true,
          });
          if (screen.width <= 760) {
            expect
              .soft(
                (await page.locator(".mobile-navigation-toggle").boundingBox())!
                  .height,
                "navigation should not dominate the small screen",
              )
              .toBeLessThanOrEqual(310);
            expect
              .soft(
                (await page.locator(".project-content").boundingBox())!.width,
                "tablet content should use available width",
              )
              .toBeGreaterThanOrEqual(screen.width * 0.85);
          }
          if (view === "Settings") {
            const sections = page.getByRole("navigation", {
              name: "Settings sections",
            });
            for (const section of [
              "Project",
              "Appearance",
              "Usage",
              "Account",
            ]) {
              await sections
                .getByRole("button", { name: section, exact: true })
                .click();
              await fits();
            }
          }
        }
      }
      await openProjectView(page, "Chat");
      const question = page.getByLabel("Your question");
      await question.fill("A follow-up draft to keep while resizing");
      if (screen.width <= 760) {
        const toggle = page.getByRole("button", {
          name: "Toggle navigation",
          exact: true,
        });
        await toggle.focus();
        await page.keyboard.press("Enter");
        await expect(nav).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(nav).toBeHidden();
        await expect(toggle).toBeFocused();
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(nav).toBeVisible();
        await fits();
        await page.setViewportSize({
          width: screen.width,
          height: screen.height,
        });
        await expect(nav).toBeHidden();
        await toggle.focus();
        await page.keyboard.press("Enter");
        await expect(nav).toBeVisible();
        await page
          .getByRole("button", { name: "Close navigation", exact: true })
          .click();
      }
      await question.focus();
      await expect(question).toBeInViewport();
      await expect(question).toHaveValue(
        "A follow-up draft to keep while resizing",
      );
      await fits();
      if (screen.name === "short-laptop") {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        for (const view of ["Dashboard", "Documents", "Chat", "Settings"]) {
          await openProjectView(page, view);
          await fits();
          expect(
            await page
              .locator(".project-sidebar")
              .evaluate(
                (sidebar) => sidebar.scrollWidth <= sidebar.clientWidth + 1,
              ),
            "enlarged navigation should not need horizontal scrolling",
          ).toBe(true);
        }
        await page.screenshot({
          path: test.info().outputPath("short-laptop-text-200.png"),
          fullPage: true,
        });
      }
    });
  });
}
