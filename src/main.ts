import "./style.css";
import { samples, type SampleKey } from "./samples";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="site-header"><a class="brand" href="/" aria-label="FolioAsk home"><span class="brand-icon">F</span>FolioAsk<span class="preview">PREVIEW</span></a><nav aria-label="Main"><a href="#demo">Explore demo</a><a href="#pricing">Pricing</a></nav></header>
  <main>
    <section class="hero"><p class="eyebrow">A LITTLE LESS SEARCHING. A LOT MORE CLARITY.</p><h1>Your documents.<br>Clear answers.<br><span>Visible evidence.</span></h1><p class="lede">Find the detail that matters. Ask your documents a question, then follow the answer back to its source.</p><a class="primary" href="#demo">Explore a guided demo <span aria-hidden="true">↗</span></a><p class="quiet">No signup. No live AI calls. Just a look at how it works.</p></section>
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
    <section class="boundaries"><div><p class="eyebrow">BUILT FOR DOCUMENT RESEARCH</p><h2>Understand the document.<br>Keep your judgement.</h2></div><div><p>Planned support: selectable-text PDFs, clear printed PDF scans, and JPG/PNG images. Each image counts as one page.</p><p>Explain, summarize, extract, and compare. No patient records, specially regulated sensitive data, diagnosis, treatment, personalized investment advice, or engineering safety approvals. Payment will not remove these exclusions.</p><p class="quiet">This preview offers guided samples only. Regulatory compliance has not been verified.</p></div></section>
    <section id="pricing" class="pricing"><p class="eyebrow">SIMPLE LIMITS. NO SURPRISE OVERAGES.</p><h2>Start small. Subscribe when it fits.</h2><div class="price-grid"><article class="price-card"><span class="badge">Planned free trial</span><h3>Explore</h3><p class="price">$0</p><p>Public, non-sensitive documents only.</p><ul><li>3 successful uploads, lifetime</li><li>20 successful answers, lifetime</li><li>20 pages / 10 MB per document</li><li>Content expires after 30 days of inactivity</li></ul><a href="#demo" class="secondary">Try the guided demo</a></article><article class="price-card featured"><span class="badge">Planned subscription</span><h3>Research</h3><p class="price">$29<span> / month · USD</span></p><p>Eligible private business documents, once verified.</p><ul><li>500 processed pages per billing month</li><li>500 successful answers per billing month</li><li>1 GB storage · 100 pages / 25 MB per file</li><li>Paid-model processing · no automatic overages</li></ul><button type="button" disabled>Paid plan not yet available</button></article></div><p class="quiet">Allowances are provisional until operating costs are validated. Failed processing will not consume allowances; successful “not found” answers will. Deletion will not reset usage.</p></section>
  </main><footer class="site-footer"><a class="brand" href="/">FolioAsk</a><p>Answers worth checking.</p><span>Preview · Not professional advice</span></footer>`;

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
  const passage = document.getElementById("source-passage")!;
  const highlight = document.createElement("mark");
  highlight.textContent = passage.textContent;
  passage.replaceChildren(highlight);
  document.getElementById("source-paper")!.focus({ preventScroll: true });
  highlight.scrollIntoView({ block: "center", behavior: "instant" });
});
showSample("construction");
