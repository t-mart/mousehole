// The error body shape every non-2xx JSON response uses, shared between the
// backend (error.ts, the HTTP boundary) and the frontend.
export type ErrorResponseBody = {
  type: string;
  message: string;
  // additional error details, e.g. zod issues or other supplemental data
  [key: string]: unknown;
};
