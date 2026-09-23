import { labelWithIcon } from "./icons";
export type Theme = "light" | "dark" | "system";
const key = "folioask-theme";
const media = matchMedia("(prefers-color-scheme: dark)");
let preference: Theme = "system";
function valid(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
try {
  const stored = localStorage.getItem(key);
  if (valid(stored)) preference = stored;
} catch {
  /* Private browsing can disable storage. */
}
function apply() {
  document.documentElement.dataset.theme =
    preference === "system" ? (media.matches ? "dark" : "light") : preference;
  window.dispatchEvent(new Event("folio-theme-change"));
}
function setTheme(value: Theme) {
  if (!valid(value)) return;
  preference = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The current tab still works. */
  }
  apply();
}
media.addEventListener("change", apply);
window.addEventListener("storage", (event) => {
  if (event.key === key || event.key === null) {
    preference = valid(event.newValue) ? event.newValue : "system";
    apply();
  }
});
apply();

export function mountTheme(root: HTMLElement, shortcut: HTMLButtonElement) {
  root.innerHTML = `<h3>Appearance</h3><label>Theme<select><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label><p class="quiet">Remembered on this device. Original document pages retain their colors.</p>`;
  const select = root.querySelector("select")!;
  select.setAttribute("aria-label", "Theme");
  const sync = () => {
    select.value = preference;
    const dark = document.documentElement.dataset.theme === "dark";
    labelWithIcon(
      shortcut,
      dark ? "Sun" : "Moon",
      dark ? "Switch to light mode" : "Switch to dark mode",
    );
    shortcut.title = dark ? "Switch to light mode" : "Switch to dark mode";
  };
  select.onchange = () => {
    if (valid(select.value)) setTheme(select.value);
  };
  shortcut.onclick = () =>
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  window.addEventListener("folio-theme-change", sync);
  sync();
  return () => window.removeEventListener("folio-theme-change", sync);
}
