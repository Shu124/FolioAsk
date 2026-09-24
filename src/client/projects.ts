import type { Workspace, Account } from "../server/contracts";
import { mountDocuments, type Api } from "./documents";
import { mountTheme } from "./theme";
import { mountSettings } from "./settings";
import { icon, labelWithIcon } from "./icons";
import { mountDashboard } from "./dashboard";
import { mountOnboarding } from "./onboarding";
import { mountProjectSwitcher } from "./project-switcher";
import { responsiveDrawer } from "./responsive-drawer";

type View = "Dashboard" | "Documents" | "Chat" | "Settings";
const views: View[] = ["Dashboard", "Documents", "Chat", "Settings"];

export function mountProjects(
  root: HTMLElement,
  api: Api,
  signedOut: (message?: string) => void,
) {
  root.innerHTML = `<div class="project-shell"><aside class="project-sidebar"><p class="eyebrow">YOUR PROJECTS</p><label><span class="project-selector-label">Current project</span><select id="project-selector"></select></label><button id="new-project">New project</button><nav aria-label="Project navigation"></nav><button id="project-signout">Sign out</button></aside><div class="project-content"><p role="status" id="project-status"></p><section id="project-onboarding"><h1>Name your first project</h1><p>Give your research a home. You can add more projects later.</p><form id="project-form"><label>Project name<input name="name" required maxlength="100" placeholder="e.g. Elm Street renovation"></label><button class="primary">Create project</button></form></section><section id="project-main" hidden><h1 id="project-title"></h1><section id="project-dashboard"><h2>Recent activity</h2><p>Your project is saved to your account. Open Documents to upload a public document, or Chat to continue your research.</p></section><div id="project-evidence"></div><section id="project-settings" hidden><h2>Settings</h2><p>Account and appearance controls are coming in the settings ticket.</p></section></section></div></div>`;
  const status = root.querySelector<HTMLElement>("#project-status")!;
  const addProject = root.querySelector<HTMLButtonElement>("#new-project")!;
  addProject.hidden = true;
  labelWithIcon(addProject, "Plus", "Add project");
  const contentHeader = document.createElement("header");
  contentHeader.className = "workspace-toolbar project-topbar";
  contentHeader.append(addProject);
  root.querySelector(".project-content")!.prepend(contentHeader);
  const menu = document.createElement("button");
  menu.className = "mobile-navigation-toggle";
  labelWithIcon(menu, "Menu", "Toggle navigation");
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-controls", "project-navigation");
  menu.title = "Toggle navigation";
  contentHeader.prepend(menu);
  const sidebar = root.querySelector<HTMLElement>(".project-sidebar")!;
  const railBrand = document.createElement("a");
  railBrand.href = "/";
  railBrand.className = "rail-brand";
  railBrand.textContent = "F";
  railBrand.setAttribute("aria-label", "FolioAsk home");
  sidebar.prepend(railBrand);
  const navigationDrawer = responsiveDrawer(
    sidebar,
    menu,
    "Navigation",
    "(max-width: 760px)",
  );
  status.setAttribute("aria-label", "Project status");
  root.querySelector("#project-selector")!.parentElement!.remove();
  const onboarding = root.querySelector<HTMLElement>("#project-onboarding")!;
  onboarding.hidden = true;
  const main = root.querySelector<HTMLElement>("#project-main")!;
  const title = root.querySelector<HTMLElement>("#project-title")!;
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "project-breadcrumb";
  breadcrumb.innerHTML = icon("Folder");
  breadcrumb.append(title);
  menu.after(breadcrumb);
  labelWithIcon(
    root.querySelector<HTMLElement>("#project-signout")!,
    "Logout",
    "Sign out",
  );
  labelWithIcon(
    root.querySelector<HTMLElement>("#project-form button")!,
    "Plus",
    "Create project",
  );
  const dashboard = root.querySelector<HTMLElement>("#project-dashboard")!;
  let dashboardView: ReturnType<typeof mountDashboard> | undefined;
  const evidence = root.querySelector<HTMLElement>("#project-evidence")!;
  const settings = root.querySelector<HTMLElement>("#project-settings")!;
  settings.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h2>Settings</h2><p class="page-description">Manage your account, project and workspace preferences.</p></div></div>';
  const appearance = document.createElement("section");
  settings.append(appearance);
  const shortcut = document.createElement("button");
  const utilities = document.createElement("div");
  utilities.className = "sidebar-utilities";
  utilities.append(root.querySelector("#project-signout")!, shortcut);
  contentHeader.append(utilities);
  const disposeTheme = mountTheme(appearance, shortcut);
  root.querySelector<HTMLButtonElement>("#project-signout")!.title = "Sign out";
  const accountSettings = document.createElement("div");
  settings.append(accountSettings);
  let settingsView: ReturnType<typeof mountSettings> | undefined;
  const nav = root.querySelector<HTMLElement>("nav")!;
  nav.id = "project-navigation";
  const form = root.querySelector<HTMLFormElement>("#project-form")!;
  let projects: Workspace[] = [];
  let current: Workspace | undefined;
  let documentView: ReturnType<typeof mountDocuments> | undefined;
  let disposed = false;
  let sequence = 0;
  let activeView: View = "Dashboard";
  let historyDirty = false;
  let historyVersion = 0;
  const profilePanel = document.createElement("section");
  profilePanel.hidden = true;
  onboarding.before(profilePanel);
  let profileSetup: ReturnType<typeof mountOnboarding> | undefined;
  const switcher = mountProjectSwitcher(
    breadcrumb,
    (id) => void run(() => open(id)),
  );
  const controls = views.map((view) => {
    const button = document.createElement("button");
    button.innerHTML = `${icon(view)}<span>${view}</span>`;
    button.onclick = () => show(view);
    nav.append(button);
    return button;
  });
  function show(view: View) {
    navigationDrawer.close();
    root.querySelector<HTMLElement>(".project-content")!.dataset.view =
      view.toLowerCase();
    if (activeView !== view) window.scrollTo({ top: 0, behavior: "instant" });
    activeView = view;
    dashboard.hidden = view !== "Dashboard";
    evidence.hidden = view !== "Documents" && view !== "Chat";
    settings.hidden = view !== "Settings";
    if (view === "Dashboard") void dashboardView?.refresh();
    if (view === "Settings") void settingsView?.refreshUsage();
    if (view === "Chat" && historyDirty && documentView) {
      const documentModel = documentView;
      const revision = historyVersion;
      status.textContent = "Refreshing conversation history…";
      void documentModel
        .refreshConversations()
        .then((loaded) => {
          if (
            disposed ||
            documentModel !== documentView ||
            revision !== historyVersion
          )
            return;
          if (loaded) {
            historyDirty = false;
            status.textContent = "";
          }
        })
        .catch(() => {
          if (
            !disposed &&
            documentModel === documentView &&
            revision === historyVersion
          )
            status.textContent =
              "Could not refresh conversation history. Open Chat again to retry; your draft is preserved.";
        });
    }
    // Uploads and chat share project state, but render in separate sections.
    documentView?.show(view === "Documents" ? "documents" : "chat");
    for (const button of controls) {
      if (button.textContent === view)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (current) {
      const url = new URL(location.href);
      if (url.searchParams.get("workspace") !== current.id)
        url.searchParams.delete("thread");
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
    historyVersion++;
    historyDirty = false;
    documentView?.dispose();
    dashboardView?.dispose();
    settingsView?.dispose();
    settingsView = undefined;
    documentView = undefined;
    evidence.replaceChildren();
    current = undefined;
    main.hidden = true;
    let project: Workspace;
    try {
      project = await api<Workspace>(`/workspaces/${encodeURIComponent(id)}`);
    } catch (error) {
      if (disposed || revision !== sequence) return;
      throw error;
    }
    if (disposed || revision !== sequence) return;
    current = project;
    title.textContent = project.name;
    switcher.update(projects, project.id);
    onboarding.hidden = true;
    main.hidden = false;
    dashboardView = mountDashboard(dashboard, project.id, api, (target) => {
      if (target.threadId) {
        documentView?.openConversation(target.threadId);
        show("Chat");
      } else if (target.documentId) {
        show("Documents");
        void documentView?.openDocument(target.documentId);
      }
    });
    settingsView = mountSettings(
      accountSettings,
      project,
      api,
      (name) => {
        if (disposed || revision !== sequence) return;
        project.name = name;
        title.textContent = name;
        const entry = projects.find((item) => item.id === project.id);
        if (entry) entry.name = name;
        updateProjectNavigation();
      },
      (message) => {
        signedOut(message);
        history.replaceState(null, "", "/app");
      },
      appearance,
      () => {
        if (!disposed && revision === sequence) {
          historyDirty = true;
          historyVersion++;
          documentView?.invalidateConversations();
          if (activeView === "Chat") show("Chat");
        }
      },
    );
    // Commit the project URL before the chat reads its conversation selection.
    show(activeView);
    documentView = mountDocuments(evidence, project.id, api, signedOut, () => {
      if (disposed || revision !== sequence) return;
      if (activeView === "Dashboard") void dashboardView?.refresh();
    });
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
  function updateProjectNavigation() {
    switcher.update(projects, current?.id ?? "");
    nav.hidden = projects.length === 0;
  }
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
        updateProjectNavigation();
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
    updateProjectNavigation();
    if (!projects.length) {
      if (params.has("workspace")) status.textContent = "Workspace not found.";
      onboarding.hidden = true;
      addProject.hidden = true;
      const profile = await api<Account>("/account");
      if (disposed) return;
      if (!profile.onboardingComplete) {
        profilePanel.hidden = false;
        profileSetup = mountOnboarding(profilePanel, profile, api, () => {
          profilePanel.hidden = true;
          profileSetup?.dispose();
          onboarding.hidden = false;
          addProject.hidden = false;
          form.querySelector("input")!.focus();
        });
        return;
      }
      onboarding.hidden = false;
      addProject.hidden = false;
      return;
    }
    addProject.hidden = false;
    const id = params.get("workspace") ?? projects[0]?.id;
    if (id) await open(id);
  });
  return {
    ready,
    dispose() {
      profileSetup?.dispose();
      navigationDrawer.dispose();
      switcher.dispose();
      disposed = true;
      disposeTheme();
      dashboardView?.dispose();
      settingsView?.dispose();
      sequence++;
      documentView?.dispose();
      root.replaceChildren();
    },
  };
}
