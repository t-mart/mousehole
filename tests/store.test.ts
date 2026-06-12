import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Temporal } from "temporal-polyfill";

import {
  FileReadError,
  JSONParseError,
  SchemaError,
} from "../src/backend/error.ts";
import { type State } from "../src/backend/state/serde.ts";
import { StateFileStore } from "../src/backend/state/store.ts";

// Each store gets its own directory so tests never share files.
const temporaryRoot = path.join(import.meta.dir, ".tmp-store");
let directoryCounter = 0;

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function makeStore() {
  const directory = path.join(
    temporaryRoot,
    `${process.pid}-${directoryCounter++}`,
  );
  return { store: new StateFileStore(directory), directory };
}

describe("StateFileStore", () => {
  test("readIfExists is undefined before anything is written", async () => {
    const { store } = makeStore();
    expect(await store.readIfExists()).toBeUndefined();
  });

  test("write → readIfExists round-trips the state", async () => {
    const { store } = makeStore();
    const state: State = {
      cookie: "mam-cookie",
      lastMamContact: {
        at: Temporal.ZonedDateTime.from("2025-06-21T13:26:50+00:00[UTC]"),
        reached: true,
        ip: "1.2.3.4",
        asn: 12_345,
        as: "TestAS",
        ipUpdate: { success: true, msg: "Completed", httpStatus: 200 },
      },
    };

    await store.write(state);

    expect(await store.readIfExists()).toEqual(state);
  });

  test("readIfExists propagates read failures that aren't a missing file", async () => {
    const { store, directory } = makeStore();
    // state.json as a *directory*: reading it fails with EISDIR, not ENOENT.
    // That must surface — masking it as "no state yet" would let the next
    // contact write a cookieless state over whatever is really there.
    mkdirSync(path.join(directory, "state.json"), { recursive: true });

    // bun-types declare async matchers as void, but `.rejects` returns a
    // real promise (vitest semantics) that must be awaited
    //
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(store.readIfExists()).rejects.toThrow(FileReadError);
  });

  test("corrupt JSON surfaces as a JSONParseError, not as missing state", async () => {
    const { store, directory } = makeStore();
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "state.json"), "{not json");

    // ditto
    //
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(store.readIfExists()).rejects.toThrow(JSONParseError);
  });

  test("a structurally invalid current-version state surfaces as a SchemaError", async () => {
    const { store, directory } = makeStore();
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "state.json"),
      JSON.stringify({ version: 2, lastMamContact: { reached: true } }),
    );

    // ditto
    //
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(store.readIfExists()).rejects.toThrow(SchemaError);
  });
});
