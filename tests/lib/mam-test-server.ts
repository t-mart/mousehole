// A simulated MAM server for tests, implementing the two endpoints Mousehole
// talks to per MAM's API docs (jsonIp.php, dynamicSeedbox.php). It's a Hono
// app, and a Hono app's `fetch` is a `(Request) => Promise<Response>` — so it
// plugs directly into the backend's injectable `fetchImpl` seam: no port, no
// sockets, no global fetch mutation, but real URL routing, request headers,
// and Set-Cookie semantics.

import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import type { FetchLike } from "../../src/backend/external-api/fetch.ts";

const MAM_COOKIE_KEY = "mam_id";

/**
 * The documented dynamicSeedbox.php outcome matrix (message strings verbatim
 * from MAM's API docs; `msg` casing follows the docs' example payloads).
 * Mousehole branches only on the HTTP status — `msg` is display-only.
 */
export const mamUpdateOutcomes = {
  completed: { status: 200, Success: true, msg: "Completed" },
  noChange: { status: 200, Success: true, msg: "No change" },
  lastChangeTooRecent: {
    status: 429,
    Success: false,
    msg: "Last change too recent",
  },
  noSessionCookie: { status: 403, Success: false, msg: "No Session Cookie" },
  invalidSession: { status: 403, Success: false, msg: "Invalid session" },
  ipMismatch: {
    status: 403,
    Success: false,
    msg: "Invalid session - IP mismatch",
  },
  asnMismatch: {
    status: 403,
    Success: false,
    msg: "Invalid session - ASN mismatch",
  },
  invalidCookie: {
    status: 403,
    Success: false,
    msg: "Invalid session - Invalid Cookie",
  },
  invalidOther: {
    status: 403,
    Success: false,
    msg: "Invalid session - Other",
  },
  notAllowedFunction: {
    status: 403,
    Success: false,
    msg: "Incorrect session type - not allowed this function",
  },
  nonApiSession: {
    status: 403,
    Success: false,
    msg: "Incorrect session type - non-API session",
  },
} as const;

export type MamUpdateOutcome = keyof typeof mamUpdateOutcomes;

export type MamTestServerOptions = {
  /** Host info reported on every response. */
  ip?: string;
  asn?: number;
  as?: string;
  /** dynamicSeedbox outcome when a cookie is presented (default "completed"). */
  outcome?: MamUpdateOutcome;
  /** When set, dynamicSeedbox responses rotate mam_id to this value. */
  rotateCookieTo?: string;
};

/** What the fake observed about each incoming request. */
export type ReceivedRequest = {
  path: string;
  mamId: string | undefined;
  userAgent: string | undefined;
};

export function createMamTestServer(options: MamTestServerOptions = {}) {
  const ip = options.ip ?? "203.0.113.7";
  const asn = options.asn ?? 64_496;
  const as = options.as ?? "TEST-AS (RFC 5737)";
  let outcome: MamUpdateOutcome = options.outcome ?? "completed";

  const received: ReceivedRequest[] = [];

  const app = new Hono();

  app.use(async (c, next) => {
    received.push({
      path: new URL(c.req.url).pathname,
      mamId: getCookie(c, MAM_COOKIE_KEY),
      userAgent: c.req.header("user-agent"),
    });
    await next();
  });

  app.get("/json/jsonIp.php", (c) =>
    c.json({ ip, ASN: asn, AS: as, time: Math.floor(Date.now() / 1000) }),
  );

  app.get("/json/dynamicSeedbox.php", (c) => {
    const mamId = getCookie(c, MAM_COOKIE_KEY);
    // Per the docs, a missing session cookie is always 403 "No Session Cookie".
    const effective = mamId
      ? mamUpdateOutcomes[outcome]
      : mamUpdateOutcomes.noSessionCookie;

    if (mamId && options.rotateCookieTo) {
      setCookie(c, MAM_COOKIE_KEY, options.rotateCookieTo);
    }

    return c.json(
      { Success: effective.Success, msg: effective.msg, ip, ASN: asn, AS: as },
      effective.status,
    );
  });

  const fetchImpl: FetchLike = (input, init) =>
    Promise.resolve(app.fetch(new Request(input, init)));

  return {
    /** Plug into `createAppContext(config, { fetchImpl })`. */
    fetchImpl,
    /** Every request the fake saw, in order. */
    received,
    /** Change the dynamicSeedbox outcome between calls. */
    setOutcome(next: MamUpdateOutcome): void {
      outcome = next;
    },
  };
}
