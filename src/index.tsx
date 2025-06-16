import Negotiator from "negotiator";

import type {
  MouseholeResponse,
  PutCookieResponse,
  GetStatusResponse,
  PostIpResponse,
} from "./lib/response.js";

import index from "./index.html";
import { config } from "./lib/config.js";
import { readCookieValue, writeCookieValue } from "./lib/cookie.js";
import { makeDatetime } from "./lib/datetime.js";
import {
  updateMamIp,
  setNowAndScheduleNext,
  globalData,
  readLatestUpdateIpResponse,
} from "./lib/mam.js";

async function handleGetStatus(): Promise<Response> {
  const latestResponse = await readLatestUpdateIpResponse();

  const response: GetStatusResponse = {
    success: latestResponse.response.Success,
    message: `Latest update request was ${
      latestResponse.response.Success ? "successful" : "unsuccessful"
    }`,
    responseWithMetadata: latestResponse,
    nextAutoUpdate: globalData.nextAutoUpdateZdt
      ? makeDatetime(globalData.nextAutoUpdateZdt)
      : undefined,
  };

  return Response.json(response, {
    status: latestResponse.metadata.response.httpStatus,
  });
}

async function handlePostIp(): Promise<Response> {
  const updateResponse: PostIpResponse = await updateMamIp();
  return Response.json(updateResponse, {
    status: updateResponse.responseWithMetadata.metadata.response.httpStatus,
  });
}

async function handlePutCookie(request: Request): Promise<Response> {
  const cookieValue = await request.text();
  if (!cookieValue) {
    const response: PutCookieResponse = {
      success: false,
      message: "Cookie value is required",
    };
    return Response.json(response, { status: 400 });
  }
  await writeCookieValue(cookieValue);

  const response: PutCookieResponse = {
    success: true,
    message: "Cookie value updated",
  };

  return Response.json(response);
}

async function handleGetCookie(): Promise<Response> {
  const cookieValue = await readCookieValue();
  return Response.json(
    {
      success: true,
      message: "Cookie value retrieved",
      cookieValue,
    },
    { status: 200 }
  );
}

export const statusEndpointPath = "/status";
export const ipEndpointPath = "/ip";
export const cookieEndpointPath = "/cookie";

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
      return Response.redirect(statusEndpointPath);
    },
    [statusEndpointPath]: handleGetStatus,
    [ipEndpointPath]: {
      POST: handlePostIp,
    },
    [cookieEndpointPath]: {
      PUT: handlePutCookie,
      GET: handleGetCookie,
    },
    "/web": index,
  },

  fetch() {
    const response: MouseholeResponse = {
      success: false,
      message: `Not found. Use the GET ${statusEndpointPath}, POST ${ipEndpointPath}, or PUT ${cookieEndpointPath} endpoints.`,
    };
    return Response.json(response, { status: 404 });
  },

  error(error) {
    const response: MouseholeResponse = {
      success: false,
      message: `An error occurred: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    return Response.json(response, { status: 500 });
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});
console.log(`Server running at ${server.url}`);

console.log("Starting background task to update IP on a schedule...");
setNowAndScheduleNext();
