import { Temporal } from "temporal-polyfill";

import {
  deserializeState,
  serializeState,
  toPublicState,
  type MamContact,
  type State,
} from "../src/backend/state/serde.ts";

const at = Temporal.ZonedDateTime.from("2025-06-21T13:26:50.536+00:00[UTC]");

const contact: MamContact = {
  at,
  reached: true,
  ip: "1.2.3.4",
  asn: 12_345,
  as: "TestAS",
  ipUpdate: { success: true, msg: "some message", httpStatus: 200 },
};

const state: State = {
  cookie: "secret-cookie",
  lastMamContact: contact,
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
      nextContactAt: "2025-06-21T14:00:00+00:00[UTC]",
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
