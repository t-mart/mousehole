import { config } from "#backend/config.ts";
import { SchemaError } from "#backend/error.ts";
import { parseJsonResponse } from "#backend/json.ts";
import { ipResponseBodySchema } from "#backend/types.ts";

export async function getHostIp() {
  const response = await fetch(config.getHostIpUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch host IP from ${config.getHostIpUrl}: ${response.status}`
    );
  }

  const body = await parseJsonResponse(response);

  const { data: ip, error } = ipResponseBodySchema.safeParse(body);

  if (error) {
    throw SchemaError.fromExternalSource(config.getHostIpUrl, { cause: error });
  }

  return ip;
}
