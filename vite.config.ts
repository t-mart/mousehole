import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "PUBLIC_");
  return {
    root: path.resolve(import.meta.dirname, "src/frontend"),
    // Everything Vite serves/builds lives under /web/ — the backend treats the
    // prefix as "frontend assets" and everything else as its own.
    base: "/web/",
    envDir: import.meta.dirname,
    // Don't wipe the backend's logs when both run under `bun dev`.
    clearScreen: false,
    plugins: [react(), tailwindcss()],
    // Inline the vars the frontend reads via process.env, so shared modules
    // (e.g. #shared/git-hash.ts) stay dual-use: runtime-read on the backend,
    // inlined into the bundle here.
    define: {
      "process.env.PUBLIC_GIT_HASH": JSON.stringify(resolveGitHash()),
      "process.env.PUBLIC_DEMO_MODE": JSON.stringify(
        process.env.PUBLIC_DEMO_MODE ?? env.PUBLIC_DEMO_MODE ?? "false",
      ),
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
