import type { DocumentRecord } from "../server/documents";
import type { Citation } from "../server/answers";
import { labelWithIcon } from "./icons";

/** Office/text sources are escaped extracted text, never rendered as active HTML. */
export function showTextSource(
  root: HTMLElement,
  document: DocumentRecord,
  citation?: Citation,
) {
  root.replaceChildren();
  const title = window.document.createElement("h4");
  title.textContent = document.name;
  const notice = window.document.createElement("p");
  notice.className = "quiet";
  notice.textContent =
    document.extractionNotice ??
    "This is an extracted-text preview, not the original page layout.";
  const download = window.document.createElement("a");
  download.href = `/api/documents/${encodeURIComponent(document.id)}/original`;
  download.download = document.name;
  download.className = "citation";
  labelWithIcon(download, "Download", "Download original");
  const pager = window.document.createElement("div");
  pager.className = "page-controls";
  const previous = window.document.createElement("button");
  previous.type = "button";
  previous.textContent = "Previous section";
  const next = window.document.createElement("button");
  next.type = "button";
  next.textContent = "Next section";
  const label = window.document.createElement("span");
  const text = window.document.createElement("pre");
  text.className = "extracted-text";
  text.setAttribute("aria-label", "Extracted document text");
  pager.append(previous, label, next);
  root.append(title, notice, download, pager, text);
  let index = Math.max(
    0,
    Math.min(document.pages.length - 1, (citation?.page ?? 1) - 1),
  );
  function render() {
    const page = document.pages[index];
    label.textContent =
      page.label ?? `Section ${index + 1} of ${document.pages.length}`;
    text.replaceChildren();
    for (const passage of page.passages) {
      const highlighted =
        citation?.page === page.number && citation.passageId === passage.id;
      const line = window.document.createElement(highlighted ? "mark" : "span");
      line.textContent = passage.text;
      if (highlighted)
        line.setAttribute("aria-label", "Highlighted source passage");
      text.append(line, "\n");
    }
    previous.disabled = index === 0;
    next.disabled = index === document.pages.length - 1;
  }
  previous.onclick = () => {
    index--;
    render();
  };
  next.onclick = () => {
    index++;
    render();
  };
  render();
}
