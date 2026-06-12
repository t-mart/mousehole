import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod/v4";

import type { ErrorResponseBody } from "#shared/error-response.ts";

class MouseholeError extends Error {
  public httpStatus: ContentfulStatusCode;
  public errorType: string;

  constructor(
    message: string,
    { cause, httpStatus }: { cause?: Error; httpStatus: ContentfulStatusCode }
  ) {
    super(message, { cause });
    this.name = "MouseholeError";
    this.httpStatus = httpStatus;
    this.errorType = "mousehole-error";
    // prevent these from appearing in util.inspect / JSON.stringify / log output
    Object.defineProperty(this, "httpStatus", { enumerable: false });
    Object.defineProperty(this, "errorType", { enumerable: false });
  }
}

/** Coerce a caught unknown into an Error for use as a `cause`. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
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

export class DirectoryCreateError extends MouseholeError {
  constructor(path: string, { cause }: { cause: Error }) {
    super(
      `Error creating directory: ${path}. Check that the parent directory exists and you have write permissions.`,
      { cause, httpStatus: 500 }
    );
    this.name = "DirectoryCreateError";
    this.errorType = "directory-create-error";
  }
}

export class JSONParseError extends MouseholeError {
  private constructor(
    message: string,
    { cause, httpStatus }: { cause: Error; httpStatus: ContentfulStatusCode }
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
    { cause, httpStatus }: { cause: ZodError; httpStatus: ContentfulStatusCode }
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

export class NetworkError extends MouseholeError {
  constructor(url: string, { cause }: { cause: unknown }) {
    super(`Network request to ${url} failed`, {
      cause: cause instanceof Error ? cause : undefined,
      httpStatus: 500,
    });
    this.name = "NetworkError";
    this.errorType = "network-error";
  }
}

export class TimeoutError extends MouseholeError {
  constructor(
    url: string,
    timeoutSeconds: number,
    { cause }: { cause?: unknown } = {}
  ) {
    super(
      `Request to ${url} timed out after ${timeoutSeconds}s. Is the network up?`,
      {
        cause: cause instanceof Error ? cause : undefined,
        httpStatus: 504,
      }
    );
    this.name = "TimeoutError";
    this.errorType = "timeout-error";
  }
}

/** The pieces of an HTTP error response: a JSON body and the status to send it with. */
export type ErrorResponseArgs = {
  body: ErrorResponseBody;
  status: ContentfulStatusCode;
};

export function toErrorResponseArgs(error: unknown): ErrorResponseArgs {
  const message =
    error instanceof Error ? error.message : `Unhandled error: ${String(error)}`;
  const errorType =
    error instanceof MouseholeError ? error.errorType : "unhandled-error";
  const cause =
    error instanceof Error && error.cause
      ? toErrorResponseArgs(error.cause).body
      : undefined;
  const status = error instanceof MouseholeError ? error.httpStatus : 500;

  return {
    body: {
      type: errorType,
      message,
      ...(cause ? { cause } : {}),
    },
    status,
  };
}
