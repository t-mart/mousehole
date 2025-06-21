import Negotiator from "negotiator";

import type { JSONResponseArgs } from "#backend/types.ts";

import { config } from "#backend/config.ts";
import { toJSONResponseArgs } from "#backend/error.ts";
import { handleGetOk } from "#backend/handlers/ok.ts";
import { handleGetState, handlePutState } from "#backend/handlers/state.ts";
import { handlePostUpdate } from "#backend/handlers/update.ts";
import { startBackgroundUpdateTask } from "#backend/update.ts";
import index from "#frontend/index.html";
import logoSvg from "#frontend/logo.svg?raw";

import { version } from "../package.json";

export const updateEndpointPath = "/update";
export const stateEndpointPath = "/state";
export const okEndpointPath = "/ok";

export const wsTopic = "mousehole";

function makeJSONResponse<T>({ body, init }: JSONResponseArgs<T>): Response {
  return Response.json(body, init);
}

const server = Bun.serve({
  port: config.port,
  routes: {
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
        makeJSONResponse(await handlePostUpdate(request)),
    },
    [stateEndpointPath]: {
      GET: async () => makeJSONResponse(await handleGetState()),
      PUT: async (request) => makeJSONResponse(await handlePutState(request)),
    },
    [okEndpointPath]: {
      GET: async () => makeJSONResponse(await handleGetOk()),
    },
    "/logo.svg": () =>
      new Response(logoSvg, { headers: { "Content-Type": "image/svg+xml" } }),
    "/web": index,
    "/web/ws": (request, server) => {
      const success = server.upgrade(request);
      return success
        ? undefined
        : new Response("WebSocket upgrade error", { status: 400 });
    },
  },

  fetch() {
    return makeJSONResponse({
      body: {
        type: "not-found",
        message: "Not Found",
      },
      init: { status: 404 },
    });
  },

  error(error: unknown) {
    return makeJSONResponse(toJSONResponseArgs(error));
  },

  websocket: {
    open(ws) {
      ws.subscribe(wsTopic);
    },
    message() {},
    close(ws) {
      ws.unsubscribe(wsTopic);
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`Mousehole v${version} running at ${server.url}`);
startBackgroundUpdateTask();

export function notifyWebSocketClients(): void {
  server.publish(wsTopic, "state-update");
}
