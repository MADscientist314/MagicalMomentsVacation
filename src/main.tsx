import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";

// A file dropped beside a text box would make the browser open it in place of the app, losing what
// she typed. Boxes that take files handle the drop themselves first.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => {
    if (!e.defaultPrevented && Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
