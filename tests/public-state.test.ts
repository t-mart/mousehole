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
  test.each<{
    name: string;
    contact: SerializedMamContact | undefined;
    expected: ReturnType<typeof classify>;
  }>([
    {
      name: "pending when there is no contact",
      contact: undefined,
      expected: "pending",
    },
    {
      name: "unreachable on a transport failure",
      contact: unreachable,
      expected: "unreachable",
    },
    {
      name: "no-cookie on a lookup (reached, no ipUpdate)",
      contact: lookup,
      expected: "no-cookie",
    },
    { name: "ok on a 200 update", contact: update(200, true), expected: "ok" },
    {
      name: "throttled on a 429 update",
      contact: update(429, false),
      expected: "throttled",
    },
    {
      name: "rejected on a 403 update",
      contact: update(403, false),
      expected: "rejected",
    },
  ])("$name", ({ contact, expected }) => {
    expect(classify(contact)).toBe(expected);
  });
});
