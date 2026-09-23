import type { DocumentRecord } from "../server/documents";
import type { Citation } from "../server/answers";
import { mountAnswers } from "./answers";
import type { ConversationSummary } from "./conversations";
import { sourceDrawer } from "./source-drawer";
import { mountDocumentTable } from "./document-table";
import { labelWithIcon } from "./icons";
import { mountPlanUsage } from "./plan-usage";
import type { PlanUsage } from "../server/storage-limits";

export type Api = <T>(
  path: string,
  method?: string,
  data?: unknown,
) => Promise<T>;
export function mountDocuments(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  onUnauthorized: () => void,
  onHistory?: (history: ConversationSummary[]) => void,
) {
  root.classList.add("evidence-workspace");
  root.innerHTML = `<section class="upload-section"><h3>Documents</h3><p class="quiet">Controlled pilot: public, non-sensitive, operator-approved fixtures only. No patient records, confidential files or specially regulated data. A checkbox is not proof of eligibility.</p><a href="/fixtures/contract.pdf" download class="citation">Download synthetic test PDF</a><p id="upload-usage"></p><form id="upload-form"><label>Choose PDF<input type="file" accept="application/pdf" required></label><button class="primary" type="submit">Upload PDF</button></form><p role="status" id="upload-status"></p><div class="document-buttons" id="document-buttons"></div><section id="document-preview" aria-label="Document preview"></section></section>`;
  const status = root.querySelector<HTMLElement>("#upload-status")!;
  const usagePanel = document.createElement("section");
  usagePanel.setAttribute("aria-label", "Document allowance");
  root.querySelector("#document-buttons")!.after(usagePanel);
  usagePanel.className = "document-capacity";
  const tools = document.createElement("div");
  tools.className = "document-intro-tools";
  const sampleLink = root.querySelector<HTMLAnchorElement>("a[download]")!;
  sampleLink.before(tools);
  tools.append(root.querySelector("#upload-usage")!, sampleLink);
  const planUsage = mountPlanUsage(usagePanel, "storage");
  let allowance: PlanUsage | undefined;
  let uploading = false;
  const form = root.querySelector<HTMLFormElement>("#upload-form")!;
  form.hidden = true;
  const add = document.createElement("button");
  labelWithIcon(add, "Plus", "Add document");
  add.className = "primary";
  add.setAttribute("aria-expanded", "false");
  add.setAttribute("aria-controls", "upload-form");
  const sectionTitle = root.querySelector<HTMLElement>(".upload-section > h3")!;
  const heading = document.createElement("header");
  heading.className = "page-heading";
  const introduction = document.createElement("div");
  introduction.innerHTML = '<p class="eyebrow">YOUR SOURCE LIBRARY</p>';
  sectionTitle.before(heading);
  introduction.append(sectionTitle);
  const description = document.createElement("p");
  description.className = "page-description";
  description.textContent =
    "Keep your project documents organized and ready to explore.";
  introduction.append(description);
  heading.append(introduction, add);
  const policy = root.querySelector<HTMLElement>(".upload-section > .quiet")!;
  policy.className = "pilot-notice";
  policy.textContent =
    "Controlled pilot · Approved synthetic PDFs only. No patient records, confidential or regulated sensitive files.";
  labelWithIcon(sampleLink, "Download", "Download synthetic test PDF");
  add.onclick = () => {
    form.hidden = !form.hidden;
    add.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) input.focus();
  };
  const input = form.querySelector<HTMLInputElement>("input")!;
  const submit = form.querySelector<HTMLButtonElement>("button")!;
  function updateUploadControls() {
    const blocked =
      !allowance ||
      allowance.uploadsRemaining === 0 ||
      allowance.storageRemainingBytes === 0 ||
      allowance.uploadsPaused;
    submit.disabled = uploading || blocked;
    input.disabled = uploading || blocked;
    add.disabled = uploading || blocked;
  }
  updateUploadControls();
  labelWithIcon(submit, "Upload", "Upload PDF");
  const preview = root.querySelector<HTMLElement>("#document-preview")!;
  let retryKey = crypto.randomUUID();
  let sequence = 0;
  let disposed = false;
  let activeUpload: XMLHttpRequest | undefined;
  let activeDownload: AbortController | undefined;
  let releasePdf = () => {};
  const uploadSection = root.querySelector<HTMLElement>(".upload-section")!;
  const drawer = sourceDrawer(root, () => {
    sequence++;
    activeDownload?.abort();
    releasePdf();
    releasePdf = () => {};
  });
  const previewStatus = document.createElement("p");
  previewStatus.setAttribute("role", "status");
  previewStatus.setAttribute("aria-label", "Source status");
  drawer.body.append(previewStatus, preview);
  const answerRoot = document.createElement("div");
  root.append(answerRoot);
  const answers = mountAnswers(
    answerRoot,
    workspaceId,
    api,
    async (citation) => {
      await openDocument(citation.documentId, citation);
    },
    onHistory,
  );
  const tableRoot = root.querySelector<HTMLElement>("#document-buttons")!;
  tableRoot.className = "document-table";
  const table = mountDocumentTable(
    tableRoot,
    (id) => void openDocument(id),
    async (document, trashed) => {
      await api(
        `/documents/${document.id}${trashed ? "" : "/restore"}`,
        trashed ? "DELETE" : "POST",
      );
      await refresh();
    },
  );
  input.onchange = () => {
    retryKey = crypto.randomUUID();
  };
  async function openDocument(id: string, citation?: Citation) {
    if (disposed) return;
    const status = previewStatus;
    preview.replaceChildren();
    drawer.show();
    const current = ++sequence;
    activeDownload?.abort();
    releasePdf();
    releasePdf = () => {};
    const download = new AbortController();
    activeDownload = download;
    status.textContent = "Loading original…";
    try {
      const document = await api<DocumentRecord>(`/documents/${id}`);
      if (disposed || current !== sequence) return;
      if (document.deletedAt !== undefined) {
        status.textContent = `${document.name} is in Trash. Restore it from Documents to inspect this source. Saved answers are preserved.`;
        return;
      }
      const response = await fetch(`/api/documents/${id}/original`, {
        signal: download.signal,
      });
      if (response.status === 401) onUnauthorized();
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(
          typeof failure?.error === "string"
            ? failure.error
            : "Original unavailable. Sign in again or retry.",
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      try {
        if (disposed || current !== sequence || !root.isConnected) return;
        let renderTask: { cancel(): void } | undefined;
        releasePdf = () => {
          renderTask?.cancel();
          void pdf.loadingTask.destroy().catch(() => {});
        };
        preview.replaceChildren();
        const title = documentNode("h4", document.name);
        const pager = documentNode("div", "");
        pager.className = "page-controls";
        const previous = documentNode("button", "Previous page");
        previous.type = "button";
        const next = documentNode("button", "Next page");
        next.type = "button";
        const label = documentNode("span", "");
        pager.append(previous, label, next);
        const canvas = documentNode("canvas", "");
        const surface = documentNode("div", "");
        surface.className = "pdf-surface";
        surface.append(canvas);
        const text = documentNode("pre", "");
        text.className = "extracted-text";
        preview.append(
          title,
          pager,
          surface,
          documentNode("h4", "Extracted page text"),
          text,
        );
        let pageNumber = citation?.page ?? 1;
        async function renderPage() {
          if (disposed || current !== sequence) return;
          previous.disabled = true;
          next.disabled = true;
          try {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.setAttribute("aria-label", `Original page ${pageNumber}`);
            const task = page.render({ canvas, viewport });
            renderTask = task;
            await task.promise;
            if (disposed || current !== sequence) return;
            label.textContent = `Page ${pageNumber} of ${pdf.numPages}`;
            text.replaceChildren();
            surface.querySelector(".source-highlight")?.remove();
            for (const passage of document.pages[pageNumber - 1].passages) {
              const highlighted =
                citation?.page === pageNumber &&
                citation.passageId === passage.id;
              text.append(
                documentNode(highlighted ? "mark" : "span", passage.text),
                "\n",
              );
              if (highlighted) {
                const highlight = documentNode("div", "");
                highlight.className = "source-highlight";
                highlight.setAttribute(
                  "aria-label",
                  "Highlighted source passage",
                );
                highlight.setAttribute("role", "img");
                const pageData = document.pages[pageNumber - 1];
                const box = passage.box;
                Object.assign(highlight.style, {
                  left: `${(box.x / pageData.width) * 100}%`,
                  top: `${(box.y / pageData.height) * 100}%`,
                  width: `${(box.width / pageData.width) * 100}%`,
                  height: `${(box.height / pageData.height) * 100}%`,
                });
                surface.append(highlight);
                highlight.scrollIntoView({
                  block: "center",
                  behavior: "instant",
                });
              }
            }
            status.textContent = `Ready · ${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`;
          } catch {
            if (disposed || current !== sequence) return;
            status.textContent =
              "Original could not be rendered. Download it to inspect; extracted text may be incomplete.";
          } finally {
            previous.disabled = pageNumber === 1;
            next.disabled = pageNumber === pdf.numPages;
          }
        }
        previous.onclick = () => {
          pageNumber--;
          void renderPage();
        };
        next.onclick = () => {
          pageNumber++;
          void renderPage();
        };
        await renderPage();
      } finally {
        if (disposed || current !== sequence || !root.isConnected)
          await pdf.loadingTask.destroy();
      }
    } catch (error) {
      if (!disposed && current === sequence)
        status.textContent =
          error instanceof Error ? error.message : "Could not open document.";
    }
  }
  async function refresh() {
    const usage = await api<PlanUsage>("/usage");
    if (disposed) return;
    allowance = usage;
    planUsage.update(usage);
    updateUploadControls();
    root.querySelector("#upload-usage")!.textContent =
      `${usage.uploadsRemaining} of 3 lifetime uploads remaining`;
    const documents = await api<DocumentRecord[]>(
      `/workspaces/${workspaceId}/documents`,
    );
    if (disposed) return;
    table.setDocuments(documents);
    answers.setDocuments(documents);
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (disposed || uploading || submit.disabled || !allowance) return;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      status.textContent = "Free files must be 10 MB or smaller.";
      return;
    }
    if (file.size > allowance.storageRemainingBytes) {
      status.textContent =
        "This file exceeds your remaining free storage. Use Upgrade plan to view more-capacity options.";
      return;
    }
    uploading = true;
    updateUploadControls();
    submit.disabled = true;
    input.disabled = true;
    status.textContent = "Uploading…";
    const xhr = new XMLHttpRequest();
    activeUpload = xhr;
    xhr.timeout = 60_000;
    xhr.open(
      "POST",
      `/api/workspaces/${workspaceId}/documents?name=${encodeURIComponent(file.name)}`,
    );
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader("Idempotency-Key", retryKey);
    xhr.upload.onprogress = (event) => {
      status.textContent = event.lengthComputable
        ? `Uploading · ${Math.round((event.loaded / event.total) * 100)}%`
        : "Uploading…";
    };
    xhr.upload.onload = () => {
      status.textContent = "Reading PDF and saving…";
    };
    xhr.onerror = () => {
      if (disposed) return;
      status.textContent =
        "Connection failed. Retry this file; your retry key is preserved.";
      uploading = false;
      updateUploadControls();
      void refresh().catch(() => {});
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onload = () => {
      void (async () => {
        if (disposed) return;
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status === 401) onUnauthorized();
          if (xhr.status >= 400) {
            await refresh().catch(() => {});
            throw new Error(result.error || "Upload failed.");
          }
          await refresh();
          status.textContent = `Uploaded ${file.name}. Your document is ready.`;
          await openDocument(result.id);
          input.value = "";
          retryKey = crypto.randomUUID();
        } catch (error) {
          status.textContent =
            error instanceof Error
              ? error.message
              : "Upload failed. Retry the same file.";
        } finally {
          uploading = false;
          updateUploadControls();
        }
      })();
    };
    xhr.send(file);
  };
  return {
    openDocument,
    openConversation: answers.openConversation,
    show(view: "documents" | "chat") {
      answerRoot.hidden = view === "documents";
      uploadSection.hidden = view === "chat";
      root.dataset.view = view;
    },
    ready: Promise.all([refresh(), answers.refresh()]).then(() => {}),
    dispose() {
      disposed = true;
      table.dispose();
      drawer.dispose();
      answers.dispose();
      planUsage.dispose();
      sequence++;
      activeUpload?.abort();
      activeDownload?.abort();
      releasePdf();
    },
  };
}
function documentNode<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
