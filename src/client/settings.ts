import type { Account, Workspace } from "../server/contracts";
import type { Api } from "./documents";
import { passwordVisibility } from "./password-field";
import { labelWithIcon } from "./icons";
import { mountPlanUsage } from "./plan-usage";
import type { PlanUsage } from "../server/storage-limits";
import { mountSettingsHistory } from "./settings-history";

export function mountSettings(
  root: HTMLElement,
  project: Workspace,
  api: Api,
  renamed: (name: string) => void,
  reauthenticate: (message: string) => void,
  appearance: HTMLElement,
  conversationsChanged: () => void,
) {
  root.innerHTML = `<section><h3>Account</h3><p id="profile-email"></p><p id="profile-providers" class="quiet"></p><form id="profile-form"><label>Display name<input name="name" required maxlength="100"></label><button>Save name</button></form><p role="status" aria-label="Account settings status" id="settings-status"></p></section><section><h3>Project</h3><form id="rename-form"><label>Rename project<input name="name" required maxlength="100"></label><button>Save project name</button></form></section><section><h3>Plan and usage</h3><p class="badge">Controlled free pilot</p><div id="settings-usage">Loading usage…</div><p class="quiet">Public, non-sensitive, operator-approved fixtures only. No paid subscription is active.</p></section><section id="password-settings" hidden><h3>Change password</h3><p class="quiet">Changing your password signs out all FolioAsk sessions.</p><form id="password-form"><label>Current password<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="256"></label><label>New password<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="256"></label><label>Confirm new password<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="256"></label><button>Change password</button></form></section>`;
  let disposed = false;
  const status = root.querySelector<HTMLElement>("#settings-status")!;
  const [accountSection, projectSection, usageSection, passwordSection] = [
    ...root.querySelectorAll<HTMLElement>(":scope > section"),
  ];
  const planPanel = document.createElement("section");
  planPanel.setAttribute("aria-label", "Plan allowance");
  usageSection.append(planPanel);
  const planUsage = mountPlanUsage(planPanel, "all", api);
  const accountPanel = document.createElement("div");
  accountPanel.append(accountSection);
  const securityPanel = document.createElement("section");
  securityPanel.innerHTML = `<h3>Security</h3><p class="page-description">Manage security with the provider you use to sign in.</p><p class="security-provider-note">Loading sign-in methods…</p><details class="password-security" hidden><summary>Change email password</summary></details>`;
  const passwordDetails =
    securityPanel.querySelector<HTMLDetailsElement>("details")!;
  passwordDetails.append(passwordSection);
  const historyPanel = document.createElement("section");
  let chatHistory: ReturnType<typeof mountSettingsHistory> | undefined;
  const sections = {
    Account: accountPanel,
    Project: projectSection,
    Appearance: appearance,
    Usage: usageSection,
    "Chat history": historyPanel,
    Security: securityPanel,
  };
  const navigation = document.createElement("nav");
  navigation.className = "settings-navigation section-tabs";
  navigation.setAttribute("aria-label", "Settings sections");
  root.prepend(navigation, status);
  const selectSection = (name: keyof typeof sections, remember = true) => {
    for (const [key, panel] of Object.entries(sections))
      panel.hidden = key !== name;
    for (const button of navigation.querySelectorAll("button"))
      button.setAttribute("aria-pressed", String(button.textContent === name));
    if (remember) {
      const url = new URL(location.href);
      url.searchParams.set("settings", name.toLowerCase());
      history.replaceState(null, "", url.pathname + url.search);
      status.textContent = "";
    }
    if (name === "Usage") void refreshUsage();
    if (name === "Chat history") {
      chatHistory ??= mountSettingsHistory(
        historyPanel,
        project.id,
        api,
        conversationsChanged,
      );
      void chatHistory.refresh();
    }
  };
  const sectionIcons = {
    Account: "User",
    Project: "Folder",
    Appearance: "Palette",
    Usage: "Usage",
    "Chat history": "Chat",
    Security: "Lock",
  } as const;
  for (const name of Object.keys(sections) as (keyof typeof sections)[]) {
    const panel = sections[name];
    panel.classList.add("settings-panel");
    root.append(panel);
    const button = document.createElement("button");
    labelWithIcon(button, sectionIcons[name], name);
    button.onclick = () => selectSection(name);
    navigation.append(button);
  }
  const requested = new URL(location.href).searchParams.get("settings");
  selectSection(
    (Object.keys(sections) as (keyof typeof sections)[]).find(
      (name) => name.toLowerCase() === requested,
    ) ?? "Account",
    false,
  );
  const profileForm = root.querySelector<HTMLFormElement>("#profile-form")!;
  const renameForm = root.querySelector<HTMLFormElement>("#rename-form")!;
  const passwordForm = root.querySelector<HTMLFormElement>("#password-form")!;
  labelWithIcon(profileForm.querySelector("button")!, "Save", "Save name");
  labelWithIcon(
    renameForm.querySelector("button")!,
    "Save",
    "Save project name",
  );
  labelWithIcon(
    passwordForm.querySelector('button:not([type="button"])')!,
    "Lock",
    "Change password",
  );
  for (const [section, description] of [
    [accountSection, "Your profile information and sign-in methods."],
    [projectSection, "Keep a clear, recognizable name for this project."],
    [usageSection, "Your real usage across the controlled free pilot."],
  ] as const) {
    const text = document.createElement("p");
    text.className = "page-description";
    text.textContent = description;
    section.querySelector("h3")!.after(text);
  }
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
      passwordDetails.hidden = !account.providers?.includes("email");
      securityPanel.querySelector(".security-provider-note")!.textContent =
        account.providers?.includes("email")
          ? "Your email password is managed separately from your profile. Open the option below only when you need to change it."
          : account.providers?.includes("google")
            ? "For Google sign-in, manage your password and two-step verification in your Google Account. FolioAsk does not have a Google password to change."
            : "Sign-in provider details are unavailable. Please try again later before changing security settings.";
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
      const usage = await api<PlanUsage>("/usage");
      if (!disposed) {
        planUsage.update(usage);
        const summary = root.querySelector("#settings-usage")!;
        summary.replaceChildren();
        for (const [name, glyph, value, detail] of [
          [
            "Document uploads",
            "Documents",
            usage.uploadsRemaining,
            `${usage.uploadsRemaining} of 3 lifetime uploads remaining`,
          ],
          [
            "AI answers",
            "Chat",
            usage.answersRemaining,
            `${usage.answersRemaining} of 20 lifetime answers remaining`,
          ],
          [
            "Stored files",
            "Folder",
            `${(usage.storedBytes / 1_000_000).toFixed(2)} MB`,
            `${(usage.storedBytes / 1_000_000).toFixed(2)} MB stored`,
          ],
        ] as const) {
          const card = document.createElement("section");
          card.className = "usage-card";
          const label = document.createElement("p");
          labelWithIcon(label, glyph, name);
          const number = document.createElement("strong");
          number.textContent = String(value);
          const description = document.createElement("p");
          description.className = "quiet";
          description.textContent = detail;
          card.append(label, number, description);
          summary.append(card);
        }
      }
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
      planUsage.dispose();
      chatHistory?.dispose();
      root.replaceChildren();
    },
  };
}
