import type { ErrorResponseBody } from "#shared/error-response.ts";
import type { PublicState } from "#shared/public-state.ts";

export const stateQueryKey: readonly [string] = ["state"];

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

export async function stateQueryFunction(): Promise<PublicState> {
  const response = await fetch("/state");
  if (response.status === 401) throw new UnauthenticatedError();
  const body = (await response.json()) as PublicState | ErrorResponseBody;
  if (!response.ok) {
    throw new Error(
      `Bad response from GET /state: ${response.status} - ${JSON.stringify(body)}`,
    );
  }
  return body as PublicState;
}
