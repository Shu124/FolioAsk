import type { Workspace } from "../server/contracts";
import { mountDocuments, type Api } from "./documents";

type View = "Dashboard" | "Documents" | "Chat" | "Settings";
const views: View[] = ["Dashboard", "Documents", "Chat", "Settings"];

export function mountProjects(
  root: HTMLElement,
  api: Api,
  signedOut: () => void,
) {
  root.innerHTML = `<div class="project-shell"><aside class="project-sidebar"><p class="eyebrow">YOUR PROJECTS</p><label>Current project<select id="project-selector"></select></label><button id="new-project">New project</button><nav aria-label="Project navigation"></nav><button id="project-signout">Sign out</button></aside><div class="project-content"><p role="status" id="project-status"></p><section id="project-onboarding"><h1>Name your first project</h1><p>Give your research a home. You can add more projects later.</p><form id="project-form"><label>Project name<input name="name" required maxlength="100" placeholder="e.g. Elm Street renovation"></label><button class="primary">Create project</button></form></section><section id="project-main" hidden><h1 id="project-title"></h1><section id="project-dashboard"><h2>Recent activity</h2><p>Your project is saved to your account. Open Documents to upload an approved PDF, or Chat to continue your research.</p></section><div id="project-evidence"></div><section id="project-settings" hidden><h2>Settings</h2><p>Account and appearance controls are coming in the settings ticket.</p></section></section></div></div>`;
  const status = root.querySelector<HTMLElement>("#project-status")!;
  const selector = root.querySelector<HTMLSelectElement>("#project-selector")!;
  const onboarding = root.querySelector<HTMLElement>("#project-onboarding")!;
  const main = root.querySelector<HTMLElement>("#project-main")!;
  const title = root.querySelector<HTMLElement>("#project-title")!;
  const dashboard = root.querySelector<HTMLElement>("#project-dashboard")!;
  const evidence = root.querySelector<HTMLElement>("#project-evidence")!;
  const settings = root.querySelector<HTMLElement>("#project-settings")!;
  const nav = root.querySelector<HTMLElement>("nav")!;
  const form = root.querySelector<HTMLFormElement>("#project-form")!;
  let projects: Workspace[] = [];
  let current: Workspace | undefined;
  let documentView: ReturnType<typeof mountDocuments> | undefined;
  let disposed = false;
  let sequence = 0;
  let activeView: View = "Dashboard";
  const controls = views.map((view) => {
    const button = document.createElement("button");
    button.textContent = view;
    button.onclick = () => show(view);
    nav.append(button);
    return button;
  });
  function show(view: View) {
    activeView = view;
    dashboard.hidden = view !== "Dashboard";
    evidence.hidden = view !== "Documents" && view !== "Chat";
    settings.hidden = view !== "Settings";
    // Chat retains the source beside it for citation inspection and ongoing uploads.
    documentView?.show(view === "Documents" ? "documents" : "chat");
    for (const button of controls) {
      if (button.textContent === view)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (current) {
      const url = new URL("/app", location.origin);
      url.searchParams.set("workspace", current.id);
      url.searchParams.set("view", view.toLowerCase());
      history.replaceState(null, "", url.pathname + url.search);
    }
  }
  async function run(work: () => Promise<void>) {
    status.textContent = "";
    try {
      await work();
    } catch (error) {
      if (!disposed)
        status.textContent =
          error instanceof Error
            ? error.message
            : "Could not load project. Please retry.";
    }
  }
  async function open(id: string) {
    const revision = ++sequence;
    documentView?.dispose();
    documentView = undefined;
    evidence.replaceChildren();
    current = undefined;
    main.hidden = true;
    const project = await api<Workspace>(
      `/workspaces/${encodeURIComponent(id)}`,
    );
    if (disposed || revision !== sequence) return;
    current = project;
    title.textContent = project.name;
    selector.value = project.id;
    onboarding.hidden = true;
    main.hidden = false;
    documentView = mountDocuments(evidence, project.id, api, signedOut);
    show(activeView);
    try {
      await documentView.ready;
    } catch (error) {
      if (!disposed && revision === sequence)
        status.textContent =
          error instanceof Error
            ? error.message
            : "Document service unavailable.";
    }
  }
  function updateSelector() {
    selector.replaceChildren();
    for (const project of projects) {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = project.name;
      selector.append(option);
    }
    selector.disabled = projects.length === 0;
    nav.hidden = projects.length === 0;
  }
  selector.onchange = () => void run(() => open(selector.value));
  root.querySelector<HTMLButtonElement>("#new-project")!.onclick = () => {
    onboarding.hidden = false;
    onboarding.querySelector("h1")!.textContent = projects.length
      ? "Create a project"
      : "Name your first project";
    form.querySelector("input")!.focus();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const button = form.querySelector("button")!;
    if (button.disabled) return;
    button.disabled = true;
    void run(async () => {
      try {
        const project = await api<Workspace>("/workspaces", "POST", {
          name: new FormData(form).get("name"),
        });
        if (disposed) return;
        projects.unshift(project);
        updateSelector();
        form.reset();
        activeView = "Dashboard";
        await open(project.id);
      } finally {
        button.disabled = false;
      }
    });
  };
  root.querySelector<HTMLButtonElement>("#project-signout")!.onclick = () =>
    void run(async () => {
      await api("/session", "DELETE");
      signedOut();
      history.replaceState(null, "", "/app");
    });
  const ready = run(async () => {
    const params = new URL(location.href).searchParams;
    activeView =
      views.find((view) => view.toLowerCase() === params.get("view")) ??
      "Dashboard";
    projects = await api<Workspace[]>("/workspaces");
    if (disposed) return;
    updateSelector();
    const id = params.get("workspace") ?? projects[0]?.id;
    if (id) await open(id);
  });
  return {
    ready,
    dispose() {
      disposed = true;
      sequence++;
      documentView?.dispose();
      root.replaceChildren();
    },
  };
}
