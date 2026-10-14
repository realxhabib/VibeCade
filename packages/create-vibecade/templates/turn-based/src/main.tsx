import { VibeCadeProvider } from "vibecade-sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VibeCadeProvider
      fallback={<p className="center muted">Connecting…</p>}
      errorFallback={(error) => <p className="center">Couldn’t reach VibeCade: {error.message}</p>}
      // Only used when the page is opened directly (npm run dev): a local mock
      // host seats you (X, moves first) against a practice bot, with turns on.
      options={{ mock: { turnBased: true, startDelayMs: 600 } }}
    >
      <App />
    </VibeCadeProvider>
  </StrictMode>,
);
