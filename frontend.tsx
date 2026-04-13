import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";
import App from "./App.tsx";

// Lock #root in place when modals open so blurred background doesn't shift on scroll
let savedScrollY = 0;
const observer = new MutationObserver(() => {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  if (document.body.classList.contains("modal-open")) {
    savedScrollY = window.scrollY;
    rootEl.style.top = `-${savedScrollY}px`;
  } else if (rootEl.style.position === "fixed" || rootEl.style.top) {
    rootEl.style.top = "";
    window.scrollTo(0, savedScrollY);
  }
});
observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
