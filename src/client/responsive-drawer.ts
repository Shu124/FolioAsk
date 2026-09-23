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
    const focusedInside = content.contains(document.activeElement);
    close();
    if (media.matches) dialog.append(content);
    else slot.after(content);
    trigger.hidden = !media.matches;
    if (focusedInside && media.matches) trigger.focus({ preventScroll: true });
  }
  trigger.onclick = () => {
    if (!media.matches) return;
    dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
    closeButton.focus({ preventScroll: true });
  };
  closeButton.onclick = close;
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
