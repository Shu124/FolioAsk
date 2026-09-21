import "./style.css";
import "./workspace.css";
import "./landing.css";
import {
  landingHeader,
  landingHero,
  landingFeatures,
  landingDetails,
  landingFooter,
} from "./landing";
import "./client/theme";
import { samples, type SampleKey } from "./samples";

const app = document.querySelector<HTMLDivElement>("#app")!;
if (location.pathname === "/app") {
  void import("./client/workspace").then(({ mountWorkspace }) =>
    mountWorkspace(app),
  );
} else {
  app.classList.add("landing-page");
  app.innerHTML = `
  ${landingHeader}
  <main id="main-content">
    ${landingHero}
    ${landingFeatures}
    <section id="demo" class="demo-section" aria-label="Guided demo"><div class="section-top"><div><p class="eyebrow">SEE THE SOURCE, NOT JUST THE ANSWER</p><h2>Bring a question. Leave with context.</h2></div><span class="badge">Guided demo · Synthetic documents</span></div>
      <div class="sector-tabs" aria-label="Choose a sample">${Object.entries(
        samples,
      )
        .map(
          ([key, sample]) =>
            `<button type="button" data-sample="${key}" aria-pressed="false">${sample.sector}</button>`,
        )
        .join("")}</div>
      <div class="demo-grid"><aside class="document-list"><p class="panel-label">YOUR DOCUMENTS <span>01</span></p><div class="file-card"><span class="file-icon">TXT</span><div><strong id="file-name"></strong><small>1 page · Synthetic sample</small></div></div><div class="sidebar-note">Every claim has a place.<br>Click a citation to inspect the passage behind it.</div></aside>
        <section class="source-panel" aria-label="Source document"><div class="panel-bar"><span>Source document</span><span>Page 1 of 1</span></div><article class="paper" tabindex="-1" id="source-paper"><p id="source-kind" class="eyebrow"></p><h3 id="source-heading"></h3><p id="source-context" class="quiet"></p><div class="paper-rule"></div><p id="source-passage"></p><footer>SYNTHETIC SAMPLE · FOR DEMONSTRATION ONLY</footer></article></section>
        <section class="chat-panel" aria-label="Sample conversation"><div class="panel-bar"><span>Ask FolioAsk</span><span class="status-dot">Guided</span></div><div class="chat-content"><p class="chat-label">EXAMPLE QUESTION</p><p id="sample-question" class="question-bubble"></p><p class="chat-label answer-label">FOLIOASK <span>Prepared answer · No live AI</span></p><p id="sample-answer" class="answer"></p><button type="button" id="citation" class="citation">View source · page 1</button><p class="quiet sample-note">This answer was prepared and checked against the synthetic passage. It does not demonstrate live model accuracy.</p></div><div class="composer-preview">Live questions will require sign-in.</div></section>
      </div>
    </section>
    ${landingDetails}
  </main>${landingFooter}`;

  const demoGrid = document.querySelector<HTMLElement>(".demo-grid")!;
  const sourcePanel = document.querySelector<HTMLElement>(".source-panel")!;
  const chatPanel = document.querySelector<HTMLElement>(".chat-panel")!;
  sourcePanel.id = "demo-document";
  chatPanel.id = "demo-chat";
  const viewControls = document.createElement("div");
  viewControls.className = "demo-view-controls";
  viewControls.setAttribute("role", "group");
  viewControls.setAttribute("aria-label", "Demo view");
  viewControls.innerHTML = `<button type="button" data-view="document" aria-controls="demo-document">Document</button><button type="button" data-view="chat" aria-controls="demo-chat">Chat</button>`;
  demoGrid.before(viewControls);
  function showView(view: "document" | "chat") {
    demoGrid.dataset.view = view;
    viewControls
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.view === view),
        );
      });
  }
  viewControls
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        showView(button.dataset.view === "document" ? "document" : "chat"),
      );
    });
  showView("chat");

  function showSample(key: SampleKey) {
    const sample = samples[key];
    const fields = {
      "file-name": sample.name,
      "source-kind": sample.kind,
      "source-heading": sample.heading,
      "source-context": sample.context,
      "source-passage": sample.passage,
      "sample-question": sample.question,
      "sample-answer": sample.answer,
    };
    for (const [id, text] of Object.entries(fields))
      document.getElementById(id)!.textContent = text;
    document
      .querySelectorAll<HTMLButtonElement>("[data-sample]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.sample === key),
        );
      });
  }

  document
    .querySelectorAll<HTMLButtonElement>("[data-sample]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        showSample(button.dataset.sample as SampleKey),
      );
    });
  document.getElementById("citation")!.addEventListener("click", () => {
    showView("document");
    const passage = document.getElementById("source-passage")!;
    const highlight = document.createElement("mark");
    highlight.textContent = passage.textContent;
    passage.replaceChildren(highlight);
    document.getElementById("source-paper")!.focus({ preventScroll: true });
    highlight.scrollIntoView({ block: "center", behavior: "instant" });
  });
  showSample("construction");
}
