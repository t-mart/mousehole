import { describe, expect, test } from "bun:test";

import { SchemaError } from "../src/backend/error.ts";
import { migrateToCurrent } from "../src/backend/migrate.ts";
import { STATE_VERSION, type SerializedState } from "../src/backend/serde.ts";

const source = "state.json";

describe("migrateToCurrent", () => {
  describe("legacy (unversioned) state", () => {
    test("lifts currentCookie into a current-version state", () => {
      const result = migrateToCurrent({ currentCookie: "abc" }, source);
      expect(result.version).toBe(STATE_VERSION);
      expect(result.cookie).toBe("abc");
      expect(result.lastMam).toBeUndefined();
    });

    test("drops everything but the cookie", () => {
      const result = migrateToCurrent(
        {
          currentCookie: "abc",
          lastMam: { request: { cookie: "abc" }, response: {} },
          lastUpdate: { mamUpdated: true },
        },
        source,
      );
      expect(result.cookie).toBe("abc");
      expect(result.lastMam).toBeUndefined();
    });

    test("yields no cookie when none is present", () => {
      expect(migrateToCurrent({}, source).cookie).toBeUndefined();
    });

    test("treats a non-current version number as legacy", () => {
      const result = migrateToCurrent({ version: 1, currentCookie: "abc" }, source);
      expect(result.version).toBe(STATE_VERSION);
      expect(result.cookie).toBe("abc");
    });
  });

  describe("non-object input", () => {
    // eslint-disable-next-line unicorn/no-null -- JSON.parse("null") yields null
    test.each([null, undefined, "string", 42])("yields no cookie for %p", (input) => {
      expect(migrateToCurrent(input, source).cookie).toBeUndefined();
    });
  });

  describe("current-version state", () => {
    const valid: SerializedState = {
      version: STATE_VERSION,
      cookie: "xyz",
      lastMamContact: {
        at: "2025-06-21T14:27:28.113-05:00[America/Chicago]",
        reached: true,
        ip: "1.2.3.4",
        asn: 1234,
        as: "Org for 1234",
        ipUpdate: { success: true, msg: "No change", httpStatus: 200 },
      },
    };

    test("passes a valid state through unchanged", () => {
      expect(migrateToCurrent(valid, source)).toEqual(valid);
    });

    test("throws SchemaError on a corrupt current-version state", () => {
      const corrupt = { version: STATE_VERSION, lastMamContact: { reached: true } };
      expect(() => migrateToCurrent(corrupt, source)).toThrow(SchemaError);
    });
  });
});
