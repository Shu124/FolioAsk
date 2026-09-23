import type { AnswerRecord, Citation } from "../server/answers";
import type { DocumentRecord } from "../server/documents";
import type { Api } from "./documents";
import type { ConversationSummary } from "./conversations";
import { icon, labelWithIcon } from "./icons";
import { mountPlanUsage } from "./plan-usage";
import type { PlanUsage } from "../server/storage-limits";
import type { Conversation } from "../server/conversations";
import { mountChatManagement } from "./chat-management";

export function mountAnswers(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  onCitation: (citation: Citation) => Promise<void>,
  onHistory: (history: ConversationSummary[]) => void = () => {},
) {
  root.innerHTML = `<section class="answer-panel"><h3>Ask your document</h3><p class="quiet">Answers can be wrong. Verify each source. No professional advice.</p><p id="answer-usage"></p><div id="answer-history"></div><form id="question-form"><label>Selected document<select required aria-label="Selected document"></select></label><label>Your question<textarea required maxlength="2000" rows="3" placeholder="When are the shop drawings due?"></textarea></label><button class="primary" type="submit">Ask selected document</button></form><p role="status" id="question-status"></p><p class="quiet">Successful “not found” answers count. Failed answers do not. Streaming comes in a later slice.</p></section>`;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const selection = form.querySelector<HTMLSelectElement>("select")!;
  const question = root.querySelector<HTMLTextAreaElement>("textarea")!;
  const button = form.querySelector<HTMLButtonElement>("button")!;
  const status = root.querySelector<HTMLElement>("#question-status")!;
  const history = root.querySelector<HTMLElement>("#answer-history")!;
  const usagePanel = document.createElement("section");
  usagePanel.setAttribute("aria-label", "Answer allowance");
  root.querySelector("#answer-usage")!.after(usagePanel);
  const planUsage = mountPlanUsage(usagePanel, "answers", api);
  let allowance: PlanUsage | undefined;
  const heading = root.querySelector<HTMLElement>("h3")!;
  heading.before(
    Object.assign(document.createElement("p"), {
      className: "eyebrow",
      textContent: "SOURCE-BACKED CONVERSATIONS",
    }),
  );
  root
    .querySelector<HTMLElement>(".answer-panel > .quiet")!
    .classList.add("page-description");
  labelWithIcon(button, "Send", "Ask selected document");
  root.querySelector<HTMLElement>(
    ".answer-panel > .quiet:last-child",
  )!.textContent =
    "Verify cited passages before relying on an answer. Successful answers use your pilot allowance; failed requests do not.";
  let requestKey = crypto.randomUUID();
  let disposed = false;
  let pending = false;
  let answers: AnswerRecord[] = [];
  let chats: Conversation[] = [];
  let trashedIds = new Set<string>();
  let threadId: string | undefined =
    new URL(location.href).searchParams.get("thread") ?? undefined;
  const pickerLabel = document.createElement("label");
  pickerLabel.textContent = "Conversation";
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", "Conversation");
  pickerLabel.append(picker);
  const newChat = document.createElement("button");
  newChat.type = "button";
  labelWithIcon(newChat, "Plus", "New chat");
  const conversationToolbar = document.createElement("div");
  conversationToolbar.className = "conversation-toolbar";
  conversationToolbar.append(newChat);
  const managementRoot = document.createElement("section");
  heading.replaceWith(managementRoot);
  const management = mountChatManagement(
    managementRoot,
    picker,
    workspaceId,
    api,
    refresh,
  );
  history.before(conversationToolbar);
  function rememberThread() {
    const url = new URL(location.href);
    if (threadId) url.searchParams.set("thread", threadId);
    else url.searchParams.delete("thread");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  function openConversation(id?: string) {
    if (pending || disposed) return;
    if (id && !answers.some((answer) => (answer.threadId ?? answer.id) === id))
      return;
    threadId = id;
    question.value = "";
    requestKey = crypto.randomUUID();
    status.textContent = "";
    rememberThread();
    renderHistory();
  }
  picker.onchange = () => openConversation(picker.value || undefined);
  newChat.onclick = () => openConversation();
  function updateControls() {
    if (disposed) return;
    button.disabled =
      pending ||
      disposed ||
      selection.options.length === 0 ||
      !allowance ||
      chats.some((chat) => chat.id === threadId && chat.archived) ||
      allowance.answersRemaining === 0;
    question.disabled = pending || disposed;
    selection.disabled = pending || disposed;
    picker.disabled = pending || disposed;
    newChat.disabled = pending || disposed;
    management.update(chats, threadId, pending);
  }
  question.oninput = () => {
    requestKey = crypto.randomUUID();
  };
  selection.onchange = () => {
    requestKey = crypto.randomUUID();
  };
  async function refresh() {
    const saved = await api<AnswerRecord[]>(
      `/workspaces/${workspaceId}/answers`,
    );
    const usage = await api<PlanUsage>("/usage");
    const metadata = await api<Conversation[]>(
      `/workspaces/${workspaceId}/conversations`,
    );
    if (disposed) return;
    allowance = usage;
    planUsage.update(usage);
    updateControls();
    answers = saved;
    chats = metadata;
    if (
      threadId &&
      !answers.some((answer) => (answer.threadId ?? answer.id) === threadId)
    )
      threadId = undefined;
    root.querySelector("#answer-usage")!.textContent =
      `${usage.answersRemaining} of 20 lifetime answers remaining`;
    renderHistory();
    onHistory(chats.filter((chat) => !chat.archived));
  }
  function renderHistory() {
    management.update(chats, threadId, pending);
    history.replaceChildren();
    if (!threadId) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.innerHTML =
        '<span class="chat-monogram">F</span><h2>What would you like to find?</h2><p>Select an uploaded document below, then ask a question. Add documents from the Documents section.</p>';
      history.append(empty);
    }
    for (const answer of answers.filter(
      (answer) => (answer.threadId ?? answer.id) === threadId,
    )) {
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
      const assistantLabel = document.createElement("div");
      assistantLabel.className = "assistant-label";
      assistantLabel.innerHTML = `${icon("Chat")}<strong>FolioAsk</strong>`;
      const text = document.createElement("p");
      text.textContent = answer.text;
      card.append(heading, assistantLabel, label, text);
      for (const citation of answer.citations) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "citation";
        labelWithIcon(
          link,
          "Source",
          `Source · page ${citation.page}${trashedIds.has(citation.documentId) ? " · In Trash" : ""}`,
        );
        link.onclick = () => {
          void onCitation(citation).catch(() => {
            status.textContent = "Could not open the source. Please retry.";
          });
        };
        card.append(link);
      }
      history.append(card);
    }
    // A dashboard selection becomes visible after this synchronous render.
    requestAnimationFrame(() => {
      if (!disposed) history.scrollTop = history.scrollHeight;
    });
    updateControls();
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (pending || disposed || button.disabled || !selection.value) return;
    pending = true;
    updateControls();
    status.textContent = "Retrieving evidence and asking the model…";
    void (async () => {
      try {
        const saved = await api<AnswerRecord>(
          `/workspaces/${workspaceId}/answers`,
          "POST",
          {
            question: question.value,
            documentIds: [selection.value],
            requestKey,
            threadId,
          },
        );
        if (disposed) return;
        threadId = saved.threadId ?? saved.id;
        rememberThread();
        // The write succeeded even if a subsequent history read fails.
        question.value = "";
        requestKey = crypto.randomUUID();
        await refresh();
        if (disposed) return;
        status.textContent =
          "Answer saved. Inspect its sources below the answer.";
      } catch (error) {
        await refresh().catch(() => {});
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
    openConversation,
    dispose() {
      disposed = true;
      management.dispose();
      planUsage.dispose();
    },
    setDocuments(documents: DocumentRecord[]) {
      trashedIds = new Set(
        documents
          .filter((document) => document.deletedAt !== undefined)
          .map((document) => document.id),
      );
      documents = documents.filter(
        (document) => document.deletedAt === undefined,
      );
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
      renderHistory();
    },
  };
}
