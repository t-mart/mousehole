import { config } from "#backend/config.ts";
import { NetworkError, TimeoutError } from "#backend/error.ts";

// Fetches an external endpoint, mapping low-level failures onto our error types.
// Everything past the fetch (status checks, parsing) is left to the caller, since
// those diverge per endpoint.
export async function fetchExternal(
  url: URL,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": config.userAgent,
        ...extraHeaders,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(config.mamRequestTimeoutSeconds * 1000),
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TimeoutError(url.toString(), config.mamRequestTimeoutSeconds, {
        cause: error,
      });
    }
    throw new NetworkError(url.toString(), { cause: error });
  }
}
