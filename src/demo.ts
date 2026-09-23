import { samples, type SampleKey } from "./samples";
import { icon, labelWithIcon } from "./client/icons";
import { sourceDrawer } from "./client/source-drawer";
import { responsiveTable } from "./client/responsive-table";

export function mountDemo(root: HTMLElement) {
  root.innerHTML = `<div class="section-top"><div><p class="eyebrow">EXPLORE THE WORKSPACE</p><h2>Bring a question. Leave with context.</h2></div><span class="badge">Guided demo · Synthetic documents</span></div><p class="quiet">Everything below is simulated: example activity, document metadata and prepared answers. No uploads, live AI calls or account data.</p><div class="sector-tabs" aria-label="Choose a sample">${Object.entries(
    samples,
  )
    .map(
      ([key, sample]) =>
        `<button data-sample="${key}" aria-pressed="false">${sample.sector}</button>`,
    )
    .join(
      "",
    )}</div><div class="demo-grid"><aside class="project-sidebar demo-sidebar"><button class="mobile-navigation-toggle" aria-expanded="true">Toggle demo navigation</button><p class="eyebrow">SAMPLE PROJECT</p><p data-demo-name class="demo-project-name"></p><nav aria-label="Demo navigation">${(["Dashboard", "Documents", "Chat"] as const).map((view) => `<button data-demo-view="${view}">${icon(view)}<span>${view}</span></button>`).join("")}</nav><p class="quiet">Explore freely.<br>Nothing here is uploaded or saved to an account.</p></aside><div class="demo-body"><header class="workspace-toolbar"><span class="eyebrow">SYNTHETIC SAMPLE WORKSPACE</span><a class="secondary" href="/app?auth=signup">Create a project</a></header>
  <section data-demo-panel="Dashboard" aria-label="Sample dashboard" hidden><h3>Dashboard</h3><p class="quiet">Simulated example activity · Not your account data</p><div class="metric-grid"><section class="metric-card"><p>Sample documents</p><strong id="demo-document-count">1</strong></section><section class="metric-card"><p>Prepared answers</p><strong>1</strong></section><section class="metric-card"><p>Conversations</p><strong>1</strong></section><section class="metric-card"><p>Active time</p><strong class="demo-untracked">Not tracked</strong></section></div><div class="activity-chart-card"><h3>Example activity</h3><p>Illustrative seven-day sequence, not real usage.</p><div class="activity-chart" role="img" aria-label="Simulated activity: one upload on day three and one prepared answer on day seven.">${[0, 0, 1, 0, 0, 0, 1].map((count, index) => `<div class="activity-column"><span>${count}</span><div class="activity-bar" style="height:${count * 70}px"></div><small>Day ${index + 1}</small></div>`).join("")}</div><details><summary>View sample chart data</summary><table aria-label="Sample activity data"><thead><tr><th>Day</th><th>Uploads</th><th>Answers</th></tr></thead><tbody>${[0, 0, 1, 0, 0, 0, 1].map((count, index) => `<tr><td>${index + 1}</td><td>${index === 2 ? count : 0}</td><td>${index === 6 ? count : 0}</td></tr>`).join("")}</tbody></table></details></div><h3>Recent activity</h3><div class="table-scroll"><table aria-label="Sample recent activity"><thead><tr><th>Activity</th><th>Example time</th><th>Open</th></tr></thead><tbody><tr><td>Sample document</td><td>Day 3 · 09:30</td><td><button data-demo-open="document">Inspect sample</button></td></tr><tr><td>Prepared conversation</td><td>Day 7 · 09:32</td><td><button data-demo-open="chat">Open sample chat</button></td></tr></tbody></table></div></section>
  <section data-demo-panel="Documents" aria-label="Sample documents" hidden><div class="workspace-toolbar"><h3>Documents</h3><a class="primary" href="/app?auth=signup">Add document · sign in</a></div><p class="quiet">Synthetic example only. Uploads are unavailable in this demo. Trash/Restore changes below are simulated and reset on reload.</p><div class="table-tools"><div class="section-tabs" aria-label="Demo document views"><button data-demo-trash-view="false" aria-pressed="true">Active</button><button data-demo-trash-view="true" aria-pressed="false">Trash</button></div><label>Search sample documents<input type="search" id="demo-search"></label></div><div class="table-scroll" tabindex="0" aria-label="Scrollable sample document table"><table aria-label="Demo documents"><thead><tr><th>Name</th><th>Example upload time</th><th>Pages</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr id="demo-document-row"><td><button data-demo-open="document" data-demo-name></button></td><td>Day 3 · 09:30</td><td>1</td><td id="demo-document-status">Ready</td><td><button id="demo-trash-action">Move sample to Trash</button></td></tr><tr id="demo-empty" hidden><td colspan="5">No sample documents in this view.</td></tr></tbody></table></div></section>
  <section data-demo-panel="Chat" class="answer-panel" aria-label="Sample conversation"><h3>Ask your document</h3><p class="quiet">Answers can be wrong. Verify each source. No professional advice.</p><p class="demo-thread-title">Conversation: <span id="demo-thread"></span></p><div class="demo-message-history"><article class="saved-answer"><h4 id="sample-question"></h4><p class="quiet">Prepared answer · No live AI</p><p id="sample-answer"></p><button id="citation" class="citation">View source · page 1</button></article></div><div class="demo-composer"><label>Selected sample<select aria-label="Selected sample" disabled><option id="demo-selected-document"></option></select></label><p>Live questions require sign-in and an operator-configured model.</p><a class="primary" href="/app?auth=signup">Start your own conversation ↗</a></div></section></div></div>`;
  const sampleProject = root.querySelector<HTMLElement>(".demo-project-name")!;
  root
    .querySelector(".demo-body header > .eyebrow")!
    .replaceWith(sampleProject);
  const demoBrand = document.createElement("span");
  demoBrand.className = "rail-brand";
  demoBrand.textContent = "F";
  demoBrand.setAttribute("aria-hidden", "true");
  root.querySelector(".demo-sidebar")!.prepend(demoBrand);
  labelWithIcon(
    root.querySelector<HTMLElement>(".demo-body header a")!,
    "Plus",
    "Create a project",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>('[data-demo-panel="Documents"] a')!,
    "Upload",
    "Add document · sign in",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>('[data-demo-trash-view="false"]')!,
    "Documents",
    "Active",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>('[data-demo-trash-view="true"]')!,
    "Trash",
    "Trash",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>('[data-demo-open="chat"]')!,
    "Chat",
    "Open sample chat",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>('[data-demo-open="document"]')!,
    "Source",
    "Inspect sample",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>(".demo-composer a")!,
    "Send",
    "Start your own conversation ↗",
  );
  const assistant = document.createElement("div");
  const chatHeading = root.querySelector<HTMLElement>(
    '[data-demo-panel="Chat"] > h3',
  )!;
  const thread = root.querySelector<HTMLElement>("#demo-thread")!;
  const oldThreadLabel = thread.parentElement!;
  chatHeading.replaceChildren(thread);
  oldThreadLabel.remove();
  assistant.className = "assistant-label";
  assistant.innerHTML = `${icon("Chat")}<strong>FolioAsk</strong>`;
  root.querySelector("#sample-question")!.after(assistant);
  const source = document.createElement("section");
  source.className = "source-panel";
  source.setAttribute("aria-label", "Source document");
  source.innerHTML = `<p id="demo-source-status" class="quiet"></p><article class="paper" id="source-paper"><p id="source-kind" class="eyebrow"></p><h3 id="source-heading"></h3><p id="source-context" class="quiet"></p><div class="paper-rule"></div><p id="source-passage"></p><footer>SYNTHETIC SAMPLE · FOR DEMONSTRATION ONLY</footer></article>`;
  const drawer = sourceDrawer(root);
  drawer.body.append(source);
  let selected: SampleKey = "construction";
  const trash = new Set<SampleKey>();
  let trashView = false;
  const search = root.querySelector<HTMLInputElement>("#demo-search")!;
  const find = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  function showView(view: string) {
    root.querySelectorAll<HTMLElement>("[data-demo-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.demoPanel !== view;
    });
    root
      .querySelectorAll<HTMLButtonElement>("[data-demo-view]")
      .forEach((button) => {
        if (button.dataset.demoView === view)
          button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
  }
  function updateDocument() {
    const removed = trash.has(selected);
    const matches =
      removed === trashView &&
      samples[selected].name.toLowerCase().includes(search.value.toLowerCase());
    find("demo-document-row").hidden = !matches;
    find("demo-empty").hidden = matches;
    find("demo-document-status").textContent = removed ? "In Trash" : "Ready";
    labelWithIcon(
      find("demo-trash-action"),
      removed ? "Restore" : "Trash",
      removed ? "Restore sample" : "Move sample to Trash",
    );
    find("demo-document-count").textContent = removed ? "0" : "1";
    root
      .querySelectorAll<HTMLTableElement>(".table-scroll table")
      .forEach(responsiveTable);
    labelWithIcon(
      find("citation"),
      "Source",
      `View source · page 1${removed ? " · In Trash" : ""}`,
    );
    root
      .querySelectorAll<HTMLButtonElement>("[data-demo-trash-view]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String((button.dataset.demoTrashView === "true") === trashView),
        ),
      );
  }
  function showSample(key: SampleKey) {
    selected = key;
    const sample = samples[key];
    for (const [id, text] of Object.entries({
      "source-kind": sample.kind,
      "source-heading": sample.heading,
      "source-context": sample.context,
      "source-passage": sample.passage,
      "sample-question": sample.question,
      "sample-answer": sample.answer,
      "demo-thread": sample.question,
      "demo-selected-document": sample.name,
    }))
      find(id).textContent = text;
    root.querySelectorAll<HTMLElement>("[data-demo-name]").forEach((node) => {
      if (node.tagName === "BUTTON")
        labelWithIcon(node, "Documents", sample.name);
      else node.textContent = sample.name;
    });
    root
      .querySelectorAll<HTMLButtonElement>("[data-sample]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.sample === key),
        ),
      );
    search.value = "";
    trashView = false;
    updateDocument();
  }
  function openSource(highlight: boolean) {
    const removed = trash.has(selected);
    find("source-paper").hidden = removed;
    find("demo-source-status").textContent = removed
      ? "This sample is in Trash. Restore it in Documents to inspect the source. No real file was deleted."
      : "Synthetic source · Page 1 of 1";
    const passage = find("source-passage");
    passage.textContent = samples[selected].passage;
    if (highlight && !removed) {
      const mark = document.createElement("mark");
      mark.textContent = passage.textContent;
      passage.replaceChildren(mark);
    }
    drawer.show();
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-sample]")
    .forEach((button) => {
      button.onclick = () => showSample(button.dataset.sample as SampleKey);
    });
  root
    .querySelectorAll<HTMLButtonElement>("[data-demo-view]")
    .forEach((button) => {
      button.onclick = () => showView(button.dataset.demoView!);
    });
  root
    .querySelectorAll<HTMLButtonElement>("[data-demo-open]")
    .forEach((button) => {
      button.onclick = () =>
        button.dataset.demoOpen === "chat"
          ? showView("Chat")
          : openSource(false);
    });
  root
    .querySelectorAll<HTMLButtonElement>("[data-demo-trash-view]")
    .forEach((button) => {
      button.onclick = () => {
        trashView = button.dataset.demoTrashView === "true";
        updateDocument();
      };
    });
  find("citation").onclick = () => openSource(true);
  find("demo-trash-action").onclick = () => {
    if (trash.has(selected)) trash.delete(selected);
    else trash.add(selected);
    updateDocument();
  };
  search.oninput = updateDocument;
  const menu = root.querySelector<HTMLButtonElement>(
    ".mobile-navigation-toggle",
  )!;
  labelWithIcon(menu, "Menu", "Toggle demo navigation");
  menu.title = "Toggle demo navigation";
  menu.setAttribute("aria-controls", "demo-navigation");
  root.querySelector("nav")!.id = "demo-navigation";
  menu.onclick = () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    root.querySelector<HTMLElement>(".demo-sidebar")!.dataset.collapsed =
      String(!open);
  };
  showSample(selected);
  showView("Chat");
}
