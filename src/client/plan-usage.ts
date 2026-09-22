import type { PlanUsage } from "../server/storage-limits";
import { labelWithIcon } from "./icons";

export function mountPlanUsage(
  root: HTMLElement,
  mode: "storage" | "answers" | "all",
) {
  root.classList.add("plan-usage");
  root.hidden = true;
  root.innerHTML = `<div class="plan-usage-summary"><div><strong>Free pilot allowance</strong><p class="storage-label"></p></div><button type="button">Upgrade plan</button></div><meter min="0" max="100" value="0" aria-label="Account storage used"></meter><p class="plan-notice" role="status"></p><p class="plan-footnote quiet">Account-wide limits do not reset monthly. Files in Trash still count toward storage.</p>`;
  const label = root.querySelector<HTMLElement>(".storage-label")!;
  const notice = root.querySelector<HTMLElement>(".plan-notice")!;
  const meter = root.querySelector<HTMLMeterElement>("meter")!;
  const upgrade = root.querySelector<HTMLButtonElement>("button")!;
  labelWithIcon(upgrade, "Usage", "Upgrade plan");
  const dialog = document.createElement("dialog");
  dialog.className = "upgrade-dialog";
  dialog.setAttribute("aria-label", "Upgrade your plan");
  dialog.innerHTML = `<header><h2>Upgrade your plan</h2><button type="button" autofocus>Close upgrade</button></header><p class="badge">Paid plans are coming soon</p><p>Need more capacity? Higher storage and usage allowances are planned, but pricing and checkout are not available yet.</p><section><h3>Your current free pilot</h3><p>3 lifetime uploads · 30 MB storage · 20 lifetime AI answers</p><p class="quiet">10 MB per PDF. Approved synthetic documents only. Your saved documents and answers remain available after reaching a limit.</p></section><p>No payment will be taken. Clicking Upgrade does not change your plan or unlock additional storage.</p><button type="button" disabled>Checkout not available yet</button>`;
  const close = dialog.querySelector<HTMLButtonElement>("header button")!;
  labelWithIcon(close, "Close", "Close upgrade");
  close.onclick = () => dialog.close();
  root.append(dialog);
  upgrade.onclick = () => dialog.showModal();
  dialog.addEventListener("keydown", (event) => {
    // Close is the only enabled control while checkout is unavailable.
    if (event.key === "Tab") {
      event.preventDefault();
      close.focus();
    }
  });
  dialog.addEventListener("close", () => {
    if (upgrade.isConnected) upgrade.focus();
  });
  return {
    update(usage: PlanUsage) {
      const used = usage.storedBytes + usage.reservedBytes;
      const uploadFull =
        usage.uploadsRemaining === 0 || usage.storageRemainingBytes === 0;
      const answersFull = usage.answersRemaining === 0;
      const reached =
        mode === "answers"
          ? answersFull
          : mode === "storage"
            ? uploadFull
            : uploadFull || answersFull;
      const near =
        (mode !== "storage" && usage.answers / usage.answerLimit >= 0.8) ||
        (mode !== "answers" &&
          (used / usage.storageLimitBytes >= 0.8 ||
            usage.uploads / usage.uploadLimit >= 0.8));
      // Keep ordinary chat focused on the conversation; surface its prompt near a limit.
      root.hidden = mode === "answers" && !reached && !near;
      meter.max = usage.storageLimitBytes;
      meter.value = Math.min(used, usage.storageLimitBytes);
      meter.high = usage.storageLimitBytes * 0.8;
      meter.low = 0;
      meter.optimum = 0;
      meter.hidden = mode === "answers";
      label.textContent =
        mode === "answers"
          ? `${usage.answers} / ${usage.answerLimit} lifetime answers used`
          : `${used > 0 && used < 10_000 ? "<0.01" : (used / 1_000_000).toFixed(2)} MB / ${(usage.storageLimitBytes / 1_000_000).toFixed(0)} MB used${usage.reservedBytes ? " (includes pending uploads)" : ""}`;
      root.dataset.level = reached ? "full" : near ? "warning" : "normal";
      const limitName =
        mode === "answers" || (mode === "all" && answersFull && !uploadFull)
          ? "answer"
          : usage.uploadsRemaining === 0
            ? "upload"
            : "storage";
      notice.textContent = reached
        ? `Free ${limitName} limit reached. View upgrade options for more capacity. Saved work remains available.`
        : near
          ? "You have used at least 80% of this free allowance. View upgrade options before you run out."
          : "More capacity planned. Paid checkout is not available yet.";
      if (
        mode !== "answers" &&
        uploadFull &&
        usage.reservedUploads > 0 &&
        usage.uploads < usage.uploadLimit
      )
        notice.textContent =
          "Your remaining free capacity is reserved by pending uploads. Wait for completion; contact the operator if an upload stays pending. Saved work remains available.";
      if (mode !== "answers" && usage.uploadsPaused)
        notice.textContent =
          "New uploads are temporarily paused by the shared storage safeguard. Upgrading cannot bypass this pause. Saved work remains available.";
      root.querySelector<HTMLElement>(".plan-footnote")!.hidden =
        mode === "answers";
    },
    dispose() {
      dialog.close();
      dialog.remove();
    },
  };
}
