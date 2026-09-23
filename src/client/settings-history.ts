import type { Conversation } from "../server/conversations";
import type { Api } from "./documents";
import { mountChatManagement } from "./chat-management";
import { labelWithIcon } from "./icons";

/** Settings uses the same owned-project actions as the conversation workspace. */
export function mountSettingsHistory(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  changed: () => void,
) {
  root.classList.add("settings-history");
  root.innerHTML = `<h3>Chat history</h3><p class="page-description">Manage saved conversations in the current project. Other projects are not affected.</p><div class="history-manager"></div><section class="history-danger"><h4>Clear this project's history</h4><p>Includes active and archived conversations. Source documents remain saved, and lifetime answer limits do not reset.</p><button type="button" disabled>Clear project history</button><p role="status" aria-label="History settings status"></p></section><dialog aria-label="Clear project history"><h2>Clear history in this project?</h2><p>All saved questions and answers in this project will be permanently deleted. This cannot be undone. Documents and other projects are unchanged.</p><div class="form-actions"><button type="button" class="cancel">Cancel</button><button type="button" class="confirm">Delete all conversations</button></div></dialog>`;
  const managerRoot = root.querySelector<HTMLElement>(".history-manager")!;
  const label = document.createElement("label");
  label.textContent = "Conversation";
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", "Conversation");
  label.append(picker);
  managerRoot.append(label);
  const clear = root.querySelector<HTMLButtonElement>(
    ".history-danger button",
  )!;
  labelWithIcon(clear, "Trash", "Clear project history");
  const status = root.querySelector<HTMLElement>(
    '[aria-label="History settings status"]',
  )!;
  const dialog = root.querySelector<HTMLDialogElement>(":scope > dialog")!;
  const cancel = dialog.querySelector<HTMLButtonElement>(".cancel")!;
  const confirm = dialog.querySelector<HTMLButtonElement>(".confirm")!;
  let items: Conversation[] = [];
  let selected: string | undefined;
  let disposed = false,
    busy = false,
    stopRequested = false,
    actionPending = false,
    revision = 0;
  const manager = mountChatManagement(
    managerRoot,
    picker,
    workspaceId,
    api,
    async () => {
      changed();
      await refresh();
    },
    (pending) => {
      actionPending = pending;
      clear.disabled = busy || pending || !items.length;
    },
  );
  manager.library.open = true;
  function render() {
    manager.update(items, selected, busy);
    clear.disabled = busy || actionPending || !items.length;
  }
  picker.onchange = () => {
    if (!busy && !actionPending) {
      selected = picker.value || undefined;
      render();
    }
  };
  async function refresh() {
    const current = ++revision;
    try {
      const results = await api<Conversation[]>(
        `/workspaces/${workspaceId}/conversations`,
      );
      if (disposed || current !== revision) return;
      items = results;
      if (!items.some((item) => item.id === selected)) selected = undefined;
      render();
    } catch (error) {
      if (!disposed && current === revision) {
        items = [];
        selected = undefined;
        render();
        status.textContent =
          error instanceof Error
            ? error.message
            : "Could not load chat history. Please retry.";
      }
    }
  }
  clear.onclick = () => {
    if (busy || actionPending) return;
    dialog.showModal();
    cancel.focus();
  };
  function stopClearing() {
    if (!busy) return;
    stopRequested = true;
    status.textContent =
      "Stopping after the current deletion. It may still complete; no further deletions will be started. You can continue using the workspace.";
  }
  cancel.onclick = () => {
    stopClearing();
    dialog.close();
  };
  dialog.oncancel = stopClearing;
  dialog.onclose = () => {
    if (!disposed && !clear.disabled) clear.focus();
  };
  confirm.onclick = () => {
    if (busy || disposed) return;
    const targets = items.map((item) => item.id);
    busy = true;
    stopRequested = false;
    render();
    confirm.disabled = true;
    cancel.textContent = "Stop clearing";
    status.textContent = "Clearing this project's history…";
    void (async () => {
      let removed = 0;
      try {
        for (const id of targets) {
          if (disposed) return;
          if (stopRequested) break;
          await api(
            `/workspaces/${workspaceId}/conversations/${id}`,
            "DELETE",
            { confirm: true },
          );
          removed++;
        }
        if (!disposed)
          status.textContent = stopRequested
            ? `Clearing stopped. Deleted ${removed} of ${targets.length} conversations. Remaining history is unchanged.`
            : "Project chat history cleared. Documents and lifetime limits are unchanged.";
      } catch {
        if (!disposed)
          status.textContent = `Deleted ${removed} of ${targets.length} conversations. Some history could not be deleted; review the remaining conversations and retry.`;
      } finally {
        if (!disposed) {
          changed();
          await refresh();
          if (!disposed) {
            const wasOpen = dialog.open;
            busy = false;
            confirm.disabled = false;
            cancel.textContent = "Cancel";
            dialog.close();
            render();
            status.tabIndex = -1;
            if (wasOpen && status.checkVisibility()) status.focus();
          }
        }
      }
    })();
  };
  return {
    refresh,
    dispose() {
      disposed = true;
      revision++;
      manager.dispose();
      dialog.close();
      root.replaceChildren();
    },
  };
}
