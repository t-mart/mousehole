import * as z from "zod";

import { SchemaError } from "#backend/error.ts";
import { fetchExternal } from "#backend/external-api/fetch.ts";
import { parseJsonResponse } from "#backend/json.ts";

const endpointUrl = new URL("https://t.myanonamouse.net/json/jsonIp.php");

// MAM's jsonIp.php returns just the host IP/ASN/AS (uppercase keys are MAM's).
const responseBodySchema = z.object({
  ip: z.ipv4(),
  ASN: z.number(),
  AS: z.string(),
});

export type HostInfo = { ip: string; asn: number; as: string };

export async function getHostInfo(): Promise<HostInfo> {
  const response = await fetchExternal(endpointUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch host IP from ${endpointUrl}: ${response.status}`,
    );
  }

  const body = await parseJsonResponse(response);

  const { data, error } = responseBodySchema.safeParse(body);

  if (error) {
    throw SchemaError.fromExternalSource(endpointUrl.toString(), {
      cause: error,
    });
  }

  return {
    ip: data.ip,
    asn: data.ASN,
    as: data.AS,
  };
}
