import path from "node:path";
import { Temporal } from "temporal-polyfill";
import { Cookie } from "tough-cookie";

import type { UpdateIpResponse } from "./response.js";

import { config } from "./config.js";
import { readCookieValue, writeCookieValue } from "./cookie-file.js";
import { makeDatetime } from "./datetime.js";
import { updateIpPath } from "./index.js";

const endpointUrl = new URL(
  "https://t.myanonamouse.net/json/dynamicSeedbox.php"
);
const cookieKey = "mam_id";
const latestUpdateIpResponsePath = path.join(
  config.stateDirPath,
  "latest-update-ip-response.json"
);

type GlobalData = {
  nextAutoUpdateZdt: Temporal.ZonedDateTime | undefined;
};

export const globalData: GlobalData = {
  nextAutoUpdateZdt: undefined,
};

export type MamApiResponse = {
  Success: boolean;
  msg: string;
  ip: string;
  ASN: number;
  AS: string;
};

export type MamApiResponseWithMetadata = {
  response: MamApiResponse;
  metadata: {
    request: {
      datetime: string;
      timestampMilliseconds: number;
      cookieValue: string;
    };
    response: {
      httpStatus: number;
      cookieValue: string | undefined;
    };
  };
};

export async function updateMamIp(): Promise<UpdateIpResponse> {
  const currentCookiedValue = await readCookieValue();

  const cookie = new Cookie({
    key: cookieKey,
    value: currentCookiedValue,
  });

  const headers = {
    // Identify us to the MaM API if they care
    "User-Agent": config.userAgent,
    Cookie: cookie.cookieString(),
  };

  const requestZdt = Temporal.Now.zonedDateTimeISO(config.localTimezone);
  const datetime = makeDatetime(requestZdt);

  // interesting that this is a GET request. Also note: the IP address is
  // determined by the server from the request.
  const response = await fetch(endpointUrl, {
    headers,
  });

  const responseJson = (await response.json()) as MamApiResponse;
  const nextCookieValue = getNextCookieValue(response);

  if (nextCookieValue) {
    await writeCookieValue(nextCookieValue);
  } else if (response.ok) {
    console.warn("No new cookie value provided in response headers");
  }

  const responseWithMetadata: MamApiResponseWithMetadata = {
    response: responseJson,
    metadata: {
      request: {
        ...datetime,
        cookieValue: currentCookiedValue,
      },
      response: {
        httpStatus: response.status,
        cookieValue: nextCookieValue,
      },
    },
  };
  await writeLatestUpdateIpResponse(responseWithMetadata);

  const message = response.ok
    ? "IP updated successfully"
    : "Failed to update IP";
  console.log(message);

  return {
    success: response.ok,
    message,
    responseWithMetadata,
  } as UpdateIpResponse;
}

export function setNowAndScheduleNext() {
  updateMamIp()
    .catch((error) => {
      console.error("Error:", error);
    })
    .finally(() => {
      // Schedule the next update
      setTimeout(setNowAndScheduleNext, config.updateIntervalMilliseconds);

      // this calculation will be slightly off because of the of the time it
      // takes to execute these statements, but it's close enough
      globalData.nextAutoUpdateZdt = Temporal.Now.zonedDateTimeISO(
        config.localTimezone
      ).add({ milliseconds: config.updateIntervalMilliseconds });

      console.log(
        `Next update scheduled for ${globalData.nextAutoUpdateZdt.toString()}`
      );
    });
}

function getNextCookieValue(response: Response): string | undefined {
  for (const [headerName, headerValue] of response.headers.entries()) {
    if (headerName.toLowerCase() === "set-cookie") {
      const cookie = Cookie.parse(headerValue);
      if (cookie && cookie.key === cookieKey) {
        return cookie.value;
      }
    }
  }
  return undefined;
}

async function writeLatestUpdateIpResponse(
  response: MamApiResponseWithMetadata
) {
  const lastResponseFile = Bun.file(latestUpdateIpResponsePath);
  await lastResponseFile.write(JSON.stringify(response, undefined, 2));
}

export async function readLatestUpdateIpResponse(): Promise<MamApiResponseWithMetadata> {
  const lastResponseFile = Bun.file(latestUpdateIpResponsePath);
  let contents;
  try {
    contents = await lastResponseFile.text();
  } catch (error) {
    throw new Error(
      `Error reading latest update IP response file at ${latestUpdateIpResponsePath}: ${String(
        error
      )}. Have you made a request to update the IP with the ${updateIpPath} endpoint yet?`,
      { cause: error }
    );
  }
  return JSON.parse(contents) as MamApiResponseWithMetadata;
}
