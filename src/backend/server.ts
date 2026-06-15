import { serve } from "@hono/node-server";

import {
  buildConfig,
  type AllowedHostsConfig,
  type AllowedOriginsConfig,
  type AuthConfig,
} from "#backend/config.ts";
import { createAppContext } from "#backend/context.ts";
import { logger, setLogLevel } from "#backend/logger.ts";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../../package.json";
import { createApp, type WebMount } from "./app.ts";

/**
 * Composition root: resolve config from the environment, build the app
 * context, bind the listener, and start background work. Everything
 * HTTP-server-specific lives in this one call.
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

  const server = serve({
    fetch: app.fetch,
    port: config.port,
  });

  const url = `http://localhost:${config.port}`;
  logger.info(`Mousehole v${version} (${gitHash}) running at ${url}`);
  validateRuntimeSecurityConfig(
    config.auth,
    config.allowedHosts,
    config.allowedOrigins,
  );

  ctx.contacts.start();

  return {
    url,
    stop: async () => {
      logger.info("Shutting down...");
      await ctx.contacts.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if ("closeAllConnections" in server) server.closeAllConnections();
      });
    },
  };
}

// Startup-time validation of the resolved security config: warn about overly
// permissive host/origin allowlists, refuse to run without credentials unless
// explicitly opted out, and warn about partial setups.
function validateRuntimeSecurityConfig(
  auth: AuthConfig,
  allowedHosts: AllowedHostsConfig,
  allowedOrigins: AllowedOriginsConfig,
): void {
  if (allowedHosts.type === "all") {
    logger.warn(
      "MOUSEHOLE_ALLOWED_HOSTS allows any Host header. This is less secure and almost always avoidable. Set it to your specific host(s) or IP(s).",
    );
  }
  if (allowedOrigins.type === "all") {
    logger.warn(
      "MOUSEHOLE_ALLOWED_ORIGINS allows any Origin Header for cross-origin requests. This is less secure and almost always avoidable. Set it to your specific allowed origins.",
    );
  }

  if (auth.type === "configured" && !auth.password) {
    logger.warn(
      "Browser login will be unavailable. Set MOUSEHOLE_AUTH_PASSWORD to enable it.",
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
