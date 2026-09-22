import type { AiCapacity } from "../server/ai-capacity";
import type { Api } from "./documents";
import { labelWithIcon } from "./icons";

export function mountAiCapacity(before: HTMLElement, api: Api) {
  const root = document.createElement("div");
  root.className = "plan-usage";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Shared AI capacity");
  root.innerHTML =
    '<strong>Shared free AI capacity</strong><p role="status"></p><button type="button">Refresh AI status</button>';
  before.before(root);
  const message = root.querySelector("p")!;
  const refreshButton = root.querySelector("button")!;
  labelWithIcon(refreshButton, "Refresh", "Refresh AI status");
  let disposed = false;
  let pending = false;
  async function refresh() {
    if (disposed || pending) return;
    pending = true;
    refreshButton.disabled = true;
    let capacity: AiCapacity;
    try {
      capacity = await api<AiCapacity>("/ai-capacity");
    } catch {
      capacity = { state: "unavailable" };
    }
    if (disposed) return;
    const state = capacity?.state;
    root.hidden = state === "simulated" || state === "available";
    root.dataset.level = state === "warning" ? "warning" : "full";
    message.textContent =
      state === "warning"
        ? "At least 80% of a shared Google quota is reserved. AI may pause soon at the safety cap. This capacity is shared by all users, separate from your answer allowance."
        : state === "paused"
          ? "Shared free AI capacity is paused. Retry after two minutes; daily limits reset at midnight Pacific time. An operator pause requires operator action. Upgrading cannot bypass this safeguard. Saved work remains available."
          : "Free AI capacity cannot be confirmed. New AI requests may be unavailable; saved work remains available. Contact the operator if this persists.";
    refreshButton.disabled = false;
    pending = false;
  }
  root.hidden = true;
  refreshButton.onclick = () => {
    void refresh();
  };
  const timer = window.setInterval(() => {
    void refresh();
  }, 60_000);
  void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      root.remove();
    },
  };
}
