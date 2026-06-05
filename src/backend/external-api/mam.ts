import { SchemaError } from "#backend/error.ts";
import { fetchExternal } from "#backend/external-api/fetch.ts";
import { parseJsonResponse } from "#backend/json.ts";
import { mamUpdateDynamicSeedboxResponseBodySchema } from "#backend/types.ts";

const endpointUrl = new URL(
  "https://t.myanonamouse.net/json/dynamicSeedbox.php",
);
const cookieKey = "mam_id";

// The result of contacting dynamicSeedbox. MAM always returns the host IP/ASN/AS
// (even on 429/403), plus whether the update was applied. `httpStatus` drives our
// logic (200 ok, 429 throttled, 403 rejected); `msg` is for display only.
export type MamUpdateResult = {
  ip: string;
  asn: number;
  as: string;
  success: boolean;
  msg: string;
  httpStatus: number;
  rotatedCookie?: string;
};

export async function updateMamIp(
  currentCookieValue: string,
): Promise<MamUpdateResult> {
  // Note: the IP address is determined by the server from the request.
  const response = await fetchExternal(endpointUrl, {
    // must supply cookie
    Cookie: `${cookieKey}=${currentCookieValue}`,
  });

  const json = await parseJsonResponse(response);
  const { data: body, error: parseError } =
    mamUpdateDynamicSeedboxResponseBodySchema.safeParse(json);

  if (parseError) {
    throw SchemaError.fromExternalSource(endpointUrl.toString(), {
      cause: parseError,
    });
  }

  return {
    ip: body.ip,
    asn: body.ASN,
    as: body.AS,
    success: body.Success,
    msg: body.msg,
    httpStatus: response.status,
    rotatedCookie: getResponseCookieValue(response),
  };
}

function getResponseCookieValue(response: Response): string | undefined {
  for (const headerValue of response.headers.getSetCookie()) {
    const cookie = new Bun.Cookie(headerValue);
    if (cookie.name === cookieKey) {
      return cookie.value;
    }
  }
  return undefined;
}
