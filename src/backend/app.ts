import { Hono, type Context } from "hono";
import { accepts } from "hono/accepts";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { createMiddleware } from "hono/factory";
import { proxy } from "hono/proxy";

import type { SecurityConfig } from "#backend/http-boundary.ts";

import { config } from "#backend/config.ts";
import { toErrorResponseArgs } from "#backend/error.ts";
import { handlePostCheck } from "#backend/handlers/checks.ts";
import { handlePutCookie } from "#backend/handlers/cookie.ts";
import { handleGetHealth } from "#backend/handlers/health.ts";
import { handlePostLogin } from "#backend/handlers/login.ts";
import { handleGetOk } from "#backend/handlers/ok.ts";
import { handleGetState } from "#backend/handlers/state.ts";
import {
  checkProtectedRequest,
  type ProtectedRequestOptions,
} from "#backend/http-boundary.ts";
import { logger } from "#backend/logger.ts";
import {
  applySessionCookie,
  clearSessionCookie,
  deleteRequestSession,
  extractSessionId,
} from "#backend/session.ts";
import { registerSseClient } from "#backend/sse.ts";

export const checksEndpointPath = "/checks";
export const stateEndpointPath = "/state";
export const cookieEndpointPath = "/cookie";
export const okEndpointPath = "/ok";
export const healthEndpointPath = "/health";
export const eventsEndpointPath = "/events";

const maxJsonRequestBodyBytes = 8 * 1024;

/**
 * How the web UI is served under /web. Dev reverse-proxies to the Vite dev
 * server (single origin: no CORS, no cookie config, dev URL == prod URL);
 * prod serves the `vite build` output. Tests omit it to mount nothing.
 */
export type WebMount =
  | { mode: "vite-dev-server-proxy"; target: string }
  | { mode: "serve-static"; root: string };

/**
 * Pure assembly of the HTTP app: routes + middleware over a Hono instance.
 * Binding a listener, background tasks, and signal handling live in server.ts.
 *
 * @param securityConfig - host/origin/auth rules, injectable for tests.
 * @param webMount - how to serve the frontend under /web, if at all.
 */
export function createApp(
  securityConfig: SecurityConfig = config,
  webMount?: WebMount,
): Hono {
  // The boundary checks as route middleware. The checks are pure and return
  // log hints with each failure; emitting them through our logger happens here.
  const protect = (options: ProtectedRequestOptions = {}) =>
    createMiddleware(async (c, next) => {
      const failure = checkProtectedRequest(c.req.raw, options, securityConfig);
      if (failure) {
        logger[failure.logLevel ?? "warn"](
          `[${c.req.method} ${c.req.path}] ${failure.logDetail ?? failure.message}`,
        );
        return c.json(
          { type: failure.type, message: failure.message },
          failure.status,
          failure.headers,
        );
      }
      await next();
    });

  const app = new Hono();

  app.use(async (c, next) => {
    await next();
    logger.debug(`${c.req.method} ${c.req.path} → ${c.res.status}`);
  });

  app.use(
    bodyLimit({
      maxSize: maxJsonRequestBodyBytes,
      onError: (c) =>
        c.json(
          {
            type: "payload-too-large",
            message: `Request body must not exceed ${maxJsonRequestBodyBytes} bytes.`,
          },
          413,
        ),
    }),
  );

  app.onError((error, c) => {
    logger.error(error);
    const { body, status } = toErrorResponseArgs(error);
    return c.json(body, status);
  });

  app.notFound((c) => c.json({ type: "not-found", message: "Not Found" }, 404));

  app.get("/", (c) => {
    const mediaType = accepts(c, {
      header: "Accept",
      supports: ["text/html", "application/json"],
      default: "text/html",
    });
    return c.redirect(mediaType === "text/html" ? "/web" : okEndpointPath);
  });

  app.post(
    "/login",
    protect({
      requireAuth: false,
      requireOrigin: true,
      requireJsonContentType: true,
    }),
    async (c) => {
      const result = await handlePostLogin(c.req.raw, securityConfig.auth);
      if (!result.ok) return c.json({ ok: false }, result.status);
      applySessionCookie(c, result.sessionId);
      return c.json({ ok: true });
    },
  );

  app.post("/logout", protect({ requireAuth: false }), (c) => {
    deleteRequestSession(c.req.raw);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.post(checksEndpointPath, protect({ requireOrigin: true }), async (c) =>
    c.json(await handlePostCheck()),
  );

  app.get(stateEndpointPath, protect(), async (c) =>
    c.json(await handleGetState()),
  );

  app.put(
    cookieEndpointPath,
    protect({ requireOrigin: true, requireJsonContentType: true }),
    async (c) => c.json(await handlePutCookie(c.req.raw)),
  );

  app.get(okEndpointPath, async (c) => {
    const body = await handleGetOk();
    return c.json(body, body.ok ? 200 : 503);
  });

  app.get(healthEndpointPath, async (c) => {
    const body = await handleGetHealth();
    return c.json(body, body.ok ? 200 : 503);
  });

  app.get(eventsEndpointPath, protect({ requireOrigin: true }), (c) => {
    const sessionId = extractSessionId(c.req.raw) ?? "";
    let unregister: (() => void) | undefined;
    const stream = new ReadableStream<string>({
      start(controller) {
        unregister = registerSseClient({ sessionId, controller });
      },
      cancel() {
        unregister?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  // The web UI. Not protected: the login page itself needs these assets.
  if (webMount?.mode === "vite-dev-server-proxy") {
    const proxyToVite = async (c: Context) => {
      const { pathname, search } = new URL(c.req.url);
      // Vite serves the page at the trailing-slash base (/web/).
      const path = pathname === "/web" ? "/web/" : pathname;
      try {
        return await proxy(`${webMount.target}${path}${search}`, {
          headers: c.req.header(),
        });
      } catch {
        return c.text(
          `The Vite dev server isn't reachable at ${webMount.target}.\n` +
            "Start it with `bun dev:web`, or run both processes with `bun dev`.",
          502,
        );
      }
    };
    app.get("/web", proxyToVite);
    app.get("/web/*", proxyToVite);
  } else if (webMount?.mode === "serve-static") {
    app.use(
      "/web/*",
      serveStatic({
        root: webMount.root,
        rewriteRequestPath: (requestPath) => requestPath.replace(/^\/web/, ""),
      }),
    );
    app.get("/web", serveStatic({ path: `${webMount.root}/index.html` }));
  }

  return app;
}
