import type { ZodError } from "zod/v4";

import type { ErrorResponseBody, JSONResponseArgs } from "./types";

export class MouseholeError extends Error {
  public httpStatus: number;
  public errorType: string;

  constructor(
    message: string,
    { cause, httpStatus }: { cause?: Error; httpStatus: number }
  ) {
    super(message, { cause });
    this.name = "MouseholeError";
    this.httpStatus = httpStatus;
    this.errorType = "mousehole-error";
  }
}

export class FileReadError extends MouseholeError {
  constructor(path: string, { cause }: { cause: Error }) {
    super(
      `Error reading file: ${path}. Check that it exists, is readable, and is not a directory.`,
      { cause, httpStatus: 500 }
    );
    this.name = "FileReadError";
    this.errorType = "file-read-error";
  }
}

export class FileWriteError extends MouseholeError {
  constructor(path: string, { cause }: { cause: Error }) {
    super(
      `Error writing file: ${path}. Check that the parent directory exists and is writable.`,
      { cause, httpStatus: 500 }
    );
    this.name = "FileWriteError";
    this.errorType = "file-write-error";
  }
}

export class JSONParseError extends MouseholeError {
  private constructor(
    message: string,
    { cause, httpStatus }: { cause: Error; httpStatus: number }
  ) {
    super(message, { cause, httpStatus });
    this.name = "JSONParseError";
    this.errorType = "json-parse-error";
  }

  static fromFile(path: string, { cause }: { cause: Error }) {
    return new JSONParseError(`Error parsing JSON from file at ${path}`, {
      cause,
      httpStatus: 500,
    });
  }

  static fromRequest(request: Request, { cause }: { cause: Error }) {
    return new JSONParseError(
      `Error parsing JSON from request with method ${request.method} and URL ${request.url}`,
      { cause, httpStatus: 400 }
    );
  }

  static fromResponse(response: Response, { cause }: { cause: Error }) {
    return new JSONParseError(
      `Error parsing JSON from response with status ${response.status} and URL ${response.url}`,
      { cause, httpStatus: 500 }
    );
  }
}

export class SchemaError extends MouseholeError {
  private constructor(
    sourceName: string,
    { cause, httpStatus }: { cause: ZodError; httpStatus: number }
  ) {
    super(
      `Schema validation failed for data from ${sourceName}: ${cause.message}`,
      {
        cause,
        httpStatus,
      }
    );
    this.name = "SchemaError";
    this.errorType = "schema-error";
  }

  static fromUserSource(sourceName: string, { cause }: { cause: ZodError }) {
    return new SchemaError(sourceName, { cause, httpStatus: 400 });
  }

  static fromExternalSource(
    sourceName: string,
    { cause }: { cause: ZodError }
  ) {
    return new SchemaError(sourceName, { cause, httpStatus: 500 });
  }
}

export class NoCookieError extends MouseholeError {
  constructor() {
    super(`No cookie has been set yet`, { httpStatus: 500 });
    this.name = "NoCookieError";
    this.errorType = "no-cookie-error";
  }
}

export function toJSONResponseArgs(
  error: unknown
): JSONResponseArgs<ErrorResponseBody> {
  const message =
    error instanceof Error ? error.message : `Unhandled error: ${error}`;
  const errorType =
    error instanceof MouseholeError ? error.errorType : "unhandled-error";
  const cause =
    error instanceof Error && error.cause
      ? toJSONResponseArgs(error.cause).body
      : undefined;
  const status = error instanceof MouseholeError ? error.httpStatus : 500;

  return {
    body: {
      type: errorType,
      message,
      ...(cause ? { cause } : {}),
    },
    init: { status },
  };
}
