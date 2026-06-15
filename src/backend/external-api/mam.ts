import { parseSetCookie } from "set-cookie-parser";
import * as z from "zod";

import { SchemaError } from "#backend/error.ts";
import {
  fetchExternal,
  parseJsonResponse,
  type ExternalFetchOptions,
} from "#backend/external-api/fetch.ts";

const endpointUrl = new URL(
  "https://t.myanonamouse.net/json/dynamicSeedbox.php",
);
const cookieKey = "mam_id";

// MAM returns the host IP/ASN/AS on every response (even 429/403), plus the update
// outcome. Uppercase keys are MAM's; we map them to our lowercase domain shape.
const responseBodySchema = z.object({
  Success: z.boolean(),
  msg: z.string(),
  ip: z.ipv4(),
  ASN: z.number(),
  AS: z.string(),
});

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
  fetchOptions: ExternalFetchOptions,
): Promise<MamUpdateResult> {
  // Note: the IP address is determined by the server from the request.
  const response = await fetchExternal(endpointUrl, fetchOptions, {
    // must supply cookie
    Cookie: `${cookieKey}=${currentCookieValue}`,
  });

  const json = await parseJsonResponse(response);
  const { data: body, error: parseError } = responseBodySchema.safeParse(json);

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
  return parseSetCookie(response.headers.getSetCookie()).find(
    (cookie) => cookie.name === cookieKey,
  )?.value;
}
