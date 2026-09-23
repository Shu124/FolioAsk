import type { Workspace } from "../server/contracts";
import { icon } from "./icons";

export function mountProjectSwitcher(
  root: HTMLElement,
  change: (id: string) => void,
) {
  const shell = document.createElement("div");
  shell.className = "project-switcher";
  shell.innerHTML = `<span class="eyebrow">CURRENT PROJECT</span><button type="button" class="project-switcher-trigger" aria-expanded="false" aria-controls="project-switcher-panel" aria-haspopup="dialog">${icon("Folder")}<span>Select project</span>${icon("ChevronDown")}</button><div id="project-switcher-panel" class="project-switcher-panel" popover="auto" role="dialog" aria-label="Choose project"><label>Find project<input type="search" placeholder="Search projects" autocomplete="off"></label><div class="project-options"></div><p class="project-picker-hint">Switch between your projects</p></div>`;
  root.prepend(shell);
  const trigger = shell.querySelector<HTMLButtonElement>("button")!;
  const panel = shell.querySelector<HTMLElement>(".project-switcher-panel")!;
  const search = shell.querySelector<HTMLInputElement>("input")!;
  const options = shell.querySelector<HTMLElement>(".project-options")!;
  let projects: Workspace[] = [],
    current = "";
  const isOpen = () => panel.matches(":popover-open");
  function close() {
    if (isOpen()) panel.hidePopover();
    trigger.setAttribute("aria-expanded", "false");
  }
  function position() {
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
    const topEdge = (viewport?.offsetTop ?? 0) + 12;
    const width = (viewport?.width ?? innerWidth) - 24;
    const bottom =
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - 12;
    if (rect.bottom < topEdge || rect.top > bottom) {
      close();
      return;
    }
    const below = bottom - rect.bottom - 8,
      above = rect.top - topEdge - 8;
    const placeBelow = below >= Math.min(320, above);
    panel.style.width = `${Math.min(Math.max(rect.width, 280), width)}px`;
    panel.style.left = `${Math.max(leftEdge, Math.min(rect.left, leftEdge + width - panel.getBoundingClientRect().width))}px`;
    panel.style.maxHeight = `${Math.max(0, Math.min(bottom - topEdge, Math.max(96, placeBelow ? below : above)))}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.top = `${Math.max(topEdge, Math.min(bottom - height, placeBelow ? rect.bottom + 8 : rect.top - height - 8))}px`;
  }
  function render() {
    options.replaceChildren();
    for (const project of projects.filter((p) =>
      p.name.toLowerCase().includes(search.value.trim().toLowerCase()),
    )) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-option";
      button.innerHTML = icon("Folder");
      const name = document.createElement("span");
      name.textContent = project.name;
      button.append(name);
      if (project.id === current) {
        button.setAttribute("aria-current", "true");
        button.insertAdjacentHTML("beforeend", icon("Check"));
      }
      button.onclick = () => {
        close();
        trigger.focus({ preventScroll: true });
        change(project.id);
      };
      options.append(button);
    }
    if (!options.childElementCount)
      options.textContent = "No matching projects.";
    position();
  }
  trigger.onclick = () => {
    if (isOpen()) {
      close();
      return;
    }
    search.value = "";
    render();
    panel.showPopover();
    trigger.setAttribute("aria-expanded", "true");
    position();
    search.focus({ preventScroll: true });
  };
  panel.addEventListener("toggle", () =>
    trigger.setAttribute("aria-expanded", String(isOpen())),
  );
  shell.onkeydown = (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      close();
      trigger.focus({ preventScroll: true });
    }
  };
  shell.addEventListener("focusout", (event) => {
    if (
      event.relatedTarget instanceof Node &&
      shell.contains(event.relatedTarget)
    )
      return;
    close();
  });
  search.oninput = render;
  // The top-layer picker escapes sidebar clipping; the list alone scrolls.
  const onScroll = (event: Event) => {
    if (event.target instanceof Node && panel.contains(event.target)) return;
    position();
  };
  window.addEventListener("resize", position);
  window.addEventListener("scroll", onScroll, true);
  window.visualViewport?.addEventListener("resize", position);
  window.visualViewport?.addEventListener("scroll", position);
  // Font/layout changes can move the anchor after a viewport resize event.
  const observer = new ResizeObserver(position);
  observer.observe(trigger);
  if (root.parentElement) observer.observe(root.parentElement);
  return {
    update(items: Workspace[], id: string) {
      projects = items;
      current = id;
      const name = projects.find((p) => p.id === id)?.name ?? "Select project";
      trigger.querySelector("span")!.textContent = name;
      trigger.title = name;
      trigger.disabled = !projects.length;
      render();
    },
    dispose() {
      observer.disconnect();
      close();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      shell.remove();
    },
  };
}
