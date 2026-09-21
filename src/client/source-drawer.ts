export function sourceDrawer(
  root: HTMLElement,
  onClose: () => void = () => {},
) {
  const dialog = document.createElement("dialog");
  dialog.className = "source-drawer";
  dialog.setAttribute("aria-label", "Source document");
  dialog.innerHTML =
    '<header><div><p class="eyebrow">VERIFY THE EVIDENCE</p><h2>Source document</h2></div><button type="button" autofocus>Close source</button></header><div class="drawer-body"></div>';
  const body = dialog.querySelector<HTMLElement>(".drawer-body")!;
  root.append(dialog);
  let opener: HTMLElement | null = null;
  dialog.querySelector("button")!.onclick = () => dialog.close();
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea, [tabindex]",
      ),
    ].filter(
      (node) =>
        node.tabIndex >= 0 &&
        !node.matches(":disabled") &&
        node.getClientRects().length > 0,
    );
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener("close", () => {
    onClose();
    if (opener?.isConnected) opener.focus();
  });
  return {
    body,
    show() {
      if (!dialog.open) {
        opener =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        dialog.showModal();
      }
    },
    close() {
      if (dialog.open) dialog.close();
    },
    dispose() {
      dialog.close();
      dialog.remove();
    },
  };
}
