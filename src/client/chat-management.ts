import type { Conversation } from "../server/conversations";
import type { Api } from "./documents";
import { labelWithIcon } from "./icons";

export function mountChatManagement(
  root: HTMLElement,
  picker: HTMLSelectElement,
  workspaceId: string,
  api: Api,
  refreshed: () => Promise<void>,
) {
  root.className = "chat-management";
  root.innerHTML = `<div class="chat-title-row"><h3>New conversation</h3><button type="button" class="chat-more" aria-label="Conversation actions" aria-expanded="false">•••</button></div><div class="chat-actions" hidden><button type="button" data-action="rename">Rename</button><button type="button" data-action="archive">Archive</button><button type="button" data-action="delete">Delete</button></div><details class="chat-library"><summary>Chat history</summary><label>Search conversations<input type="search" placeholder="Find a conversation"></label><label class="acknowledgement"><input type="checkbox">Show archived conversations</label><div class="chat-picker"></div><p class="quiet library-empty" hidden>No conversations match your search.</p></details><p class="quiet archive-notice" hidden>This conversation is archived. Restore it to ask more questions.</p><p role="status"></p><dialog aria-labelledby="chat-dialog-title"><form><h2 id="chat-dialog-title"></h2><p class="dialog-description"></p><label>Conversation title<input name="title" maxlength="100" required></label><p role="status" class="dialog-error"></p><div class="form-actions"><button type="button" class="cancel">Cancel</button><button type="submit" class="primary confirm">Save title</button></div></form></dialog>`;
  const more = root.querySelector<HTMLButtonElement>(".chat-more")!;
  const actions = root.querySelector<HTMLElement>(".chat-actions")!;
  const title = root.querySelector("h3")!;
  const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
  const archived = root.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  const dialog = root.querySelector<HTMLDialogElement>("dialog")!;
  const dialogForm = dialog.querySelector("form")!;
  const titleInput = dialog.querySelector<HTMLInputElement>(
    'input[name="title"]',
  )!;
  const confirm = dialog.querySelector<HTMLButtonElement>(".confirm")!;
  const status = root.querySelector<HTMLElement>(':scope > [role="status"]')!;
  root.querySelector(".chat-picker")!.append(picker.parentElement!);
  let chats: Conversation[] = [],
    current: Conversation | undefined;
  let disposed = false,
    busy = false,
    submitting = false;
  let action: "rename" | "delete" = "rename";
  const endpoint = () =>
    `/workspaces/${workspaceId}/conversations/${current!.id}`;
  function closeActions() {
    actions.hidden = true;
    more.setAttribute("aria-expanded", "false");
  }
  function renderPicker() {
    const filtered = chats.filter(
      (chat) =>
        chat.archived === archived.checked &&
        chat.title.toLowerCase().includes(search.value.trim().toLowerCase()),
    );
    picker.replaceChildren(new Option("Select a conversation", ""));
    for (const chat of filtered) picker.append(new Option(chat.title, chat.id));
    picker.value =
      current && filtered.some((chat) => chat.id === current!.id)
        ? current.id
        : "";
    root.querySelector<HTMLElement>(".library-empty")!.hidden =
      filtered.length > 0;
  }
  async function mutate(method: string, body: unknown) {
    if (!current || disposed || submitting) return;
    submitting = true;
    confirm.disabled = true;
    more.disabled = true;
    dialog.querySelector<HTMLElement>(".dialog-error")!.textContent = "";
    status.textContent = "Saving conversation changes…";
    try {
      await api(endpoint(), method, body);
      if (disposed) return;
      dialog.close();
      closeActions();
      await refreshed();
      if (!disposed) status.textContent = "Conversation updated.";
    } catch (error) {
      if (!disposed) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not save. Please retry.";
        status.textContent = message;
        dialog.querySelector<HTMLElement>(".dialog-error")!.textContent =
          message;
      }
    } finally {
      submitting = false;
      if (!disposed) {
        confirm.disabled = false;
        more.disabled = busy || !current;
      }
    }
  }
  more.onclick = () => {
    actions.hidden = !actions.hidden;
    more.setAttribute("aria-expanded", String(!actions.hidden));
  };
  root.onkeydown = (event) => {
    if (event.key === "Escape" && !dialog.open) {
      closeActions();
      more.focus();
    }
  };
  search.oninput = renderPicker;
  archived.onchange = renderPicker;
  const archiveButton = root.querySelector<HTMLButtonElement>(
    '[data-action="archive"]',
  )!;
  archiveButton.onclick = () => {
    if (current && !busy) void mutate("PATCH", { archived: !current.archived });
  };
  for (const kind of ["rename", "delete"] as const) {
    root.querySelector<HTMLButtonElement>(`[data-action="${kind}"]`)!.onclick =
      () => {
        if (!current || busy || submitting) return;
        action = kind;
        dialog.querySelector("h2")!.textContent =
          kind === "rename"
            ? "Rename conversation"
            : "Delete this conversation?";
        dialog.querySelector(".dialog-description")!.textContent =
          kind === "rename"
            ? "Choose a title you can recognize later."
            : "Its saved questions and answers will be permanently removed. Source documents and lifetime usage are unchanged.";
        titleInput.parentElement!.hidden = kind !== "rename";
        titleInput.required = kind === "rename";
        titleInput.value = current.title;
        confirm.textContent =
          kind === "rename" ? "Save title" : "Delete conversation";
        dialog.querySelector(".dialog-error")!.textContent = "";
        dialog.showModal();
        (kind === "rename"
          ? titleInput
          : dialog.querySelector<HTMLButtonElement>(".cancel")!
        ).focus();
      };
  }
  dialog.querySelector<HTMLButtonElement>(".cancel")!.onclick = () =>
    dialog.close();
  dialog.onclose = () => {
    if (!disposed) more.focus();
  };
  dialogForm.onsubmit = (event) => {
    event.preventDefault();
    void mutate(
      action === "delete" ? "DELETE" : "PATCH",
      action === "delete" ? { confirm: true } : { title: titleInput.value },
    );
  };
  return {
    update(items: Conversation[], id: string | undefined, pending: boolean) {
      chats = items;
      current = chats.find((chat) => chat.id === id);
      busy = pending;
      title.textContent = current?.title ?? "New conversation";
      more.disabled = pending || submitting || !current;
      labelWithIcon(
        archiveButton,
        "Restore",
        current?.archived ? "Restore" : "Archive",
      );
      root.querySelector<HTMLElement>(".archive-notice")!.hidden =
        !current?.archived;
      if (pending) closeActions();
      renderPicker();
    },
    dispose() {
      disposed = true;
      dialog.close();
      root.replaceChildren();
    },
  };
}
