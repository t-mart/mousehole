// Shared helpers for the test suite.

import type { FetchLike } from "../../src/backend/external-api/fetch.ts";
import type { State } from "../../src/backend/state/serde.ts";
import type { StateStore } from "../../src/backend/state/store.ts";

// Read a response body as JSON, typed by the caller. Pass the real exported
// contract (PublicState, ErrorResponseBody, ...) as T so the tests stay honest
// if that contract changes.
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// Tests must never touch the real network; contexts built without an explicit
// fetchImpl fail loudly if anything tries.
export const rejectExternalFetch: FetchLike = () =>
  Promise.reject(new Error("unexpected external fetch in test"));

// An in-memory StateStore for tests: no disk, so contexts stay hermetic and
// isolated. The real on-disk StateFileStore is exercised in store.test.ts.
export function createInMemoryStateStore(initial?: State): StateStore {
  let state = initial;
  return {
    readIfExists: () => Promise.resolve(state),
    write: (next) => {
      state = next;
      return Promise.resolve();
    },
  };
}
