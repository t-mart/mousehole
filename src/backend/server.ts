import { config } from "#backend/config.ts";
import {
  contactMutex,
  startBackgroundContactTask,
  stopBackgroundContactTask,
} from "#backend/contact.ts";
import { validateRuntimeSecurityConfig } from "#backend/http-boundary.ts";
import { logger } from "#backend/logger.ts";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../package.json";
import { createApp, type WebMount } from "./app.ts";

/**
 * Composition root: assemble the app, bind the listener, and start background
 * work. Everything Bun-server-specific lives in this one call.
 *
 * @returns the server URL and an async `stop` that unwinds it all.
 */
export function startServer() {
  // Dev serves the web UI by reverse-proxying to the Vite dev server (run both
  // with `bun dev`); prod serves the `vite build` output from dist/.
  const webMount: WebMount =
    process.env.NODE_ENV === "production"
      ? { mode: "serve-static", root: "./dist" }
      : { mode: "vite-dev-server-proxy", target: "http://localhost:5173" };

  const app = createApp(config, webMount);

  const server = Bun.serve({
    port: config.port,

    // Bun closes idle connections after 10s by default, and a quiet SSE stream
    // counts as idle — disable the timeout.
    idleTimeout: 0,

    fetch: (request) => app.fetch(request),
  });

  logger.info(`Mousehole v${version} (${gitHash}) running at ${server.url}`);
  validateRuntimeSecurityConfig();
  if (config.stateDirPathDeprecationWarning) {
    logger.warn(config.stateDirPathDeprecationWarning);
  }

  startBackgroundContactTask();

  return {
    url: server.url,
    stop: async () => {
      logger.info("Shutting down...");
      await contactMutex.acquire();
      await server.stop(true);
      stopBackgroundContactTask();
    },
  };
}
