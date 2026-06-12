import { describe, expect, test } from "bun:test";
import * as z from "zod";

import {
  SchemaError,
  TimeoutError,
  toErrorResponseArgs,
} from "../src/backend/error.ts";

describe("TimeoutError", () => {
  const url = "https://t.myanonamouse.net/json/jsonIp.php";

  test("maps to a 504 Gateway Timeout response", () => {
    const { status } = toErrorResponseArgs(new TimeoutError(url, 10));
    expect(status).toBe(504);
  });

  test("exposes a timeout-error type and a human-readable message", () => {
    const { body } = toErrorResponseArgs(new TimeoutError(url, 10));
    expect(body.type).toBe("timeout-error");
    expect(body.message).toContain(url);
    expect(body.message).toContain("10s");
  });

  test("preserves the underlying cause", () => {
    const cause = new Error("boom");
    expect(new TimeoutError(url, 10, { cause }).cause).toBe(cause);
  });
});

describe("SchemaError", () => {
  const schema = z.object({ value: z.string().min(1) });

  function makeSchemaError(): SchemaError {
    const result = schema.safeParse({ value: "" });
    if (result.success) throw new Error("expected a parse failure");
    return SchemaError.fromUserSource("request body", { cause: result.error });
  }

  test("a user-source error maps to a 400 with structured issues", () => {
    const { body, status } = toErrorResponseArgs(makeSchemaError());

    expect(status).toBe(400);
    expect(body.type).toBe("schema-error");
    expect(body.issues).toEqual([expect.objectContaining({ path: "value" })]);
  });

  test("the message is a one-line summary, not the zod wall", () => {
    const { body } = toErrorResponseArgs(makeSchemaError());

    expect(body.message).toContain("request body");
    expect(body.message).toContain("value");
    expect(body.message).not.toContain("\n");
  });

  test("the ZodError cause is not re-serialized into the body", () => {
    const { body } = toErrorResponseArgs(makeSchemaError());

    expect(body.cause).toBeUndefined();
  });
});
