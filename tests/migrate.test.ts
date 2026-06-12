import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SchemaError } from "../src/backend/error.ts";
import { migrateToCurrent } from "../src/backend/state/migrate.ts";
import {
  STATE_VERSION,
  type SerializedState,
} from "../src/backend/state/serde.ts";
import { StateFileStore } from "../src/backend/state/store.ts";

const source = "state.json";

// A faithful v1 state file, exactly as the old app wrote it (per the old
// serializedStateSchema): currentCookie + lastMam{request,response} +
// lastUpdate, and no version field. Only currentCookie must survive.
function v1State(options: { rotatedResponseCookie?: string } = {}) {
  return {
    currentCookie: "current-cookie-value",
    lastMam: {
      request: {
        cookie: "current-cookie-value",
        at: "2025-05-01T10:00:00-05:00[America/Chicago]",
      },
      response: {
        ...(options.rotatedResponseCookie && {
          cookie: options.rotatedResponseCookie,
        }),
        httpStatus: 200,
        body: {
          Success: true,
          msg: "No change",
          ip: "203.0.113.7",
          ASN: 64_496,
          AS: "TEST-AS (RFC 5737)",
        },
      },
    },
    lastUpdate: {
      at: "2025-05-01T10:05:00-05:00[America/Chicago]",
      mamUpdated: true,
      mamUpdateReason: "ip-changed",
    },
  };
}

describe("migrateToCurrent", () => {
  describe("legacy (unversioned) state", () => {
    test("lifts currentCookie into a current-version state", () => {
      const result = migrateToCurrent({ currentCookie: "abc" }, source);
      expect(result.version).toBe(STATE_VERSION);
      expect(result.cookie).toBe("abc");
      expect(result.lastMamContact).toBeUndefined();
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
      expect(result.lastMamContact).toBeUndefined();
    });

    test("yields no cookie when none is present", () => {
      expect(migrateToCurrent({}, source).cookie).toBeUndefined();
    });

    test("treats a non-current version number as legacy", () => {
      const result = migrateToCurrent(
        { version: 1, currentCookie: "abc" },
        source,
      );
      expect(result.version).toBe(STATE_VERSION);
      expect(result.cookie).toBe("abc");
    });

    test("migrates a faithful v1 state: the cookie survives, nothing else", () => {
      const result = migrateToCurrent(v1State(), source);
      expect(result).toEqual({
        version: STATE_VERSION,
        cookie: "current-cookie-value",
      });
    });

    test("ignores a rotated lastMam.response.cookie — currentCookie is canonical", () => {
      // The old app always synced rotations (and manual UI sets) back into
      // currentCookie before persisting, so response.cookie is never newer.
      const result = migrateToCurrent(
        v1State({ rotatedResponseCookie: "stale-rotation" }),
        source,
      );
      expect(result.cookie).toBe("current-cookie-value");
    });
  });

  describe("a v1 state file on disk", () => {
    const temporaryRoot = path.join(import.meta.dir, ".tmp-migrate");

    afterAll(() => {
      rmSync(temporaryRoot, { recursive: true, force: true });
    });

    test("boots without intervention and upgrades on the next write", async () => {
      const directory = path.join(temporaryRoot, `${process.pid}`);
      mkdirSync(directory, { recursive: true });
      const statePath = path.join(directory, "state.json");
      writeFileSync(statePath, JSON.stringify(v1State(), undefined, 2));

      // The boot path: contact.ts reads via readIfExists before every contact.
      const store = new StateFileStore(directory);
      const state = await store.readIfExists();
      expect(state).toEqual({ cookie: "current-cookie-value" });

      // The first persisted contact rewrites the file at the current version,
      // leaving no legacy keys behind.
      await store.write(state ?? {});
      const onDisk: unknown = JSON.parse(readFileSync(statePath, "utf8"));
      expect(onDisk).toEqual({
        version: STATE_VERSION,
        cookie: "current-cookie-value",
      });
    });
  });

  describe("non-object input", () => {
    // eslint-disable-next-line unicorn/no-null -- JSON.parse("null") yields null
    test.each([null, undefined, "string", 42])(
      "yields no cookie for %p",
      (input) => {
        expect(migrateToCurrent(input, source).cookie).toBeUndefined();
      },
    );
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
      const corrupt = {
        version: STATE_VERSION,
        lastMamContact: { reached: true },
      };
      expect(() => migrateToCurrent(corrupt, source)).toThrow(SchemaError);
    });
  });
});
