import { describe, expect, test } from "bun:test";
import { Temporal } from "temporal-polyfill";

import type { HostInfo, State } from "../src/backend/types.ts";

import { getUpdateReason } from "../src/backend/check.ts";

// getUpdateReason is the pure core of handleGetHealth — it decides whether an
// update is needed and why. Testing it directly covers all health check
// outcomes without needing to mock the file system or network calls.

const hostInfo: HostInfo = {
  ip: "1.2.3.4",
  asn: 12_345,
  as: "TestASN",
};

const goodState: State = {
  currentCookie: "cookie",
  lastMam: {
    request: {
      cookie: "cookie",
      at: Temporal.Now.zonedDateTimeISO(),
    },
    response: {
      cookie: "cookie",
      httpStatus: 200,
      body: {
        Success: true,
        msg: "No change",
        ip: "1.2.3.4",
        ASN: 12_345,
        AS: "TestASN",
      },
    },
  },
};

describe("health check logic", () => {
  test("healthy: returns undefined when everything matches", () => {
    expect(getUpdateReason(goodState, hostInfo, false)).toBeUndefined();
  });

  test("no-last-response: state is undefined", () => {
    expect(getUpdateReason(undefined, hostInfo, false)).toBe(
      "no-last-response",
    );
  });

  test("no-last-response: state exists but has no lastMam", () => {
    expect(getUpdateReason({ currentCookie: "cookie" }, hostInfo, false)).toBe(
      "no-last-response",
    );
  });

  test("last-response-error: last MAM response was not 200", () => {
    const state: State = {
      ...goodState,
      lastMam: {
        ...goodState.lastMam!,
        response: { ...goodState.lastMam!.response, httpStatus: 500 },
      },
    };
    expect(getUpdateReason(state, hostInfo, false)).toBe("last-response-error");
  });

  test("ip-changed: host IP differs from last response", () => {
    expect(
      getUpdateReason(goodState, { ...hostInfo, ip: "9.9.9.9" }, false),
    ).toBe("ip-changed");
  });

  test("asn-changed: ASN differs from last response", () => {
    expect(
      getUpdateReason(goodState, { ...hostInfo, asn: 99_999 }, false),
    ).toBe("asn-changed");
  });

  test("cookie-changed: current cookie differs from last response cookie", () => {
    const state: State = { ...goodState, currentCookie: "new-cookie" };
    expect(getUpdateReason(state, hostInfo, false)).toBe("cookie-changed");
  });

  test("response-stale: last response is older than the stale threshold", () => {
    const state: State = {
      ...goodState,
      lastMam: {
        ...goodState.lastMam!,
        request: {
          ...goodState.lastMam!.request,
          at: Temporal.Now.zonedDateTimeISO().subtract({ days: 2 }),
        },
      },
    };
    expect(getUpdateReason(state, hostInfo, false)).toBe("response-stale");
  });
});
