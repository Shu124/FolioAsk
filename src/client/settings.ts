import type { Account, Workspace } from "../server/contracts";
import type { Api } from "./documents";
import { passwordVisibility } from "./password-field";

export function mountSettings(
  root: HTMLElement,
  project: Workspace,
  api: Api,
  renamed: (name: string) => void,
  reauthenticate: (message: string) => void,
) {
  root.innerHTML = `<section><h3>Account</h3><p id="profile-email"></p><p id="profile-providers" class="quiet"></p><form id="profile-form"><label>Display name<input name="name" required maxlength="100"></label><button>Save name</button></form><p role="status" aria-label="Account settings status" id="settings-status"></p></section><section><h3>Project</h3><form id="rename-form"><label>Rename project<input name="name" required maxlength="100"></label><button>Save project name</button></form></section><section><h3>Plan and usage</h3><p>Controlled free pilot</p><p id="settings-usage">Loading usage…</p><p class="quiet">Public, non-sensitive, operator-approved fixtures only. No paid subscription is active.</p></section><section id="password-settings" hidden><h3>Change password</h3><p class="quiet">Changing your password signs out all FolioAsk sessions.</p><form id="password-form"><label>Current password<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="256"></label><label>New password<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="256"></label><label>Confirm new password<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="256"></label><button>Change password</button></form></section>`;
  let disposed = false;
  const status = root.querySelector<HTMLElement>("#settings-status")!;
  const profileForm = root.querySelector<HTMLFormElement>("#profile-form")!;
  const renameForm = root.querySelector<HTMLFormElement>("#rename-form")!;
  const passwordForm = root.querySelector<HTMLFormElement>("#password-form")!;
  renameForm.querySelector("input")!.value = project.name;
  const profileName = profileForm.querySelector("input")!;
  profileName.disabled = true;
  profileForm.querySelector("button")!.disabled = true;
  for (const input of passwordForm.querySelectorAll("input"))
    passwordVisibility(
      input,
      input.name === "confirm"
        ? "confirm new password"
        : input.name === "currentPassword"
          ? "current password"
          : "new password",
    );
  function submit(form: HTMLFormElement, work: () => Promise<string>) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>(
        'button:not([type="button"])',
      )!;
      if (button.disabled || disposed) return;
      button.disabled = true;
      status.textContent = "Saving…";
      void work()
        .then((message) => {
          if (!disposed) status.textContent = message;
        })
        .catch((error) => {
          if (!disposed)
            status.textContent =
              error instanceof Error
                ? error.message
                : "Could not save settings. Please retry.";
        })
        .finally(() => {
          button.disabled = false;
        });
    };
  }
  submit(profileForm, async () => {
    await api("/account", "PATCH", { name: profileName.value });
    return "Display name saved.";
  });
  submit(renameForm, async () => {
    const updated = await api<Workspace>(`/workspaces/${project.id}`, "PATCH", {
      name: new FormData(renameForm).get("name"),
    });
    if (!disposed) renamed(updated.name);
    return "Project name saved.";
  });
  const newPassword =
    passwordForm.querySelector<HTMLInputElement>('[name="password"]')!;
  const confirm =
    passwordForm.querySelector<HTMLInputElement>('[name="confirm"]')!;
  const validate = () =>
    confirm.setCustomValidity(
      confirm.value === newPassword.value ? "" : "Passwords must match.",
    );
  newPassword.oninput = validate;
  confirm.oninput = validate;
  submit(passwordForm, async () => {
    validate();
    if (!passwordForm.reportValidity()) return "Passwords must match.";
    const data = new FormData(passwordForm);
    const result = await api<{ message: string }>("/account/password", "POST", {
      currentPassword: data.get("currentPassword"),
      password: data.get("password"),
    });
    passwordForm.reset();
    if (!disposed) reauthenticate(result.message);
    return result.message;
  });
  const loadAccount = api<Account>("/account")
    .then((account) => {
      if (disposed) return;
      root.querySelector("#profile-email")!.textContent = account.email;
      root.querySelector("#profile-providers")!.textContent =
        `Sign-in methods: ${(account.providers ?? []).join(", ") || "Unavailable"}`;
      profileName.value = account.name ?? "";
      profileName.disabled = false;
      profileForm.querySelector("button")!.disabled = false;
      root.querySelector<HTMLElement>("#password-settings")!.hidden =
        !account.providers?.includes("email");
    })
    .catch((error) => {
      if (!disposed)
        status.textContent =
          error instanceof Error
            ? error.message
            : "Account settings unavailable.";
    });
  async function refreshUsage() {
    try {
      const usage = await api<{
        uploadsRemaining: number;
        answersRemaining: number;
        storedBytes: number;
      }>("/usage");
      if (!disposed)
        root.querySelector("#settings-usage")!.textContent =
          `${usage.uploadsRemaining} of 3 lifetime uploads remaining · ${usage.answersRemaining} of 20 lifetime answers remaining · ${(usage.storedBytes / 1_000_000).toFixed(2)} MB stored`;
    } catch {
      if (!disposed)
        root.querySelector("#settings-usage")!.textContent =
          "Usage is unavailable. Configure document storage or try again later.";
    }
  }
  return {
    ready: loadAccount,
    refreshUsage,
    dispose() {
      disposed = true;
      root.replaceChildren();
    },
  };
}
