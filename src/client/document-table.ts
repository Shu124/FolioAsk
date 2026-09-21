import type { DocumentRecord } from "../server/documents";
import { labelWithIcon } from "./icons";

export function mountDocumentTable(
  root: HTMLElement,
  preview: (id: string) => void,
  changeTrash: (document: DocumentRecord, trashed: boolean) => Promise<void>,
) {
  root.innerHTML = `<div class="table-tools"><div class="section-tabs" aria-label="Document views"><button aria-pressed="true">Active</button><button aria-pressed="false">Trash</button></div><label>Search documents<input type="search"></label><label>Sort documents<select><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></label></div><p class="quiet">Trash keeps your files and saved citations. Restore at any time. Lifetime upload limits do not reset.</p><p role="status" class="table-status"></p><div class="table-scroll" tabindex="0" aria-label="Scrollable document table"><table aria-label="Project documents"><thead><tr><th scope="col">Name</th><th scope="col">Uploaded</th><th scope="col">Pages</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody></tbody></table></div>`;
  const search = root.querySelector<HTMLInputElement>("input")!;
  const sort = root.querySelector<HTMLSelectElement>("select")!;
  const body = root.querySelector("tbody")!;
  const status = root.querySelector<HTMLElement>(".table-status")!;
  const tabs = [
    ...root.querySelectorAll<HTMLButtonElement>(".section-tabs button"),
  ];
  labelWithIcon(tabs[0], "Documents", "Active");
  labelWithIcon(tabs[1], "Trash", "Trash");
  search.placeholder = "Search by document name…";
  let documents: DocumentRecord[] = [];
  let trash = false;
  let busy = false;
  let disposed = false;
  function render() {
    body.replaceChildren();
    const rows = documents.filter(
      (document) =>
        (document.deletedAt !== undefined) === trash &&
        document.name.toLowerCase().includes(search.value.toLowerCase()),
    );
    rows.sort((a, b) =>
      sort.value === "name"
        ? a.name.localeCompare(b.name)
        : sort.value === "oldest"
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
    );
    for (const document of rows) {
      const row = body.insertRow();
      const open = window.document.createElement("button");
      open.className = "table-document-name";
      labelWithIcon(open, "Documents", document.name);
      open.onclick = () => preview(document.id);
      row.insertCell().append(open);
      row.insertCell().textContent = new Date(
        document.createdAt,
      ).toLocaleString();
      row.insertCell().textContent = String(document.pages.length);
      const badge = window.document.createElement("span");
      badge.className = `status-pill ${trash ? "" : "status-ready"}`;
      labelWithIcon(
        badge,
        trash ? "Trash" : "Check",
        trash ? "In Trash" : "Ready",
      );
      row.insertCell().append(badge);
      const action = window.document.createElement("button");
      labelWithIcon(
        action,
        trash ? "Restore" : "Trash",
        trash ? "Restore" : "Move to Trash",
      );
      action.className = "table-action";
      action.setAttribute(
        "aria-label",
        trash ? `Restore ${document.name}` : `Move ${document.name} to Trash`,
      );
      action.disabled = busy;
      action.onclick = async () => {
        if (
          busy ||
          (!trash &&
            !window.confirm(
              `Move ${document.name} to Trash? Saved answers remain, but this document cannot answer new questions until restored. Upload limits do not reset.`,
            ))
        )
          return;
        busy = true;
        status.textContent = "Saving…";
        render();
        try {
          await changeTrash(document, !trash);
          if (!disposed) status.textContent = "Document updated.";
        } catch (error) {
          if (!disposed)
            status.textContent =
              error instanceof Error
                ? error.message
                : "Could not update document. Please retry.";
        } finally {
          busy = false;
          if (!disposed) render();
        }
      };
      row.insertCell().append(action);
    }
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 5;
      cell.className = "table-empty";
      cell.textContent = search.value
        ? "No matching documents."
        : "No documents here yet.";
    }
    tabs.forEach((tab, index) => {
      tab.setAttribute("aria-pressed", String(trash === (index === 1)));
      tab.disabled = busy;
    });
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => {
      trash = index === 1;
      render();
    };
  });
  search.oninput = render;
  sort.onchange = render;
  render();
  return {
    setDocuments(value: DocumentRecord[]) {
      if (!disposed) {
        documents = value;
        render();
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
