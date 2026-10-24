import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/literata/400.css";
import "@fontsource/literata/600.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
