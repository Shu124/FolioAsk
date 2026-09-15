/** Keep visibility controls outside the label so the input's accessible name is stable. */
export function passwordVisibility(input: HTMLInputElement, name: string) {
  const label = input.closest("label")!;
  const wrapper = document.createElement("div");
  wrapper.className = "password-field";
  label.before(wrapper);
  wrapper.append(label);
  const button = document.createElement("button");
  button.type = "button";
  const reset = () => {
    input.type = "password";
    button.textContent = `Show ${name}`;
    button.setAttribute("aria-pressed", "false");
  };
  button.onclick = () => {
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    button.textContent = `${showing ? "Hide" : "Show"} ${name}`;
    button.setAttribute("aria-pressed", String(showing));
  };
  wrapper.append(button);
  reset();
  return { reset, wrapper };
}
