import Negotiator from "negotiator";

import type { JSONResponseArgs } from "#backend/types.ts";

import { config } from "#backend/config.ts";
import {
  contactMutex,
  startBackgroundContactTask,
  stopBackgroundContactTask,
} from "#backend/contact.ts";
import { toJSONResponseArgs } from "#backend/error.ts";
import { handlePostCheck } from "#backend/handlers/checks.ts";
import { handlePutCookie } from "#backend/handlers/cookie.ts";
import { handleGetHealth } from "#backend/handlers/health.ts";
import { handlePostLogin } from "#backend/handlers/login.ts";
import { handleGetOk } from "#backend/handlers/ok.ts";
import { handleGetState } from "#backend/handlers/state.ts";
import {
  guardProtectedRequest,
  validateRuntimeSecurityConfig,
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
import index from "#frontend/index.html";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../package.json";

export const checksEndpointPath = "/checks";
export const stateEndpointPath = "/state";
export const cookieEndpointPath = "/cookie";
export const okEndpointPath = "/ok";

function makeJSONResponse<T>({ body, init }: JSONResponseArgs<T>): Response {
  return Response.json(body, init);
}

async function makeProtectedJSONResponse<T>(
  request: Request,
  handler: () => Promise<JSONResponseArgs<T>>,
  options: ProtectedRequestOptions = {},
): Promise<Response> {
  const boundaryResponse = guardProtectedRequest(request, options);
  if (boundaryResponse) {
    return boundaryResponse;
  }

  return makeJSONResponse(await handler());
}

const maxJsonRequestBodyBytes = 8 * 1024;

const server = Bun.serve({
  maxRequestBodySize: maxJsonRequestBodyBytes,
  port: config.port,
  routes: {
    "/login": {
      POST: async (request) => {
        const guard = guardProtectedRequest(request, {
          requireAuth: false,
          requireOrigin: true,
          requireJsonContentType: true,
        });
        if (guard) return guard;
        const result = await handlePostLogin(request);
        if (!result.ok)
          return Response.json({ ok: false }, { status: result.status });
        applySessionCookie(request, result.sessionId);
        return Response.json({ ok: true });
      },
    },
    "/logout": {
      POST: (request) => {
        const guard = guardProtectedRequest(request, { requireAuth: false });
        if (guard) return guard;
        deleteRequestSession(request);
        clearSessionCookie(request);
        return Response.json({ ok: true });
      },
    },
    "/": (request: Request) => {
      const negotiator = new Negotiator({
        headers: {
          accept: request.headers.get("accept") ?? undefined,
        },
      });
      const mediaType = negotiator.mediaType(["text/html", "application/json"]);

      if (mediaType === "text/html") {
        return Response.redirect("/web");
      }
      return Response.redirect(okEndpointPath);
    },
    [checksEndpointPath]: {
      POST: async (request) =>
        makeProtectedJSONResponse(request, () => handlePostCheck(), {
          requireOrigin: true,
        }),
    },
    [stateEndpointPath]: {
      GET: async (request) =>
        makeProtectedJSONResponse(request, () => handleGetState()),
    },
    [cookieEndpointPath]: {
      PUT: async (request) =>
        makeProtectedJSONResponse(request, () => handlePutCookie(request), {
          requireJsonContentType: true,
          requireOrigin: true,
        }),
    },
    [okEndpointPath]: {
      GET: async () => makeJSONResponse(await handleGetOk()),
    },
    "/health": {
      GET: async () => makeJSONResponse(await handleGetHealth()),
    },
    "/web": index,
    "/web/events": (request, server) => {
      const boundaryResponse = guardProtectedRequest(request, {
        requireOrigin: true,
      });
      if (boundaryResponse) {
        return boundaryResponse;
      }

      // Bun closes idle connections after 10s by default, and a quiet SSE stream
      // counts as idle — disable the timeout for this stream.
      server.timeout(request, 0);

      const sessionId = extractSessionId(request) ?? "";
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
    },
  },

  fetch() {
    return makeJSONResponse({
      body: { type: "not-found", message: "Not Found" },
      init: { status: 404 },
    });
  },

  error(error: unknown) {
    logger.error(error);
    return makeJSONResponse(toJSONResponseArgs(error));
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

logger.info(`Mousehole v${version} (${gitHash}) running at ${server.url}`);
validateRuntimeSecurityConfig();
if (config.stateDirPathDeprecationWarning) {
  logger.warn(config.stateDirPathDeprecationWarning);
}

startBackgroundContactTask();

async function shutdown() {
  logger.info("Shutting down...");
  await contactMutex.acquire();

  // despite passing true to immediately stop, bun sometimes still lags, so just don't await it
  void server.stop(true);

  stopBackgroundContactTask();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
