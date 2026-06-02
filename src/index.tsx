import Negotiator from "negotiator";

import type { JSONResponseArgs } from "#backend/types.ts";

import { config, stateDirPathDeprecationWarning } from "#backend/config.ts";
import { toJSONResponseArgs } from "#backend/error.ts";
import { handleGetHealth } from "#backend/handlers/health.ts";
import { handlePostLogin } from "#backend/handlers/login.ts";
import { handleGetOk } from "#backend/handlers/ok.ts";
import { handleGetState, handlePutState } from "#backend/handlers/state.ts";
import { handlePostUpdate } from "#backend/handlers/update.ts";
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
  registerSessionSocket,
  unregisterSessionSocket,
  type WsData,
} from "#backend/session.ts";
import { wsClientMessageSchema } from "#backend/types.ts";
import {
  startBackgroundUpdateTask,
  stopBackgroundUpdateTask,
  updateMutex,
} from "#backend/update.ts";
import { setWebSocketPublisher, wsTopic } from "#backend/websocket.ts";
import index from "#frontend/index.html";
import { gitHash } from "#shared/git-hash.ts";

import { version } from "../package.json";

export const updateEndpointPath = "/update";
export const stateEndpointPath = "/state";
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

validateRuntimeSecurityConfig();

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
    [updateEndpointPath]: {
      POST: async (request) =>
        makeProtectedJSONResponse(request, () => handlePostUpdate(request), {
          requireJsonContentType: true,
          requireOrigin: true,
        }),
    },
    [stateEndpointPath]: {
      GET: async (request) =>
        makeProtectedJSONResponse(request, () => handleGetState()),
      PUT: async (request) =>
        makeProtectedJSONResponse(request, () => handlePutState(request), {
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
    "/web/ws": (request, server) => {
      const boundaryResponse = guardProtectedRequest(request, {
        requireOrigin: true,
      });
      if (boundaryResponse) {
        return boundaryResponse;
      }

      const success = server.upgrade(request, {
        data: { sessionId: extractSessionId(request) ?? "" },
      });
      return success
        ? undefined
        : new Response("WebSocket upgrade error", { status: 400 });
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

  websocket: {
    // TypeScript: specify the type of ws.data like this
    // https://bun.com/docs/runtime/http/websockets#contextual-data
    data: {} as WsData,
    open(ws) {
      ws.subscribe(wsTopic);
      registerSessionSocket(ws.data.sessionId, ws);
    },
    message(ws, message) {
      if (typeof message !== "string") return;
      let json: unknown;
      try {
        json = JSON.parse(message);
      } catch {
        return;
      }
      const { data: parsed } = wsClientMessageSchema.safeParse(json);
      if (parsed?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    },
    close(ws) {
      ws.unsubscribe(wsTopic);
      unregisterSessionSocket(ws.data.sessionId, ws);
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

setWebSocketPublisher((topic, message) => {
  server.publish(topic, message);
});

logger.info(`Mousehole v${version} (${gitHash}) running at ${server.url}`);
if (stateDirPathDeprecationWarning) {
  logger.warn(stateDirPathDeprecationWarning);
}

startBackgroundUpdateTask();

async function shutdown() {
  logger.info("Shutting down...");
  await updateMutex.acquire();

  // despite passing true to immediately stop, bun sometimes still lags, so just don't await it
  void server.stop(true);
  
  stopBackgroundUpdateTask();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
