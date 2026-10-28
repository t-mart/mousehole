import { execSync } from "node:child_process";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import {
  WEB_BASE_URL,
  WEB_BASE_URL_PLACEHOLDER,
} from "./src/shared/web-base-url.ts";

// Prefer the environment (Docker build arg), fall back to git (local dev and
// builds), else inline an empty string (the footer hides an absent hash).
function resolveGitHash(): string {
  if (process.env.PUBLIC_GIT_HASH) return process.env.PUBLIC_GIT_HASH;
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
}

// The dev server is the one place the backend does not serve the HTML, so it has
// to fill in the placeholder itself. `vite build` leaves the marker alone: the
// Bun server substitutes the base when it serves the shell (see createApp).
function baseUrlPlaceholderPlugin(): Plugin {
  return {
    name: "mousehole-base-url-placeholder",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html.replaceAll(WEB_BASE_URL_PLACEHOLDER, WEB_BASE_URL),
    },
  };
}

export default defineConfig(({ command }) => {
  return {
    root: path.resolve(import.meta.dirname, "src/frontend"),
    // Build with relative asset URLs so the shell's own <base> decides where
    // they resolve — the app then works at the origin root and under a
    // configured prefix, without rebuilding. Dev keeps the absolute base, which
    // is what the backend's dev proxy forwards to.
    base: command === "build" ? "./" : WEB_BASE_URL,
    envDir: import.meta.dirname,
    // Don't wipe the backend's logs when both run under `bun dev`.
    clearScreen: false,
    plugins: [react(), tailwindcss(), baseUrlPlaceholderPlugin()],
    // Inline the vars the frontend reads via process.env, so shared modules
    // (e.g. #shared/git-hash.ts) stay dual-use: runtime-read on the backend,
    // inlined into the bundle here.
    define: {
      "process.env.PUBLIC_GIT_HASH": JSON.stringify(resolveGitHash()),
    },
    server: {
      // The backend's dev reverse proxy points at this port — don't drift off
      // it when it's taken.
      port: 5173,
      strictPort: true,
      // The page is served from the backend's origin (:5010/web); have the
      // injected HMR client connect directly to Vite instead of through the
      // proxy (WebSockets don't pass through fetch()-based proxying).
      hmr: { clientPort: 5173 },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
  };
});
