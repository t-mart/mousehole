import { config } from "#backend/config.ts";
import {
  contactMutex,
  startBackgroundContactTask,
  stopBackgroundContactTask,
} from "#backend/contact.ts";
import { validateRuntimeSecurityConfig } from "#backend/http-boundary.ts";
import { logger } from "#backend/logger.ts";
import index from "#frontend/index.html";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../package.json";
import { createApp } from "./app.ts";

/**
 * Composition root: assemble the app, bind the listener, and start background
 * work. Everything Bun-server-specific lives in this one call.
 *
 * @returns the server URL and an async `stop` that unwinds it all.
 */
export function startServer() {
  const app = createApp(config);

  const server = Bun.serve({
    port: config.port,

    // Bun closes idle connections after 10s by default, and a quiet SSE stream
    // counts as idle — disable the timeout.
    idleTimeout: 0,

    // Interim until Vite owns the frontend: Bun's fullstack dev server bundles
    // and serves the web UI from the HTML import. Everything that doesn't match
    // falls through to the Hono app.
    routes: { "/web": index },
    development: process.env.NODE_ENV !== "production" && {
      // Enable browser hot reloading in development
      hmr: true,

      // Echo console logs from the browser to the server
      console: true,
    },

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

      // despite passing true to immediately stop, bun sometimes still lags, so
      // just don't await it
      void server.stop(true);

      stopBackgroundContactTask();
    },
  };
}
