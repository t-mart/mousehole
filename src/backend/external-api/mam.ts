import { Cookie } from "tough-cookie";

import { config } from "#backend/config.ts";
import { SchemaError } from "#backend/error.ts";
import { parseJsonResponse } from "#backend/json.ts";
import { getNowZdt } from "#backend/time.ts";
import {
  mamUpdateDynamicSeedboxResponseBodySchema,
  type MamResponse,
} from "#backend/types.ts";

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
  };

  const performedAt = getNowZdt();

  // Note: the IP address is determined by the server from the request.
  const response = await fetch(endpointUrl, {
    headers,
  });

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
