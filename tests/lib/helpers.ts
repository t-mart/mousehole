// Shared helpers for the test suite.

// Read a response body as JSON, typed by the caller. Pass the real exported
// contract (PublicState, ErrorResponseBody, ...) as T so the tests stay honest
// if that contract changes.
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
