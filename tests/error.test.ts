import { describe, expect, test } from "bun:test";

import { TimeoutError, toErrorResponseArgs } from "../src/backend/error.ts";

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
