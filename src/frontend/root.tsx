/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { App } from "./components/app";
import { ErrorProvider } from "./lib/error-context";
import logoUrl from "./logo.svg";

document.head.append(
  Object.assign(document.createElement("link"), {
    rel: "icon",
    type: "image/svg+xml",
    href: logoUrl,
  }),
);

const queryClient = new QueryClient();

const element = document.getElementById("root")!;
const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorProvider>
        <App />
      </ErrorProvider>
    </QueryClientProvider>
  </StrictMode>
);

createRoot(element).render(app);
