import type { DocumentRecord } from "../server/documents";

type Api = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
export async function mountDocuments(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  onUnauthorized: () => void,
) {
  root.innerHTML = `<section class="upload-section"><h3>Documents</h3><p class="quiet">Controlled pilot: public, non-sensitive, operator-approved fixtures only. No patient records, confidential files or specially regulated data. A checkbox is not proof of eligibility.</p><a href="/fixtures/contract.pdf" download class="citation">Download synthetic test PDF</a><p id="upload-usage"></p><form id="upload-form"><label>Choose PDF<input type="file" accept="application/pdf" required></label><button class="primary" type="submit">Upload PDF</button></form><p role="status" id="upload-status"></p><div class="document-buttons" id="document-buttons"></div><section id="document-preview" aria-label="Document preview"></section></section>`;
  const status = root.querySelector<HTMLElement>("#upload-status")!;
  const form = root.querySelector<HTMLFormElement>("#upload-form")!;
  const input = form.querySelector<HTMLInputElement>("input")!;
  const submit = form.querySelector<HTMLButtonElement>("button")!;
  const preview = root.querySelector<HTMLElement>("#document-preview")!;
  let retryKey = crypto.randomUUID();
  let sequence = 0;
  input.onchange = () => {
    retryKey = crypto.randomUUID();
  };
  async function openDocument(id: string) {
    const current = ++sequence;
    status.textContent = "Loading original…";
    try {
      const document = await api<DocumentRecord>(`/documents/${id}`);
      const response = await fetch(`/api/documents/${id}/original`);
      if (response.status === 401) onUnauthorized();
      if (!response.ok)
        throw new Error("Original unavailable. Sign in again or retry.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      try {
        if (current !== sequence || !root.isConnected) return;
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
        const text = documentNode("pre", "");
        text.className = "extracted-text";
        preview.append(
          title,
          pager,
          canvas,
          documentNode("h4", "Extracted page text"),
          text,
        );
        let pageNumber = 1;
        async function renderPage() {
          previous.disabled = true;
          next.disabled = true;
          try {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.setAttribute("aria-label", `Original page ${pageNumber}`);
            await page.render({ canvas, viewport }).promise;
            label.textContent = `Page ${pageNumber} of ${pdf.numPages}`;
            text.textContent = document.pages[pageNumber - 1].passages
              .map((passage) => passage.text)
              .join("\n");
            status.textContent = `Ready · ${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`;
          } catch {
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
        // Release the PDF task when another document replaces this preview.
        const observer = new MutationObserver(() => {
          if (!canvas.isConnected) {
            observer.disconnect();
            void pdf.loadingTask.destroy();
          }
        });
        observer.observe(root, { childList: true, subtree: true });
      } finally {
        if (current !== sequence || !root.isConnected)
          await pdf.loadingTask.destroy();
      }
    } catch (error) {
      if (current === sequence)
        status.textContent =
          error instanceof Error ? error.message : "Could not open document.";
    }
  }
  async function refresh() {
    const usage = await api<{ uploadsRemaining: number }>("/usage");
    root.querySelector("#upload-usage")!.textContent =
      `${usage.uploadsRemaining} of 3 lifetime uploads remaining`;
    const documents = await api<DocumentRecord[]>(
      `/workspaces/${workspaceId}/documents`,
    );
    const buttons = root.querySelector("#document-buttons")!;
    buttons.replaceChildren();
    for (const document of documents) {
      const button = documentNode("button", document.name);
      button.type = "button";
      button.onclick = () => void openDocument(document.id);
      buttons.append(button);
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      status.textContent = "Free files must be 10 MB or smaller.";
      return;
    }
    submit.disabled = true;
    input.disabled = true;
    status.textContent = "Uploading…";
    const xhr = new XMLHttpRequest();
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
      status.textContent =
        "Connection failed. Retry this file; your retry key is preserved.";
      submit.disabled = false;
      input.disabled = false;
    };
    xhr.onload = () => {
      void (async () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status === 401) onUnauthorized();
          if (xhr.status >= 400)
            throw new Error(result.error || "Upload failed.");
          await refresh();
          await openDocument(result.id);
          input.value = "";
          retryKey = crypto.randomUUID();
        } catch (error) {
          status.textContent =
            error instanceof Error
              ? error.message
              : "Upload failed. Retry the same file.";
        } finally {
          submit.disabled = false;
          input.disabled = false;
        }
      })();
    };
    xhr.send(file);
  };
  await refresh();
}
function documentNode<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
