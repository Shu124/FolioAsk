import { labelWithIcon } from "./icons";

/** Relocate one live panel between a desktop slot and a native modal drawer. */
export function responsiveDrawer(
  content: HTMLElement,
  trigger: HTMLButtonElement,
  label: string,
  query: string,
) {
  const slot = document.createComment(`${label} desktop slot`);
  content.before(slot);
  const dialog = document.createElement("dialog");
  dialog.className = "workspace-drawer";
  dialog.setAttribute("aria-label", label);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "drawer-close";
  labelWithIcon(closeButton, "Close", `Close ${label.toLowerCase()}`);
  dialog.append(closeButton);
  slot.parentElement!.append(dialog);
  const media = matchMedia(query);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  function close() {
    if (dialog.open) dialog.close();
    trigger.setAttribute("aria-expanded", "false");
  }
  function resize() {
    const focused = document.activeElement;
    const focusedInside = content.contains(focused);
    const focusedDrawer = dialog.contains(focused);
    close();
    if (media.matches) dialog.append(content);
    else slot.after(content);
    trigger.hidden = !media.matches;
    if (focusedInside && media.matches) trigger.focus({ preventScroll: true });
    if (!media.matches && (focusedInside || focusedDrawer)) {
      const target =
        focusedInside && focused instanceof HTMLElement
          ? focused
          : content.querySelector<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary",
            );
      target?.focus({ preventScroll: true });
    }
  }
  trigger.onclick = () => {
    if (!media.matches) return;
    dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
    closeButton.focus({ preventScroll: true });
  };
  closeButton.onclick = close;
  dialog.onkeydown = (event) => {
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
      ),
    ].filter((node) => node.checkVisibility());
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  dialog.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    if (media.matches && trigger.isConnected && trigger.checkVisibility())
      trigger.focus({ preventScroll: true });
  });
  dialog.onclick = (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        close();
    }
  };
  media.addEventListener("change", resize);
  resize();
  return {
    close,
    dispose() {
      media.removeEventListener("change", resize);
      close();
      slot.after(content);
      dialog.remove();
      slot.remove();
      trigger.onclick = null;
    },
  };
}
