import { NetworkError, TimeoutError } from "#backend/error.ts";

/** Request behavior threaded from config (see context.ts / contact.ts). */
export type ExternalFetchOptions = {
  userAgent: string;
  timeoutSeconds: number;
};

// Fetches an external endpoint, mapping low-level failures onto our error types.
// Everything past the fetch (status checks, parsing) is left to the caller, since
// those diverge per endpoint.
export async function fetchExternal(
  url: URL,
  options: ExternalFetchOptions,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": options.userAgent,
        ...extraHeaders,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TimeoutError(url.toString(), options.timeoutSeconds, {
        cause: error,
      });
    }
    throw new NetworkError(url.toString(), { cause: error });
  }
}
