import { config } from "#backend/config.ts";
import { setIsOnline } from "#backend/connectivity.ts";
import { NetworkError, SchemaError } from "#backend/error.ts";
import { parseJsonResponse } from "#backend/json.ts";
import { ipResponseBodySchema } from "#backend/types.ts";

const endpointUrl = new URL("https://t.myanonamouse.net/json/jsonIp.php");

export async function getHostInfo() {
  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      headers: { "User-Agent": config.userAgent },
    });
    setIsOnline(true);
  } catch (error) {
    setIsOnline(false);
    throw new NetworkError(endpointUrl.toString(), { cause: error });
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch host IP from ${endpointUrl}: ${response.status}`
    );
  }

  const body = await parseJsonResponse(response);

  const { data, error } = ipResponseBodySchema.safeParse(body);

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
