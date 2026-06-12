import { buildConfig, type AuthConfig } from "#backend/config.ts";
import { createAppContext } from "#backend/context.ts";
import { logger, setLogLevel } from "#backend/logger.ts";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../package.json";
import { createApp, type WebMount } from "./app.ts";

/**
 * Composition root: resolve config from the environment, build the app
 * context, bind the listener, and start background work. Everything
 * Bun-server-specific lives in this one call.
 *
 * @returns the server URL and an async `stop` that unwinds it all.
 */
export function startServer(env: NodeJS.ProcessEnv = process.env) {
  const config = buildConfig(env);
  setLogLevel(config.logLevel);

  const ctx = createAppContext(config);

  // Dev serves the web UI by reverse-proxying to the Vite dev server (run both
  // with `bun dev`); prod serves the `vite build` output from dist/.
  const webMount: WebMount =
    env.NODE_ENV === "production"
      ? { mode: "serve-static", root: "./dist" }
      : { mode: "vite-dev-server-proxy", target: "http://localhost:5173" };

  const app = createApp(ctx, webMount);

  const server = Bun.serve({
    port: config.port,

    // Bun closes idle connections after 10s by default, and a quiet SSE stream
    // counts as idle — disable the timeout.
    idleTimeout: 0,

    fetch: (request) => app.fetch(request),
  });

  logger.info(`Mousehole v${version} (${gitHash}) running at ${server.url}`);
  validateRuntimeSecurityConfig(config.auth);
  if (config.stateDirPathDeprecationWarning) {
    logger.warn(config.stateDirPathDeprecationWarning);
  }

  ctx.contacts.start();

  return {
    url: server.url,
    stop: async () => {
      logger.info("Shutting down...");
      await ctx.contacts.stop();
      await server.stop(true);
    },
  };
}

// Startup-time validation of the resolved auth config: refuse to run without
// credentials unless explicitly opted out, and warn about partial setups.
// Lives here rather than in http-boundary.ts because it's a composition-root
// concern (logs and throws at boot), not a per-request check.
function validateRuntimeSecurityConfig(auth: AuthConfig): void {
  if (auth.type === "configured" && !auth.password) {
    logger.warn(
      "MOUSEHOLE_AUTH_PASSWORD is not set. Browser login will be unavailable.",
    );
  }
  if (auth.type !== "none") {
    return;
  }

  if (!auth.insecureAllowNoAuth) {
    throw new Error(
      "Mousehole authentication is not configured. Set MOUSEHOLE_AUTH_PASSWORD and/or MOUSEHOLE_AUTH_TOKEN, or set MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true to opt out.",
    );
  }

  logger.warn(
    "Running without authentication (MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true). Do not expose Mousehole to mixed-trust LAN, VPN, or public interfaces.",
  );
}
