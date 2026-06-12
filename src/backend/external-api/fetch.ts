import {
  JSONParseError,
  NetworkError,
  TimeoutError,
  toError,
} from "#backend/error.ts";

/**
 * The shape of fetch we rely on. Tests inject a fake (the fake MAM app's
 * fetch); production uses the global.
 */
export type FetchLike = (
  input: URL | Request | string,
  init?: RequestInit,
) => Promise<Response>;

/** Request behavior threaded from config (see context.ts / contact.ts). */
export type ExternalFetchOptions = {
  userAgent: string;
  timeoutSeconds: number;
  /** Defaults to the global fetch. */
  fetchImpl?: FetchLike;
};

// Fetches an external endpoint, mapping low-level failures onto our error types.
// Everything past the fetch (status checks, parsing) is left to the caller, since
// those diverge per endpoint.
export async function fetchExternal(
  url: URL,
  options: ExternalFetchOptions,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
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

/** Parse an external response's body as JSON, mapping failure onto our error type. */
export async function parseJsonResponse(response: Response): Promise<unknown> {
  const content = await response.text();
  try {
    return JSON.parse(content);
  } catch (error) {
    throw JSONParseError.fromResponse(response, { cause: toError(error) });
  }
}
