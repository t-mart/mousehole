import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ErrorResponseBody } from "#shared/error-response.ts";
import type { PublicState } from "#shared/public-state.ts";

const queryKey: readonly [string] = ["state"];

class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

/** A non-401 failure of GET /state, carrying the server's message and status. */
class StateRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StateRequestError";
    this.status = status;
  }
}

/**
 * The request never reached a server. `fetch` rejects with a TypeError when the
 * backend is down, unreachable, or the connection is dropped (the browser's own
 * message is unhelpful: "NetworkError when attempting to fetch resource" /
 * "Failed to fetch"). Replace it with something a user can act on.
 */
class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      "Can't reach the server. It may be down or restarting. Check that the backend is running, then retry.",
      options,
    );
    this.name = "NetworkError";
  }
}

/** True when `fetch` rejected before getting a response (no server reached). */
function isFetchNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * The retry policy for the state query. Never retry auth failures (the login
 * screen handles them) or deterministic 4xx rejections (e.g.
 * host-not-allowed — the answer can't change, and endless retries used to
 * trap the UI on the loading spinner forever, hiding the error screen).
 * Retry anything else (transient network/5xx) briefly.
 */
function retry(failureCount: number, error: Error): boolean {
  if (error instanceof UnauthenticatedError) return false;
  if (error instanceof StateRequestError && error.status < 500) return false;
  return failureCount < 2;
}

async function queryFunction(): Promise<PublicState> {
  let response: Response;
  try {
    response = await fetch("/state");
  } catch (error) {
    if (isFetchNetworkError(error)) throw new NetworkError({ cause: error });
    throw error;
  }
  if (response.status === 401) throw new UnauthenticatedError();
  const body = (await response.json().catch(() => undefined)) as
    | ErrorResponseBody
    | PublicState
    | undefined;
  if (!response.ok) {
    // Surface the server's message (it's written to be actionable); fall
    // back to the status for non-JSON failures (e.g. a proxy's 502 page).
    const message =
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : `GET /state failed with status ${response.status}`;
    throw new StateRequestError(message, response.status);
  }
  if (!body) {
    throw new StateRequestError(
      "GET /state returned an unreadable body",
      response.status,
    );
  }
  return body as PublicState;
}

/**
 * The single observer of GET /state. Mount this once, high in the tree (App).
 * Every extra observer would refetch /state on mount (staleTime is 0), so
 * callers that only need to refresh or overwrite the cache use
 * {@link useStateActions} instead — it opens no observer.
 */
export function useStateQuery() {
  const stateQuery = useQuery({
    queryKey,
    queryFn: queryFunction,
    retry,
  });

  return {
    ...stateQuery,
    isAuthError: stateQuery.error instanceof UnauthenticatedError,
  };
}

/**
 * Cache actions for the state query — for mutations and the SSE subscription
 * that need to refresh or overwrite state without reading it. Deliberately uses
 * the query client directly and opens no observer: calling useStateQuery here
 * would mount a second observer that refetches /state on every mount, which
 * under mount churn becomes a request storm.
 */
export function useStateActions() {
  const queryClient = useQueryClient();
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient],
  );
  const setData = useCallback(
    (data: PublicState) => queryClient.setQueryData(queryKey, data),
    [queryClient],
  );
  return { invalidate, setData };
}
