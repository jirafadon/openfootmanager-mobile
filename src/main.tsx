import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { i18nReady } from "./i18n";
import { preloadWasm } from "./bridge/wasmLoader";
import App from "./App";

// Start loading the WASM engine in parallel with React boot
preloadWasm();

const rootElement = document.getElementById("root") as HTMLElement | null;

if (!rootElement) {
  throw new Error("Missing root element");
}

const root = ReactDOM.createRoot(rootElement);

function renderApp() {
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void i18nReady
  .catch((error) => {
    console.error("Failed to initialize i18n:", error);
  })
  .finally(renderApp);
