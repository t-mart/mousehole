import type {
  MouseholeResponse,
  SetCookieResponse,
  StatusResponse,
  UpdateIpResponse,
} from "./response.js";

import { config } from "./config.js";
import { writeCookieValue } from "./cookie-file.js";
import { makeDatetime } from "./datetime.js";
import {
  updateMamIp,
  setNowAndScheduleNext,
  globalData,
  readLatestUpdateIpResponse,
} from "./mam.js";

async function handleStatus(): Promise<Response> {
  const latestResponse = await readLatestUpdateIpResponse();

  const response: StatusResponse = {
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

async function handleUpdateIp(): Promise<Response> {
  const updateResponse: UpdateIpResponse = await updateMamIp();
  return Response.json(updateResponse, {
    status: updateResponse.responseWithMetadata.metadata.response.httpStatus,
  });
}

async function handleSetCookie(request: Request): Promise<Response> {
  const cookieValue = await request.text();
  if (!cookieValue) {
    const response: SetCookieResponse = {
      success: false,
      message: "Cookie value is required",
    };
    return Response.json(response, { status: 400 });
  }
  await writeCookieValue(cookieValue);

  const response: SetCookieResponse = {
    success: true,
    message: "Cookie value updated successfully",
  };

  return Response.json(response);
}

export const statusPath = "/status";
export const updateIpPath = "/updateIp";
export const setCookiePath = "/setCookie";

Bun.serve({
  port: config.port,
  routes: {
    [statusPath]: handleStatus,
    [updateIpPath]: {
      POST: handleUpdateIp,
    },
    [setCookiePath]: {
      PUT: handleSetCookie,
    },
  },

  fetch() {
    const response: MouseholeResponse = {
      success: false,
      message: `Not found. Use the GET ${statusPath}, POST ${updateIpPath}, or PUT ${setCookiePath} endpoints.`,
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
});
console.log(`Server running on http://localhost:${config.port}`);

console.log("Starting background task to update IP on a schedule...");
setNowAndScheduleNext();
