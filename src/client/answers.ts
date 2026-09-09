import type { AnswerRecord, Citation } from "../server/answers";
import type { DocumentRecord } from "../server/documents";
import type { Api } from "./documents";

export function mountAnswers(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  onCitation: (citation: Citation) => Promise<void>,
) {
  root.innerHTML = `<section class="answer-panel"><h3>Ask your document</h3><p class="quiet">Answers can be wrong. Verify each source. No professional advice.</p><p id="answer-usage"></p><div id="answer-history"></div><form id="question-form"><label>Selected document<select required aria-label="Selected document"></select></label><label>Your question<textarea required maxlength="2000" rows="3" placeholder="When are the shop drawings due?"></textarea></label><button class="primary" type="submit">Ask selected document</button></form><p role="status" id="question-status"></p><p class="quiet">Successful “not found” answers count. Failed answers do not. Streaming comes in a later slice.</p></section>`;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const selection = root.querySelector<HTMLSelectElement>("select")!;
  const question = root.querySelector<HTMLTextAreaElement>("textarea")!;
  const button = root.querySelector<HTMLButtonElement>("button")!;
  const status = root.querySelector<HTMLElement>("#question-status")!;
  const history = root.querySelector<HTMLElement>("#answer-history")!;
  let requestKey = crypto.randomUUID();
  let disposed = false;
  let pending = false;
  function updateControls() {
    button.disabled = pending || disposed || selection.options.length === 0;
    question.disabled = pending || disposed;
    selection.disabled = pending || disposed;
  }
  question.oninput = () => {
    requestKey = crypto.randomUUID();
  };
  selection.onchange = () => {
    requestKey = crypto.randomUUID();
  };
  async function refresh() {
    const answers = await api<AnswerRecord[]>(
      `/workspaces/${workspaceId}/answers`,
    );
    const usage = await api<{ answersRemaining: number }>("/usage");
    if (disposed) return;
    root.querySelector("#answer-usage")!.textContent =
      `${usage.answersRemaining} of 20 lifetime answers remaining`;
    history.replaceChildren();
    for (const answer of answers) {
      const card = document.createElement("article");
      card.className = "saved-answer";
      const heading = document.createElement("h4");
      heading.textContent = answer.question;
      const label = document.createElement("p");
      label.className = "quiet";
      label.textContent =
        answer.providerMode === "simulated"
          ? "Simulated provider · Not live AI"
          : "Gemini answer · Verify the evidence";
      const text = document.createElement("p");
      text.textContent = answer.text;
      card.append(heading, label, text);
      for (const citation of answer.citations) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "citation";
        link.textContent = `Source · page ${citation.page}`;
        link.onclick = () => {
          void onCitation(citation).catch(() => {
            status.textContent = "Could not open the source. Please retry.";
          });
        };
        card.append(link);
      }
      history.append(card);
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (pending || disposed || !selection.value) return;
    pending = true;
    updateControls();
    status.textContent = "Retrieving evidence and asking the model…";
    void (async () => {
      try {
        await api(`/workspaces/${workspaceId}/answers`, "POST", {
          question: question.value,
          documentIds: [selection.value],
          requestKey,
        });
        await refresh();
        if (disposed) return;
        question.value = "";
        requestKey = crypto.randomUUID();
        status.textContent =
          "Answer saved. Inspect its sources below the answer.";
      } catch (error) {
        if (!disposed)
          status.textContent =
            error instanceof Error
              ? error.message
              : "Could not answer. Your draft is preserved.";
      } finally {
        pending = false;
        updateControls();
      }
    })();
  };
  return {
    refresh,
    dispose() {
      disposed = true;
    },
    setDocuments(documents: DocumentRecord[]) {
      const previous = selection.value;
      selection.replaceChildren();
      for (const document of documents) {
        const option = window.document.createElement("option");
        option.value = document.id;
        option.textContent = document.name;
        selection.append(option);
      }
      if (documents.some((document) => document.id === previous))
        selection.value = previous;
      updateControls();
    },
  };
}
