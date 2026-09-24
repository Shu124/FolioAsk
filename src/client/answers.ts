import type { AnswerRecord, Citation } from "../server/answers";
import type { DocumentRecord } from "../server/documents";
import type { Api } from "./documents";
import type { ConversationSummary } from "./conversations";
import { icon, labelWithIcon } from "./icons";
import { mountPlanUsage } from "./plan-usage";
import type { PlanUsage } from "../server/storage-limits";
import type { Conversation } from "../server/conversations";
import { mountChatManagement } from "./chat-management";
import { mountChatLayout } from "./chat-layout";

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
  for (const input of [question, selection]) {
    const label = input.parentElement!;
    const caption = document.createElement("span");
    caption.className = "composer-label";
    caption.textContent = label.firstChild!.textContent;
    label.firstChild!.replaceWith(caption);
  }
  selection.title = "Selected document";
  selection.parentElement!.classList.add("composer-source");
  question.parentElement!.classList.add("composer-question");
  form.prepend(question.parentElement!);
  question.rows = 2;
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
  button.title = "Ask selected document";
  root.querySelector<HTMLElement>(
    ".answer-panel > .quiet:last-child",
  )!.textContent =
    "Verify sources. Successful answers use your pilot allowance; failures do not.";
  let requestKey = crypto.randomUUID();
  let disposed = false;
  let pending = false;
  let pendingTurn: { question: string; requestKey: string } | undefined;
  let queuedConversation: { id?: string } | undefined;
  let historyInvalidated = false;
  let historyGeneration = 0;
  let refreshRevision = 0;
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
  newChat.title = "New chat";
  const managementRoot = document.createElement("section");
  heading.replaceWith(managementRoot);
  const management = mountChatManagement(
    managementRoot,
    picker,
    workspaceId,
    api,
    async () => {
      await refresh();
    },
  );
  managementRoot.querySelector(".chat-more")!.before(newChat);
  newChat.className = "new-chat-button";
  const context = document.createElement("div");
  context.className = "chat-context";
  const description = root.querySelector<HTMLElement>(".page-description")!;
  const usage = root.querySelector<HTMLElement>("#answer-usage")!;
  description.before(context);
  context.append(description, usage);
  const layout = mountChatLayout(root, management.library);
  function rememberThread() {
    const url = new URL(location.href);
    if (threadId) url.searchParams.set("thread", threadId);
    else url.searchParams.delete("thread");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  function openConversation(id?: string) {
    if (disposed) return;
    if (pending) {
      // Dashboard links remain available while a turn settles. Honor the latest
      // selection afterwards without moving the pending turn into another chat.
      queuedConversation = { id };
      return;
    }
    if (id && !answers.some((answer) => (answer.threadId ?? answer.id) === id))
      return;
    threadId = id;
    question.value = "";
    requestKey = crypto.randomUUID();
    status.textContent = "";
    rememberThread();
    renderHistory();
  }
  picker.onchange = () => {
    openConversation(picker.value || undefined);
    layout.closeHistory();
  };
  newChat.onclick = () => openConversation();
  function updateControls() {
    if (disposed) return;
    button.disabled =
      pending ||
      historyInvalidated ||
      disposed ||
      selection.options.length === 0 ||
      !allowance ||
      chats.some((chat) => chat.id === threadId && chat.archived) ||
      allowance.answersRemaining === 0;
    question.disabled = pending || disposed;
    question.placeholder = pending
      ? "Waiting for the answer…"
      : "Ask a question about your document…";
    selection.disabled = pending || disposed;
    picker.disabled = pending || disposed;
    newChat.disabled = pending || disposed || historyInvalidated;
    management.update(chats, threadId, pending || historyInvalidated);
  }
  question.oninput = () => {
    requestKey = crypto.randomUUID();
  };
  selection.onchange = () => {
    requestKey = crypto.randomUUID();
  };
  async function refresh() {
    const revision = ++refreshRevision;
    const saved = await api<AnswerRecord[]>(
      `/workspaces/${workspaceId}/answers`,
    );
    const usage = await api<PlanUsage>("/usage");
    const metadata = await api<Conversation[]>(
      `/workspaces/${workspaceId}/conversations`,
    );
    if (disposed || revision !== refreshRevision) return false;
    historyInvalidated = false;
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
    return true;
  }
  function renderHistory() {
    management.update(chats, threadId, pending || historyInvalidated);
    history.replaceChildren();
    if (historyInvalidated) {
      const notice = document.createElement("p");
      notice.className = "quiet";
      notice.textContent =
        "Reloading conversation history. Previous results are hidden until the latest history is available.";
      history.append(notice);
    } else {
      if (!threadId && !pendingTurn) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.innerHTML =
          '<span class="chat-monogram">F</span><h2>What would you like to find?</h2><p>Select an uploaded document below, then ask a question. Add documents from the Documents section.</p>';
        history.append(empty);
      }
      for (const answer of answers.filter(
        (answer) =>
          (answer.threadId ?? answer.id) === threadId ||
          answer.requestKey === pendingTurn?.requestKey,
      )) {
        const card = answerCard(answer.question, "saved-answer");
        const label = document.createElement("p");
        label.className = "quiet";
        label.textContent =
          answer.providerMode === "simulated"
            ? "Simulated provider · Not live AI"
            : "Gemini answer · Verify the evidence";
        const text = document.createElement("p");
        text.textContent = answer.text;
        card.append(label, text);
        for (const citation of answer.citations) {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "citation";
          labelWithIcon(
            link,
            "Source",
            `Source · ${citation.sourceLabel ?? `page ${citation.page}`}${trashedIds.has(citation.documentId) ? " · In Trash" : ""}`,
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
    }
    if (
      pendingTurn &&
      !answers.some((answer) => answer.requestKey === pendingTurn?.requestKey)
    ) {
      const card = answerCard(pendingTurn.question, "pending-answer");
      const thinking = document.createElement("div");
      thinking.className = "answer-thinking";
      thinking.setAttribute("role", "status");
      thinking.setAttribute("aria-live", "polite");
      thinking.setAttribute("aria-atomic", "true");
      thinking.innerHTML =
        '<span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span><span>Finding an answer…</span>';
      card.append(thinking);
      history.append(card);
    }
    // A dashboard selection becomes visible after this synchronous render.
    requestAnimationFrame(() => {
      if (!disposed) history.scrollTop = history.scrollHeight;
    });
    updateControls();
  }
  function answerCard(
    text: string,
    className: "saved-answer" | "pending-answer",
  ) {
    const card = document.createElement("article");
    card.className = className;
    const heading = document.createElement("h4");
    heading.textContent = text;
    const assistantLabel = document.createElement("div");
    assistantLabel.className = "assistant-label";
    assistantLabel.innerHTML = `${icon("Chat")}<strong>FolioAsk</strong>`;
    card.append(heading, assistantLabel);
    return card;
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (pending || disposed || button.disabled || !selection.value) return;
    const submitted = {
      question: question.value,
      documentIds: [selection.value],
      requestKey,
      threadId,
    };
    const submittedGeneration = historyGeneration;
    pending = true;
    pendingTurn = submitted;
    question.value = "";
    status.textContent = "";
    renderHistory();
    void (async () => {
      let committed = false;
      try {
        const saved = await api<AnswerRecord>(
          `/workspaces/${workspaceId}/answers`,
          "POST",
          submitted,
        );
        if (disposed) return;
        committed = true;
        pendingTurn = undefined;
        // A read started before this write must not replace the saved response.
        refreshRevision++;
        // The write succeeded even if a subsequent history read fails.
        question.value = "";
        requestKey = crypto.randomUUID();
        // Settings may have deleted this conversation while the POST response
        // was in flight. Never reinsert it across a history mutation.
        const historyChanged = submittedGeneration !== historyGeneration;
        if (!historyChanged) {
          threadId = saved.threadId ?? saved.id;
          rememberThread();
          answers = [
            ...answers.filter((answer) => answer.id !== saved.id),
            saved,
          ];
        }
        renderHistory();
        const refreshed = await refresh();
        if (disposed) return;
        if (
          historyChanged &&
          refreshed &&
          answers.some((answer) => answer.id === saved.id)
        ) {
          threadId = saved.threadId ?? saved.id;
          rememberThread();
          renderHistory();
        }
        status.textContent =
          "Answer saved. Inspect its sources below the answer.";
      } catch (error) {
        if (disposed) return;
        pendingTurn = undefined;
        if (!committed) question.value = submitted.question;
        status.textContent = committed
          ? "Your answer was saved, but history or allowance could not refresh. Refresh the page to reload them."
          : error instanceof TypeError
            ? "Connection failed. Your draft is preserved. Check your connection, then retry the question."
            : error instanceof Error
              ? error.message
              : "Could not answer. Your draft is preserved.";
        renderHistory();
        await refresh().catch(() => {});
      } finally {
        pending = false;
        pendingTurn = undefined;
        updateControls();
        const queued = queuedConversation;
        queuedConversation = undefined;
        // Keep a failed question and its retry key visible, even if a dashboard
        // link was clicked before the failure arrived.
        if (queued && committed) openConversation(queued.id);
      }
    })();
  };
  return {
    refresh,
    invalidateHistory() {
      historyInvalidated = true;
      historyGeneration++;
      refreshRevision++;
      answers = [];
      chats = [];
      renderHistory();
    },
    refreshLayout: layout.refresh,
    openConversation,
    dispose() {
      disposed = true;
      pendingTurn = undefined;
      queuedConversation = undefined;
      layout.dispose();
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
