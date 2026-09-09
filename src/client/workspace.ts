import type { Workspace } from "../server/contracts";
import { mountDocuments } from "./documents";

export async function mountWorkspace(root: HTMLElement) {
  root.innerHTML = `<header class="site-header"><a class="brand" href="/">FolioAsk</a><a href="/">Back to guided demo</a></header><main class="account-page"><p class="eyebrow">YOUR RESEARCH, IN ONE PLACE</p><div role="status" id="account-status"></div><section id="signin"><h1>Sign in to your workspace</h1><p>Uploads and live questions require an account. Document processing is not available in this slice yet.</p><form id="signin-form"><label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label><label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><div class="form-actions"><button class="primary" type="submit">Sign in</button><button type="button" id="signup">Create account</button></div></form><p class="quiet">New accounts require email confirmation. Sessions expire after 24 hours; signing out revokes this session immediately.</p></section><section id="workspace-home" hidden><div class="section-top"><h1>Your workspaces</h1><button id="signout">Sign out</button></div><form id="create-workspace"><label>Workspace name<input name="name" required maxlength="100" placeholder="e.g. Elm Street project"></label><button class="primary">Create workspace</button></form><div class="workspace-layout"><nav aria-label="Your workspaces" id="workspace-list"></nav><section id="workspace-detail"><h2>Select a workspace</h2><p>Group related documents for your research.</p></section></div></section></main>`;
  const status = root.querySelector<HTMLElement>("#account-status")!;
  const signin = root.querySelector<HTMLElement>("#signin")!;
  const home = root.querySelector<HTMLElement>("#workspace-home")!;
  const detail = root.querySelector<HTMLElement>("#workspace-detail")!;
  const list = root.querySelector<HTMLElement>("#workspace-list")!;
  const loginForm = root.querySelector<HTMLFormElement>("#signin-form")!;
  signin.hidden = true;
  status.textContent = "Restoring session…";
  let disposeDocuments = () => {};
  let workspaceSequence = 0;
  function signedOut() {
    workspaceSequence++;
    disposeDocuments();
    disposeDocuments = () => {};
    signin.hidden = false;
    home.hidden = true;
    detail.replaceChildren();
    list.replaceChildren();
  }
  async function api<T>(
    path: string,
    method = "GET",
    data?: unknown,
  ): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.status === 204) return undefined as T;
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) signedOut();
      throw new Error(result.error || "Request failed. Please retry.");
    }
    return result;
  }
  async function action(work: () => Promise<void>) {
    status.textContent = "Working…";
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
    buttons.forEach((button) => (button.disabled = true));
    try {
      await work();
      if (status.textContent === "Working…") status.textContent = "";
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : "Connection failed. Please retry.";
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  }
  async function openWorkspace(id: string) {
    const current = ++workspaceSequence;
    const workspace = await api<Workspace>(
      `/workspaces/${encodeURIComponent(id)}`,
    );
    if (current !== workspaceSequence) return;
    disposeDocuments();
    const title = document.createElement("h2");
    title.textContent = workspace.name;
    const note = document.createElement("p");
    note.textContent = "This workspace is saved to your account.";
    const documents = document.createElement("div");
    detail.replaceChildren(title, note, documents);
    history.replaceState(null, "", `/app?workspace=${encodeURIComponent(id)}`);
    const view = mountDocuments(documents, id, api, signedOut);
    disposeDocuments = view.dispose;
    await view.ready;
  }
  async function loadWorkspaces() {
    const workspaces = await api<Workspace[]>("/workspaces");
    signin.hidden = true;
    home.hidden = false;
    list.replaceChildren();
    for (const workspace of workspaces) {
      const button = document.createElement("button");
      button.textContent = workspace.name;
      button.onclick = () => void action(() => openWorkspace(workspace.id));
      list.append(button);
    }
    if (!workspaces.length) list.textContent = "No workspaces yet.";
    const selected = new URL(location.href).searchParams.get("workspace");
    if (selected) await openWorkspace(selected);
  }
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void action(async () => {
      const data = new FormData(loginForm);
      await api("/session", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      loginForm.reset();
      await loadWorkspaces();
    });
  });
  root.querySelector("#signup")!.addEventListener("click", () => {
    if (!loginForm.reportValidity()) return;
    void action(async () => {
      const data = new FormData(loginForm);
      const result = await api<{ message: string }>("/signup", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      status.textContent = result.message;
    });
  });
  root.querySelector("#signout")!.addEventListener(
    "click",
    () =>
      void action(async () => {
        await api("/session", "DELETE");
        signedOut();
        history.replaceState(null, "", "/app");
      }),
  );
  root
    .querySelector<HTMLFormElement>("#create-workspace")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void action(async () => {
        const workspace = await api<Workspace>("/workspaces", "POST", {
          name: new FormData(form).get("name"),
        });
        form.reset();
        history.replaceState(null, "", `/app?workspace=${workspace.id}`);
        await loadWorkspaces();
      });
    });
  try {
    await api("/session");
    await loadWorkspaces();
    status.textContent = "";
  } catch (error) {
    signedOut();
    status.textContent = "";
    if (error instanceof Error && !error.message.startsWith("Sign in"))
      status.textContent = error.message;
  }
}
