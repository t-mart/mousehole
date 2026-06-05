// Generic HTTP response shapes shared between the route handlers and the
// response-building code in index.tsx / error.ts.

export type JSONResponseArgs<T> = {
  body: T;
  init?: ResponseInit;
};

export type ErrorResponseBody = {
  type: string;
  message: string;
  // additional error details, e.g. zod issues or other supplemental data
  [key: string]: unknown;
};
