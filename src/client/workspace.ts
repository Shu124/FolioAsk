import type { Workspace } from "../server/contracts";
import { mountDocuments } from "./documents";
import { passwordVisibility } from "./password-field";

export async function mountWorkspace(root: HTMLElement) {
  const callback = new URL(location.href);
  const googleCallback = callback.searchParams.get("oauth") === "google";
  const callbackCode = callback.searchParams.get("code");
  const callbackState = callback.searchParams.get("state");
  // Remove provider codes before any further navigation or requests.
  if (googleCallback) history.replaceState(null, "", "/app");
  root.innerHTML = `<header class="site-header"><a class="brand" href="/">FolioAsk</a><a href="/">Back to guided demo</a></header><main class="account-page"><p class="eyebrow">YOUR RESEARCH, IN ONE PLACE</p><div role="status" id="account-status"></div><section id="signin"><h1>Sign in to your workspace</h1><p>Sign in to upload approved synthetic PDFs and inspect source-backed answers. Live AI requires operator configuration; private and sensitive files remain excluded.</p><form id="signin-form"><label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label><label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><div class="form-actions"><button class="primary" type="submit">Sign in</button><button type="button" id="signup">Create account</button></div></form><p class="quiet">New accounts require email confirmation. Sessions expire after 24 hours; signing out revokes this session immediately.</p></section><section id="workspace-home" hidden><div class="section-top"><h1>Your workspaces</h1><button id="signout">Sign out</button></div><form id="create-workspace"><label>Workspace name<input name="name" required maxlength="100" placeholder="e.g. Elm Street project"></label><button class="primary">Create workspace</button></form><div class="workspace-layout"><nav aria-label="Your workspaces" id="workspace-list"></nav><section id="workspace-detail"><h2>Select a workspace</h2><p>Group related documents for your research.</p></section></div></section></main>`;
  const status = root.querySelector<HTMLElement>("#account-status")!;
  const signin = root.querySelector<HTMLElement>("#signin")!;
  const home = root.querySelector<HTMLElement>("#workspace-home")!;
  const detail = root.querySelector<HTMLElement>("#workspace-detail")!;
  const list = root.querySelector<HTMLElement>("#workspace-list")!;
  const loginForm = root.querySelector<HTMLFormElement>("#signin-form")!;
  const authHeading = signin.querySelector("h1")!;
  const passwordInput =
    loginForm.querySelector<HTMLInputElement>('[name="password"]')!;
  const submitAuth =
    loginForm.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const toggleAuth = root.querySelector<HTMLButtonElement>("#signup")!;
  const passwordHelp = document.createElement("p");
  passwordHelp.id = "password-help";
  passwordHelp.className = "quiet";
  passwordHelp.textContent = "Use at least 12 characters for your password.";
  const confirmation = document.createElement("label");
  confirmation.textContent = "Confirm password";
  const confirmInput = document.createElement("input");
  confirmInput.type = "password";
  confirmInput.name = "confirm-password";
  confirmInput.autocomplete = "new-password";
  confirmInput.maxLength = 256;
  confirmation.append(confirmInput);
  const actions = loginForm.querySelector(".form-actions")!;
  actions.before(passwordHelp, confirmation);
  const passwordControl = passwordVisibility(passwordInput, "password");
  const confirmControl = passwordVisibility(confirmInput, "confirm password");
  const google = document.createElement("button");
  google.type = "button";
  google.className = "google-signin";
  google.textContent = "Continue with Google";
  loginForm.before(google);
  const divider = document.createElement("p");
  divider.className = "auth-divider quiet";
  divider.textContent = "or continue with email";
  google.after(divider);
  google.onclick = () =>
    void action(async () => {
      const result = await api<{ url: string }>("/auth/google", "POST");
      location.assign(result.url);
    });
  let authMode: "signin" | "signup" = "signin";
  function setAuthMode(mode: typeof authMode) {
    authMode = mode;
    const registering = mode === "signup";
    authHeading.textContent = registering
      ? "Create your FolioAsk account"
      : "Sign in to your workspace";
    submitAuth.textContent = registering ? "Create account" : "Sign in";
    toggleAuth.textContent = registering ? "Back to sign in" : "Create account";
    passwordInput.autocomplete = registering
      ? "new-password"
      : "current-password";
    passwordInput.minLength = registering ? 12 : 1;
    if (registering)
      passwordInput.setAttribute("aria-describedby", passwordHelp.id);
    else passwordInput.removeAttribute("aria-describedby");
    passwordHelp.hidden = !registering;
    confirmation.hidden = !registering;
    confirmControl.wrapper.hidden = !registering;
    passwordControl.reset();
    confirmControl.reset();
    confirmInput.disabled = !registering;
    confirmInput.required = registering;
    passwordInput.value = "";
    confirmInput.value = "";
    confirmInput.setCustomValidity("");
    const url = new URL(location.href);
    if (registering) url.searchParams.set("auth", "signup");
    else url.searchParams.delete("auth");
    history.replaceState(null, "", url.pathname + url.search);
  }
  function validateConfirmation() {
    confirmInput.setCustomValidity(
      authMode === "signup" && confirmInput.value !== passwordInput.value
        ? "Passwords must match."
        : "",
    );
  }
  passwordInput.addEventListener("input", validateConfirmation);
  confirmInput.addEventListener("input", validateConfirmation);
  setAuthMode(
    new URL(location.href).searchParams.get("auth") === "signup"
      ? "signup"
      : "signin",
  );
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
    validateConfirmation();
    if (!loginForm.reportValidity()) return;
    void action(async () => {
      const data = new FormData(loginForm);
      if (authMode === "signup") {
        const result = await api<{ message: string }>("/signup", "POST", {
          email: data.get("email"),
          password: data.get("password"),
        });
        setAuthMode("signin");
        status.textContent = result.message;
        passwordInput.focus();
        return;
      }
      await api("/session", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      loginForm.reset();
      await loadWorkspaces();
    });
  });
  root.querySelector("#signup")!.addEventListener("click", () => {
    setAuthMode(authMode === "signin" ? "signup" : "signin");
    status.textContent = "";
    loginForm.querySelector<HTMLInputElement>('[name="email"]')!.focus();
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
    if (googleCallback) {
      if (!callbackCode)
        throw new Error(
          "Google sign-in was cancelled or failed. Please try again.",
        );
      await api("/auth/google/complete", "POST", {
        code: callbackCode,
        state: callbackState,
      });
    }
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
