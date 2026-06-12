import type { ErrorResponseBody } from "#shared/error-response.ts";
import type { PublicState } from "#shared/public-state.ts";

export const stateQueryKey: readonly [string] = ["state"];

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

/** A non-401 failure of GET /state, carrying the server's message and status. */
export class StateRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StateRequestError";
    this.status = status;
  }
}

/**
 * The retry policy for the state query. Never retry auth failures (the login
 * screen handles them) or deterministic 4xx rejections (e.g.
 * host-not-allowed — the answer can't change, and endless retries used to
 * trap the UI on the loading spinner forever, hiding the error screen).
 * Retry anything else (transient network/5xx) briefly.
 */
export function stateQueryRetry(failureCount: number, error: Error): boolean {
  if (error instanceof UnauthenticatedError) return false;
  if (error instanceof StateRequestError && error.status < 500) return false;
  return failureCount < 2;
}

export async function stateQueryFunction(): Promise<PublicState> {
  const response = await fetch("/state");
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
