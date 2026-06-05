import { describe, expect, test } from "bun:test";
import { Temporal } from "temporal-polyfill";

import {
  classify,
  deserializeState,
  serializeState,
  toPublicState,
  type MamContact,
  type State,
} from "../src/backend/serde.ts";

const at = Temporal.ZonedDateTime.from("2025-06-21T13:26:50.536+00:00[UTC]");

function update(httpStatus: number, success: boolean): MamContact {
  return {
    at,
    reached: true,
    ip: "1.2.3.4",
    asn: 12_345,
    as: "TestAS",
    ipUpdate: { success, msg: "some message", httpStatus },
  };
}

const lookup: MamContact = { at, reached: true, ip: "1.2.3.4", asn: 1, as: "AS" };
const unreachable: MamContact = {
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

const state: State = {
  cookie: "secret-cookie",
  lastMamContact: update(200, true),
};

describe("serialize / deserialize", () => {
  test("round-trips losslessly", () => {
    const serialized = serializeState(state);
    expect(serializeState(deserializeState(serialized))).toEqual(serialized);
  });

  test("stamps the current version and keeps the cookie on disk", () => {
    const serialized = serializeState(state);
    expect(serialized.version).toBe(2);
    expect(serialized.cookie).toBe("secret-cookie");
  });
});

describe("toPublicState", () => {
  test("omits the cookie, exposing only its presence", () => {
    const pub = toPublicState(state, {
      hasAuth: true,
      nextCheckAt: "2025-06-21T14:00:00+00:00[UTC]",
    });

    expect(pub.hasCookie).toBe(true);
    expect("cookie" in pub).toBe(false);
    expect(JSON.stringify(pub)).not.toContain("secret-cookie");
    expect(pub.hasAuth).toBe(true);
    expect(pub.lastMamContact).toBeDefined();
  });

  test("reports no cookie and no contact without state", () => {
    const pub = toPublicState(undefined, { hasAuth: false });
    expect(pub.hasCookie).toBe(false);
    expect(pub.lastMamContact).toBeUndefined();
  });
});
