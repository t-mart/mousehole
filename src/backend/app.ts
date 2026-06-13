import { Hono, type Context } from "hono";
import { accepts } from "hono/accepts";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { proxy } from "hono/proxy";

import type { AppContext } from "#backend/context.ts";

import { toErrorResponseArgs } from "#backend/error.ts";
import { handlePutCookie } from "#backend/handlers/cookie.ts";
import { handleGetHealth } from "#backend/handlers/health.ts";
import { handlePostLogin } from "#backend/handlers/login.ts";
import { handleGetState } from "#backend/handlers/state.ts";
import { handlePostUpdate } from "#backend/handlers/updates.ts";
import {
  hostAllowed,
  originAllowed,
  requireAuth,
  requireJsonBody,
} from "#backend/http-boundary.ts";
import { logger } from "#backend/logger.ts";
import { extractSessionId } from "#backend/session.ts";

const healthEndpointPath = "/health";

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
 * @param ctx - the app's config and stateful services (see context.ts).
 * @param webMount - how to serve the frontend under /web, if at all.
 */
export function createApp(ctx: AppContext, webMount?: WebMount): Hono {
  // The boundary middlewares, bound once to this context's config. Each route
  // below lists its requirements varargs-style in host → auth → origin → json
  // order; the first failing check logs and responds (see http-boundary.ts).
  const host = hostAllowed(ctx.config.allowedHosts);
  const auth = requireAuth(ctx.config.auth, ctx.sessions.isSessionValid);
  const origin = originAllowed(ctx.config.allowedOrigins);

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
    return c.redirect(mediaType === "text/html" ? "/web" : healthEndpointPath);
  });

  app.post("/login", host, origin, requireJsonBody, async (c) => {
    const result = await handlePostLogin(
      c.req.raw,
      ctx.config.auth,
      ctx.sessions,
    );
    if (!result.ok) {
      return c.json({ ok: false, message: result.message }, result.status);
    }
    ctx.sessions.applyCookie(c, result.sessionId);
    return c.json({ ok: true });
  });

  app.post("/logout", host, origin, (c) => {
    ctx.sessions.deleteRequestSession(c.req.raw);
    ctx.sessions.clearCookie(c);
    return c.json({ ok: true });
  });

  app.post("/updates", host, auth, origin, async (c) =>
    c.json(await handlePostUpdate(ctx)),
  );

  app.get("/state", host, auth, async (c) => c.json(await handleGetState(ctx)));

  app.put("/cookie", host, auth, origin, requireJsonBody, async (c) =>
    c.json(await handlePutCookie(ctx, c.req.raw)),
  );

  app.get(healthEndpointPath, async (c) => c.json(await handleGetHealth(ctx)));

  app.get("/events", host, auth, origin, (c) => {
    const sessionId = extractSessionId(c.req.raw) ?? "";
    let unregister: (() => void) | undefined;
    const stream = new ReadableStream<string>({
      start(controller) {
        unregister = ctx.sse.register({ sessionId, controller });
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
