// A fixture is a named definition of how the app's MAM dependency behaves, plus
// optional seed state, for a hand-driven demo or manual test. `bun demo <name>`
// boots the server in this state (see run.ts). Adding one is a single object;
// `mamUpdateOutcomes` in ../tests/mam-test-server.ts enumerates the outcomes.

import { Temporal } from "temporal-polyfill";

import type { State } from "#backend/state/serde.ts";

import type { MamTestServerOptions } from "../tests/mam-test-server.ts";

export interface Fixture {
  // CLI selector and state-dir name.
  name: string;
  description?: string;
  // How the mocked MAM behaves (outcome/ip/asn/as/rotateCookieTo).
  mam?: MamTestServerOptions;
  // App auth password the server runs with. Omit to run with auth disabled.
  password?: string;
  // Extra backend env overrides, e.g. a faster update interval for the demo.
  env?: Record<string, string>;
  // State to seed before booting. Undefined boots with no state (fresh install).
  // The runner always starts the fixture's state dir empty, then writes this.
  initialState?: State;
}

const HOST = { ip: "12.34.56.78", asn: 12_345, as: "MegaCorp Networks" };

export const fixtures: Fixture[] = [
  {
    name: "happy-path",
    description: 'Fresh install; set a cookie and MAM returns "completed".',
    password: "password",
    mam: { outcome: "completed", ...HOST },
  },
  {
    name: "ip-mismatch",
    description: "Fresh install; MAM rejects the cookie with an IP mismatch.",
    password: "password",
    mam: { outcome: "ipMismatch", ...HOST },
  },
  {
    name: "running",
    description: "Already has a cookie and a recent successful contact.",
    password: "password",
    mam: { outcome: "completed", ...HOST },
    initialState: {
      cookie: "fake-mam-id-for-demos",
      lastMamContact: {
        at: Temporal.Now.zonedDateTimeISO().subtract({ minutes: 2 }),
        reached: true,
        ...HOST,
        ipUpdate: { success: true, msg: "Completed", httpStatus: 200 },
      },
    },
  },
];
