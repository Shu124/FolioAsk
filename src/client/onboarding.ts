import type { Account } from "../server/contracts";
import type { Api } from "./documents";
import { labelWithIcon } from "./icons";

export function mountOnboarding(
  root: HTMLElement,
  profile: Account,
  api: Api,
  done: () => void,
) {
  root.className = "profile-onboarding";
  root.innerHTML = `<p class="eyebrow">WELCOME TO FOLIOASK</p><h1>Make this workspace yours</h1><p class="page-description">A few details, then your first project. You can change your preferences in Settings.</p><ol class="onboarding-steps" aria-label="Setup progress"><li aria-current="step">1 · Your profile</li><li>2 · Free pilot</li><li>3 · First project</li></ol><form><label>Display name<input name="name" required maxlength="100" autocomplete="nickname" placeholder="What should we call you?"></label><label>Industry<select name="industry" required><option value="">Select your industry</option><option>Construction</option><option>Finance</option><option>Healthcare</option><option>Other</option></select></label><p class="quiet">This preference does not authorize sensitive or regulated documents.</p><button class="primary">Continue</button></form><section class="onboarding-plan" hidden><span class="badge">FREE PILOT</span><h2>Start with source-backed research</h2><p>3 lifetime uploads · 30 MB storage · 20 lifetime answers</p><p>Approved synthetic PDFs only. No patient records, private or confidential files. Paid plans and comparisons are not available yet.</p><label class="acknowledgement"><input type="checkbox">I understand the document restrictions and free allowance.</label><div class="form-actions"><button type="button" class="back">Back</button><button type="button" class="primary finish">Continue to project</button></div></section><p role="status"></p>`;
  const form = root.querySelector("form")!;
  const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
  const industry = form.querySelector<HTMLSelectElement>("select")!;
  industry.setAttribute("aria-label", "Industry");
  const plan = root.querySelector<HTMLElement>(".onboarding-plan")!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  name.value = profile.name ?? "";
  industry.value = profile.industry ?? "";
  let disposed = false;
  let pending = false;
  const step = (second: boolean) => {
    form.hidden = second;
    plan.hidden = !second;
    [...root.querySelectorAll(".onboarding-steps li")].forEach((li, i) => {
      if (i === (second ? 1 : 0)) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    (second ? plan.querySelector<HTMLInputElement>("input")! : name).focus();
  };
  async function save(complete: boolean) {
    if (pending || disposed) return;
    if (complete && !plan.querySelector<HTMLInputElement>("input")!.checked) {
      status.textContent =
        "Please acknowledge the restrictions before continuing.";
      return;
    }
    pending = true;
    root
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    status.textContent = "Saving your preferences…";
    try {
      await api("/account/onboarding", "PATCH", {
        name: name.value,
        industry: industry.value,
        complete,
        acknowledge: complete,
        plan: "free",
      });
      if (disposed) return;
      status.textContent = "";
      if (complete) done();
      else step(true);
    } catch (error) {
      if (!disposed)
        status.textContent =
          error instanceof Error
            ? error.message
            : "Could not save. Please retry.";
    } finally {
      pending = false;
      if (!disposed)
        root
          .querySelectorAll("button")
          .forEach((button) => (button.disabled = false));
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    void save(false);
  };
  const finish = plan.querySelector<HTMLButtonElement>(".finish")!;
  labelWithIcon(finish, "Folder", "Continue to project");
  finish.onclick = () => {
    void save(true);
  };
  plan.querySelector<HTMLButtonElement>(".back")!.onclick = () => step(false);
  if (name.value && industry.value && !profile.onboardingComplete) step(true);
  return {
    dispose() {
      disposed = true;
      root.replaceChildren();
    },
  };
}
