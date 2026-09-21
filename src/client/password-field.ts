import { labelWithIcon } from "./icons";
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
    labelWithIcon(button, "Eye", `Show ${name}`);
    button.title = `Show ${name}`;
    button.setAttribute("aria-pressed", "false");
  };
  button.onclick = () => {
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    labelWithIcon(
      button,
      showing ? "EyeOff" : "Eye",
      `${showing ? "Hide" : "Show"} ${name}`,
    );
    button.setAttribute("aria-pressed", String(showing));
    button.title = `${showing ? "Hide" : "Show"} ${name}`;
  };
  wrapper.append(button);
  reset();
  return { reset, wrapper };
}
