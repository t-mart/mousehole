import { Temporal } from "temporal-polyfill";

import type { NetworkChange } from "../src/backend/state/serde.ts";

import {
  appendHistory,
  describeIdentityChange,
  MAX_HISTORY,
} from "../src/backend/contact.ts";

const at = Temporal.ZonedDateTime.from("2025-06-21T13:26:50+00:00[UTC]");

function change(ip: string, asn: number, as = `AS${asn}`): NetworkChange {
  return { at, ip, asn, as };
}

describe("describeIdentityChange", () => {
  test("returns undefined for the first-ever observation (no prior)", () => {
    expect(
      describeIdentityChange(undefined, { ip: "1.2.3.4", asn: 1, as: "A" }),
    ).toBeUndefined();
  });

  test("returns undefined when ip and asn are unchanged", () => {
    const prev = change("1.2.3.4", 1, "A");
    // A differing `as` string alone is not a change; we compare ip and asn only.
    expect(
      describeIdentityChange(prev, { ip: "1.2.3.4", asn: 1, as: "renamed" }),
    ).toBeUndefined();
  });

  test("describes an ip-only change", () => {
    const prev = change("1.2.3.4", 1);
    expect(
      describeIdentityChange(prev, { ip: "5.6.7.8", asn: 1, as: "AS1" }),
    ).toBe("IP 1.2.3.4 -> 5.6.7.8");
  });

  test("describes an asn-only change", () => {
    const prev = change("1.2.3.4", 1);
    expect(
      describeIdentityChange(prev, { ip: "1.2.3.4", asn: 2, as: "AS2" }),
    ).toBe("ASN 1 -> 2");
  });

  test("describes a combined ip and asn change", () => {
    const prev = change("1.2.3.4", 1);
    expect(
      describeIdentityChange(prev, { ip: "5.6.7.8", asn: 2, as: "AS2" }),
    ).toBe("IP 1.2.3.4 -> 5.6.7.8, ASN 1 -> 2");
  });
});

describe("appendHistory", () => {
  test("seeds a baseline entry when history is empty/undefined", () => {
    const observed = { ip: "1.2.3.4", asn: 1, as: "A" };
    expect(appendHistory(undefined, observed, at)).toEqual([
      { at, ...observed },
    ]);
    expect(appendHistory([], observed, at)).toEqual([{ at, ...observed }]);
  });

  test("appends a new entry when the identity changed", () => {
    const history = [change("1.2.3.4", 1)];
    const next = appendHistory(
      history,
      { ip: "5.6.7.8", asn: 1, as: "AS1" },
      at,
    );
    expect(next).toHaveLength(2);
    expect(next.at(-1)).toEqual({ at, ip: "5.6.7.8", asn: 1, as: "AS1" });
  });

  test("returns history unchanged when the identity is the same", () => {
    const history = [change("1.2.3.4", 1, "A")];
    const next = appendHistory(history, { ip: "1.2.3.4", asn: 1, as: "A" }, at);
    expect(next).toEqual(history);
  });

  test("does not mutate the input history", () => {
    const history = [change("1.2.3.4", 1)];
    appendHistory(history, { ip: "5.6.7.8", asn: 2, as: "AS2" }, at);
    expect(history).toHaveLength(1);
  });

  test(`keeps at most MAX_HISTORY (${MAX_HISTORY}) entries, newest kept`, () => {
    let history: NetworkChange[] = [];
    // Each observation has a distinct ip, so every one appends.
    for (let index = 0; index < MAX_HISTORY + 3; index++) {
      history = appendHistory(
        history,
        { ip: `10.0.0.${index}`, asn: 1, as: "A" },
        at,
      );
    }
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history.at(-1)?.ip).toBe(`10.0.0.${MAX_HISTORY + 2}`);
    expect(history[0]?.ip).toBe(`10.0.0.3`);
  });
});
