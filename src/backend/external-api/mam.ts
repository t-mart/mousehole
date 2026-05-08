import { Cookie } from "tough-cookie";

import { config } from "#backend/config.ts";
import { SchemaError } from "#backend/error.ts";
import { parseJsonResponse } from "#backend/json.ts";
import {
  mamUpdateDynamicSeedboxResponseBodySchema,
  type MamResponse,
} from "#backend/types.ts";
import { getNowZdt } from "#shared/time.ts";

const endpointUrl = new URL(
  "https://t.myanonamouse.net/json/dynamicSeedbox.php"
);
const cookieKey = "mam_id";

export async function updateMamIp(
  currentCookieValue: string
): Promise<MamResponse> {
  const cookie = new Cookie({
    key: cookieKey,
    value: currentCookieValue,
  });

  const headers = {
    // Identify us to MAM if they even care
    "User-Agent": config.userAgent,

    // must supply cookie
    Cookie: cookie.cookieString(),

    // Avoid Bun reusing a stale keep-alive connection through the proxy,
    // which surfaces as InvalidHTTPResponse.
    Connection: "close",
  };

  const performedAt = getNowZdt();

  // Note: the IP address is determined by the server from the request.
  const fetchInit: RequestInit & { proxy?: string } = {
    headers,
    proxy: config.proxy,
  };
  const response = await fetch(endpointUrl, fetchInit);

  const json = await parseJsonResponse(response);
  const { data: body, error: parseError } =
    mamUpdateDynamicSeedboxResponseBodySchema.safeParse(json);

  if (parseError) {
    throw SchemaError.fromExternalSource(endpointUrl.toString(), {
      cause: parseError,
    });
  }

  const nextCookieValue = getResponseCookieValue(response);

  const mamResponse: MamResponse = {
    request: {
      cookie: currentCookieValue,
      at: performedAt,
    },
    response: {
      cookie: nextCookieValue,
      httpStatus: response.status,
      body,
    },
  };

  return mamResponse;
}

function getResponseCookieValue(response: Response): string | undefined {
  const setCookieHeaders = response.headers.getSetCookie();

  for (const headerValue of setCookieHeaders) {
    const cookie = Cookie.parse(headerValue);
    if (cookie && cookie.key === cookieKey) {
      return cookie.value;
    }
  }
  return undefined;
}
