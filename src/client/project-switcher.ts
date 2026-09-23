import type { Workspace } from "../server/contracts";
import { icon } from "./icons";

export function mountProjectSwitcher(
  root: HTMLElement,
  change: (id: string) => void,
) {
  // Ordinary buttons provide keyboard and touch access without simulated listbox keys.
  const shell = document.createElement("div");
  shell.className = "project-switcher";
  shell.innerHTML = `<span class="eyebrow">CURRENT PROJECT</span><button type="button" class="project-switcher-trigger" aria-expanded="false" aria-controls="project-switcher-panel">${icon("Folder")}<span>Select project</span><span aria-hidden="true">⌄</span></button><div id="project-switcher-panel" class="project-switcher-panel" hidden><label>Find project<input type="search" placeholder="Search projects…" autocomplete="off"></label><div class="project-options"></div><p class="quiet">Create projects using Add project in the main area.</p></div>`;
  root.prepend(shell);
  const trigger = shell.querySelector<HTMLButtonElement>("button")!;
  const panel = shell.querySelector<HTMLElement>(".project-switcher-panel")!;
  const search = shell.querySelector<HTMLInputElement>("input")!;
  const options = shell.querySelector<HTMLElement>(".project-options")!;
  let projects: Workspace[] = [];
  let current = "";
  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  function render() {
    options.replaceChildren();
    for (const project of projects.filter((p) =>
      p.name.toLowerCase().includes(search.value.toLowerCase().trim()),
    )) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-option";
      button.innerHTML = icon("Folder");
      const name = document.createElement("span");
      name.textContent = project.name;
      button.append(name);
      if (project.id === current) button.setAttribute("aria-current", "true");
      button.onclick = () => {
        close();
        trigger.focus();
        change(project.id);
      };
      options.append(button);
    }
    if (!options.childElementCount)
      options.textContent = "No matching projects.";
  }
  trigger.onclick = () => {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    render();
    search.focus();
  };
  shell.onkeydown = (event) => {
    if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  };
  search.oninput = render;
  const outside = (event: Event) => {
    if (event.target instanceof Node && !shell.contains(event.target)) close();
  };
  document.addEventListener("pointerdown", outside);
  return {
    update(items: Workspace[], id: string) {
      projects = items;
      current = id;
      trigger.querySelector("span")!.textContent =
        projects.find((p) => p.id === id)?.name ?? "Select project";
      trigger.disabled = !projects.length;
      render();
    },
    dispose() {
      document.removeEventListener("pointerdown", outside);
      shell.remove();
    },
  };
}
