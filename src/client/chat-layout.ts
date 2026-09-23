import { labelWithIcon } from "./icons";
import { responsiveDrawer } from "./responsive-drawer";

export function mountChatLayout(
  root: HTMLElement,
  library: HTMLDetailsElement,
) {
  const panel = root.querySelector<HTMLElement>(".answer-panel")!;
  const workbench = document.createElement("div");
  workbench.className = "chat-workbench";
  panel.before(workbench);
  const rail = document.createElement("aside");
  rail.className = "conversation-sidebar";
  library.open = true;
  library.querySelector("summary")!.textContent = "Conversations";
  rail.append(library);
  workbench.append(rail, panel);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "history-drawer-toggle";
  labelWithIcon(toggle, "Chat", "Chat history");
  panel.querySelector(".chat-title-row")!.prepend(toggle);
  const drawer = responsiveDrawer(
    rail,
    toggle,
    "Chat history",
    "(max-width: 1100px)",
  );
  const composer = document.createElement("div");
  composer.className = "chat-composer-area";
  const form = panel.querySelector<HTMLFormElement>("#question-form")!;
  form.before(composer);
  composer.append(
    form,
    panel.querySelector("#question-status")!,
    panel.querySelector(":scope > .quiet:last-child")!,
  );
  panel.querySelector<HTMLElement>(":scope > .eyebrow")!.hidden = true;
  // Dynamic viewport changes include browser chrome / virtual keyboard where
  // exposed. Never mutate the input itself or disable native viewport zoom.
  const viewport = window.visualViewport;
  const updateViewport = () => {
    const top = Math.max(0, workbench.getBoundingClientRect().top);
    const available =
      (viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0) - top - 12;
    workbench.style.setProperty(
      "--chat-available",
      `${Math.max(280, available)}px`,
    );
    const nonHistoryHeight = [...panel.children]
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement &&
          node.id !== "answer-history" &&
          node.checkVisibility(),
      )
      .reduce((height, node) => {
        const style = getComputedStyle(node);
        return (
          height +
          node.getBoundingClientRect().height +
          parseFloat(style.marginTop) +
          parseFloat(style.marginBottom)
        );
      }, 0);
    workbench.classList.toggle(
      "short-chat",
      available < Math.max(520, nonHistoryHeight + 164),
    );
  };
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateViewport);
  };
  window.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  // Defer writes outside ResizeObserver delivery to avoid resize-loop errors.
  const observer = new ResizeObserver(schedule);
  observer.observe(workbench.parentElement!);
  observer.observe(composer);
  observer.observe(panel.querySelector(".chat-management")!);
  updateViewport();
  return {
    closeHistory: drawer.close,
    refresh: schedule,
    dispose() {
      drawer.dispose();
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    },
  };
}
