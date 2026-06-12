import { describe, expect, test } from "bun:test";

import { classify, type SerializedMamContact } from "#shared/public-state.ts";

const at = "2025-06-21T13:26:50.536+00:00[UTC]";

function update(httpStatus: number, success: boolean): SerializedMamContact {
  return {
    at,
    reached: true,
    ip: "1.2.3.4",
    asn: 12_345,
    as: "TestAS",
    ipUpdate: { success, msg: "some message", httpStatus },
  };
}

const lookup: SerializedMamContact = {
  at,
  reached: true,
  ip: "1.2.3.4",
  asn: 1,
  as: "AS",
};
const unreachable: SerializedMamContact = {
  at,
  reached: false,
  error: { type: "timeout-error", message: "timed out" },
};

describe("classify", () => {
  test("pending when there is no contact", () => {
    expect(classify()).toBe("pending");
  });
  test("unreachable on a transport failure", () => {
    expect(classify(unreachable)).toBe("unreachable");
  });
  test("no-cookie on a lookup (reached, no ipUpdate)", () => {
    expect(classify(lookup)).toBe("no-cookie");
  });
  test("ok on a 200 update", () => {
    expect(classify(update(200, true))).toBe("ok");
  });
  test("throttled on a 429 update", () => {
    expect(classify(update(429, false))).toBe("throttled");
  });
  test("rejected on a 403 update", () => {
    expect(classify(update(403, false))).toBe("rejected");
  });
});
