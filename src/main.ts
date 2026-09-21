import "./style.css";
import "./workspace.css";
import "./landing.css";
import "./demo.css";
import "./client/theme";
import {
  landingHeader,
  landingHero,
  landingFeatures,
  landingDetails,
  landingFooter,
} from "./landing";
import { mountDemo } from "./demo";

const app = document.querySelector<HTMLDivElement>("#app")!;
if (location.pathname === "/app") {
  void import("./client/workspace").then(({ mountWorkspace }) =>
    mountWorkspace(app),
  );
} else {
  app.classList.add("landing-page");
  app.innerHTML = `${landingHeader}<main id="main-content">${landingHero}${landingFeatures}<section id="demo" class="demo-section" aria-label="Guided demo"></section>${landingDetails}</main>${landingFooter}`;
  mountDemo(document.getElementById("demo")!);
}
