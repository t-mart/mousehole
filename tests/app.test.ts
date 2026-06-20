import type { MockInstance } from "vitest";

import { parseSetCookie } from "set-cookie-parser";

import type { AppContext } from "../src/backend/context.ts";
import type { FetchLike } from "../src/backend/external-api/fetch.ts";
import type { State } from "../src/backend/state/serde.ts";
import type { StateStore } from "../src/backend/state/store.ts";
import type { ErrorResponseBody } from "../src/shared/error-response.ts";
import type {
  ContactStatus,
  IpUpdate,
  PublicState,
  SerializedMamContact,
} from "../src/shared/public-state.ts";
import type { MamUpdateOutcome } from "./lib/mam-test-server.ts";

import { createApp } from "../src/backend/app.ts";
import { buildConfig } from "../src/backend/config.ts";
import { createAppContext } from "../src/backend/context.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";
import { json } from "./lib/helpers.ts";
import { createMamTestServer } from "./lib/mam-test-server.ts";

type TestApp = ReturnType<typeof createApp>;

// Tests must never touch the real network; contexts built without an explicit
// fetchImpl fail loudly if anything tries.
const rejectExternalFetch: FetchLike = () =>
  Promise.reject(new Error("unexpected external fetch in test"));

// An in-memory StateStore for tests: no disk, so contexts stay hermetic and
// isolated. The real on-disk StateFileStore is exercised in store.test.ts.
function createInMemoryStateStore(initial?: State): StateStore {
  let state = initial;
  return {
    readIfExists: () => Promise.resolve(state),
    write: (next) => {
      state = next;
      return Promise.resolve();
    },
  };
}

function makeTestContext(
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike } = {},
): {
  ctx: AppContext;
  app: TestApp;
  store: StateStore;
  writeSpy: MockInstance<StateStore["write"]>;
} {
  const config = buildConfig({
    MOUSEHOLE_AUTH_PASSWORD: "s3cr3t",
    MOUSEHOLE_UPDATE_INTERVAL_SECONDS: "3600",
    ...options.env,
  });
  const store = createInMemoryStateStore();
  // Spy on write so tests can assert what got persisted. restoreMocks
  // (vitest.config.ts) puts it back after each test.
  const writeSpy = vi.spyOn(store, "write");
  const ctx = createAppContext(config, {
    fetchImpl: options.fetchImpl ?? rejectExternalFetch,
    stateFile: store,
  });
  return { ctx, app: createApp(ctx), store, writeSpy };
}

async function postLogin(
  app: TestApp,
  body: Record<string, unknown> | string,
): Promise<Response> {
  return app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function login(app: TestApp, password = "s3cr3t"): Promise<string> {
  const response = await postLogin(app, { password });
  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}`);
  }
  const cookieValue = parseSetCookie(response.headers.getSetCookie()).find(
    (cookie) => cookie.name === SESSION_COOKIE_NAME,
  )?.value;
  if (!cookieValue) throw new Error("Login response missing session cookie");
  return `${SESSION_COOKIE_NAME}=${cookieValue}`;
}

async function getState(app: TestApp, cookie: string): Promise<Response> {
  return app.request("/state", { headers: { Cookie: cookie } });
}

async function postUpdates(app: TestApp, cookie: string): Promise<Response> {
  return app.request("/updates", {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

async function logout(app: TestApp, cookie: string): Promise<Response> {
  return app.request("/logout", {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

async function expectHealthResult(
  app: TestApp,
  result: ContactStatus,
): Promise<void> {
  const response = await app.request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ lastMamContactResult: result });
}

describe("GET / content negotiation", () => {
  const { app } = makeTestContext();

  test.each([
    {
      name: "Accept: application/json redirects to /health",
      accept: "application/json",
      location: "/health",
    },
    {
      name: "Accept: text/html redirects to /web",
      accept: "text/html",
      location: "/web",
    },
    {
      name: "no Accept header redirects to /web",
      accept: undefined,
      location: "/web",
    },
  ])("$name", async ({ accept, location }) => {
    const response = await app.request(
      "/",
      accept ? { headers: { Accept: accept } } : {},
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(location);
  });
});

describe("error shapes", () => {
  const { app } = makeTestContext();

  test("unknown path returns the not-found body", async () => {
    const response = await app.request("/definitely-not-a-route");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "not-found",
      }),
    );
  });

  test("a disallowed Host tells the user how to fix it", async () => {
    // The forum-reported case: browsing via a host missing from
    // MOUSEHOLE_ALLOWED_HOSTS. The client-facing message must be actionable.
    const response = await app.request("/state", {
      headers: { Host: "nas.local:5010" },
    });

    expect(response.status).toBe(403);
    const body = await json<ErrorResponseBody>(response);
    expect(body.message).toContain("nas.local:5010");
    expect(body.message).toContain("MOUSEHOLE_ALLOWED_HOSTS");
  });

  test("login explains itself when browser login is unavailable", async () => {
    // Token-only auth: the form must not report "Incorrect password".
    const { app: tokenOnlyApp } = makeTestContext({
      env: { MOUSEHOLE_AUTH_PASSWORD: "", MOUSEHOLE_AUTH_TOKEN: "api-token" },
    });

    const response = await postLogin(tokenOnlyApp, { password: "anything" });

    expect(response.status).toBe(500);
    const body = await json<ErrorResponseBody>(response);
    expect(body.message).toContain("MOUSEHOLE_AUTH_PASSWORD");
  });

  test("oversized request bodies are rejected with 413 before auth even runs", async () => {
    // No credentials, yet the response is 413 (not 401): the global bodyLimit
    // middleware sits in front of every route's boundary stack.
    const response = await app.request("/cookie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(9 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "payload-too-large",
      }),
    );
  });
});

// What each boundary protection's rejection looks like on the wire.
const rejections = {
  host: { status: 403, type: "host-not-allowed" },
  auth: { status: 401, type: "authentication-required" },
  origin: { status: 403, type: "origin-not-allowed" },
  json: { status: 415, type: "unsupported-media-type" },
  bodyLimit: { status: 413, type: "payload-too-large" },
} as const;

type RouteProtection = keyof typeof rejections;

type RouteSpec = {
  method: "GET" | "POST" | "PUT";
  path: string;
  /** The protections this route must enforce, in stack order. */
  enforces: readonly RouteProtection[];
  /** Valid JSON body for successful request, for routes that take one. */
  body?: Record<string, string>;
  /** Whether successful request authenticates with the shared session. */
  sendsSession: boolean;
};

// The expected protection profile of every backend endpoint. /health,
// and / are deliberately public (probes and the web entry redirect); /web
// serves the login page's own assets.
const routeSpecs: readonly RouteSpec[] = [
  {
    method: "POST",
    path: "/login",
    enforces: ["host", "origin", "json", "bodyLimit"],
    body: { password: "s3cr3t" },
    sendsSession: false,
  },
  {
    method: "POST",
    path: "/logout",
    enforces: ["host", "origin"],
    sendsSession: false,
  },
  {
    method: "POST",
    path: "/updates",
    enforces: ["host", "auth", "origin"],
    sendsSession: true,
  },
  {
    method: "GET",
    path: "/state",
    enforces: ["host", "auth"],
    sendsSession: true,
  },
  {
    method: "PUT",
    path: "/cookie",
    enforces: ["host", "auth", "origin", "json", "bodyLimit"],
    body: { value: "mam-session-cookie" },
    sendsSession: true,
  },
  {
    method: "GET",
    path: "/events",
    enforces: ["host", "auth", "origin"],
    sendsSession: true,
  },
];

// A fully valid request for the route, with at most one protection violated.
// `bearerToken` authenticates with a token instead of the session cookie.
function buildMatrixRequest(
  spec: RouteSpec,
  sessionCookie: string,
  options: { violate?: RouteProtection; bearerToken?: string } = {},
): RequestInit {
  const { violate, bearerToken } = options;
  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else if (spec.sendsSession && violate !== "auth") {
    headers.Cookie = sessionCookie;
  }
  if (violate === "host") headers.Host = "evil.example.com";
  if (violate === "origin") headers.Origin = "http://evil.example";

  if (!spec.body) return { method: spec.method, headers };

  headers["Content-Type"] =
    violate === "json" ? "text/plain" : "application/json";
  return {
    method: spec.method,
    headers,
    body:
      violate === "bodyLimit"
        ? JSON.stringify({ padding: "x".repeat(9 * 1024) })
        : JSON.stringify(spec.body),
  };
}

describe("route protection matrix", () => {
  // One shared app with both password and token auth configured: successful
  // requests prove a fully valid request reaches each handler (MAM-contacting
  // handlers hit the fake, never the network); each violation perturbs
  // exactly one protection and expects its rejection.
  const mamServer = createMamTestServer();
  const { app } = makeTestContext({
    env: { MOUSEHOLE_AUTH_TOKEN: "api-token" },
    fetchImpl: mamServer.fetchImpl,
  });
  let sessionCookie = "";

  beforeAll(async () => {
    sessionCookie = await login(app);
  });

  for (const spec of routeSpecs) {
    describe(`${spec.method} ${spec.path}`, () => {
      test("a fully valid request reaches the handler", async () => {
        const response = await app.request(
          spec.path,
          buildMatrixRequest(spec, sessionCookie),
        );
        expect(response.status).toBe(200);
        // /events answers with an open SSE stream; release it.
        await response.body?.cancel();
      });

      for (const protection of spec.enforces) {
        const rejection = rejections[protection];
        test(`enforces ${protection}: ${rejection.status} ${rejection.type}`, async () => {
          const response = await app.request(
            spec.path,
            buildMatrixRequest(spec, sessionCookie, { violate: protection }),
          );
          expect(response.status).toBe(rejection.status);
          const body = await json<ErrorResponseBody>(response);
          expect(body.type).toBe(rejection.type);
          if (protection === "auth") {
            expect(response.headers.get("www-authenticate")).toContain(
              "Bearer",
            );
          }
        });
      }

      // The origin check is CSRF defense; a Bearer token can't be attached by
      // a cross-site page, so token-authenticated requests are exempt. The
      // origin violation above (session cookie + evil Origin → 403) pins that
      // browser sessions stay enforced even with a token configured.
      if (spec.sendsSession && spec.enforces.includes("origin")) {
        test("a token-authenticated request bypasses the origin check", async () => {
          const response = await app.request(
            spec.path,
            buildMatrixRequest(spec, sessionCookie, {
              violate: "origin",
              bearerToken: "api-token",
            }),
          );
          expect(response.status).toBe(200);
          await response.body?.cancel();
        });
      }
    });
  }
});

describe("login/logout flow", () => {
  test.each([
    {
      name: "wrong password is rejected with 401",
      body: { password: "wrong" },
      status: 401,
    },
    {
      name: "malformed JSON is rejected with 400",
      body: "not json",
      status: 400,
    },
    {
      name: "wrong schema is rejected with 400",
      body: { bad: "schema" },
      status: 400,
    },
  ])("$name", async ({ body, status }) => {
    const { app } = makeTestContext();
    const response = await postLogin(app, body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  test("login sets a session cookie that authenticates GET /state; logout revokes it", async () => {
    const { app } = makeTestContext();
    const cookie = await login(app);

    const stateResponse = await getState(app, cookie);
    expect(stateResponse.status).toBe(200);
    const state = await json<PublicState>(stateResponse);
    expect(state.hasAuth).toBe(true);
    expect(state.hasCookie).toBe(false);

    const logoutResponse = await logout(app, cookie);
    expect(logoutResponse.status).toBe(200);

    const afterLogout = await getState(app, cookie);
    expect(afterLogout.status).toBe(401);
  });

  test("the session cookie is HttpOnly, SameSite=Lax, and path-scoped", async () => {
    const { app } = makeTestContext();
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "s3cr3t" }),
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Secure");
  });

  test("MOUSEHOLE_HTTPS_ONLY_COOKIES marks the session cookie Secure", async () => {
    const { app } = makeTestContext({
      env: { MOUSEHOLE_HTTPS_ONLY_COOKIES: "true" },
    });
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "s3cr3t" }),
    });

    expect(response.headers.get("set-cookie") ?? "").toContain("Secure");
  });

  test("contexts are hermetic: a session from one app is rejected by another", async () => {
    const a = makeTestContext();
    const b = makeTestContext();

    const cookie = await login(a.app);

    const onA = await getState(a.app, cookie);
    const onB = await getState(b.app, cookie);

    expect(onA.status).toBe(200);
    expect(onB.status).toBe(401);
  });
});

describe("public probes", () => {
  test("with no contact yet, /health answer 200 but report not-ok", async () => {
    const { app } = makeTestContext();
    await expectHealthResult(app, "pending");
  });
});

// A stream chunk arrives as a Uint8Array (or, in some runtimes, an already
// decoded string); normalize either to text.
function decodeFrame(value: string | Uint8Array | undefined): string {
  if (typeof value === "string") return value;
  return value ? new TextDecoder().decode(value) : "";
}

// Read one frame off an SSE stream as { done, text }.
async function readFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ done: boolean; text: string }> {
  const { done, value } = await reader.read();
  return { done, text: decodeFrame(value) };
}

describe("session lifecycle", () => {
  test("an expired session stops authenticating without any intervening request", async () => {
    const { ctx, app } = makeTestContext();
    const cookie = `${SESSION_COOKIE_NAME}=${ctx.sessions.create(5)}`;

    await new Promise((resolve) => setTimeout(resolve, 30));

    const response = await getState(app, cookie);
    expect(response.status).toBe(401);
  });

  test("session expiry closes an open /events stream", async () => {
    const { ctx, app } = makeTestContext();
    const cookie = `${SESSION_COOKIE_NAME}=${ctx.sessions.create(75)}`;

    const response = await app.request("/events", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);

    // When the 75ms session expires, its stream is closed and the read resolves
    // done — the browser would then re-pull, get a 401, and show the login form.
    const { done } = await readFrame(response.body!.getReader());
    expect(done).toBe(true);
  });

  test("deleting an unknown session is a no-op", () => {
    const { ctx } = makeTestContext();
    expect(() =>
      ctx.sessions.deleteSession("not-a-real-session"),
    ).not.toThrow();
  });
});

describe("server-sent events", () => {
  test("an authenticated stream receives the changed signal and closes on logout", async () => {
    const { ctx, app } = makeTestContext();
    const cookie = await login(app);

    const response = await app.request("/events", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    ctx.sse.notify();
    const first = await readFrame(reader);
    expect(first.text).toContain("data: changed");

    // Logout closes the session's streams (the dashboard then re-pulls, gets a
    // 401, and shows the login screen).
    await logout(app, cookie);
    const afterLogout = await readFrame(reader);
    expect(afterLogout.done).toBe(true);
  });
});

// PUT /cookie with the session cookie + a MAM cookie value (the contact flows).
async function putMamCookie(
  app: TestApp,
  sessionCookie: string,
  value = "mam-session-cookie",
): Promise<Response> {
  return app.request("/cookie", {
    method: "PUT",
    headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

// Hangs until the request's AbortSignal (AbortSignal.timeout in
// fetchExternal) fires, like a connection that never answers.
function hangingFetch(_input: URL | RequestInfo, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(init.signal?.reason as Error);
    });
  });
}

// The wire contact is a discriminated union; narrow it to the branch a test
// asserts on. Each throws if the contact isn't the expected branch.
type ReachedContact = Extract<SerializedMamContact, { reached: true }>;
type UnreachedContact = Extract<SerializedMamContact, { reached: false }>;

function reachedContact(state: PublicState): ReachedContact {
  const contact = state.lastMamContact;
  if (contact?.reached !== true) {
    throw new Error(
      `expected a reached contact, got ${JSON.stringify(contact)}`,
    );
  }
  return contact;
}

function unreachedContact(state: PublicState): UnreachedContact {
  const contact = state.lastMamContact;
  if (contact?.reached !== false) {
    throw new Error(
      `expected an unreached contact, got ${JSON.stringify(contact)}`,
    );
  }
  return contact;
}

describe("PUT /cookie validation", () => {
  test("an empty cookie value is rejected with 400", async () => {
    const { app } = makeTestContext();
    const cookie = await login(app);

    const response = await putMamCookie(app, cookie, "");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "schema-error",
        issues: [expect.objectContaining({ path: "value" })],
      }),
    );
  });
});

describe("contact flows (simulated MAM)", () => {
  test("PUT /cookie runs an update, persists, and flips /health to healthy", async () => {
    const mamServer = createMamTestServer();
    const { app, writeSpy } = makeTestContext({
      fetchImpl: mamServer.fetchImpl,
    });
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie);
    expect(putResponse.status).toBe(200);
    const putState = await json<PublicState>(putResponse);
    expect(putState.hasCookie).toBe(true);
    // The submitted cookie is persisted, not just echoed in the response.
    expect(writeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ cookie: "mam-session-cookie" }),
    );
    const contact = reachedContact(putState);
    expect(contact.ip).toBe("203.0.113.7");
    expect(contact.ipUpdate).toEqual({
      success: true,
      msg: "Completed",
      httpStatus: 200,
    });

    // MAM saw our credentials: the mam_id cookie and Mousehole's user agent.
    const seen = mamServer.received.at(-1);
    expect(seen?.path).toBe("/json/dynamicSeedbox.php");
    expect(seen?.mamId).toBe("mam-session-cookie");
    expect(seen?.userAgent).toMatch(/^mousehole-by-timtimtim\//);

    await expectHealthResult(app, "ok");

    // GET /state serves the same persisted contact.
    const stateResponse = await getState(app, cookie);
    const state = await json<PublicState>(stateResponse);
    expect(state.lastMamContact).toEqual(putState.lastMamContact);
  });

  // Whatever MAM answers, PUT /cookie saves the cookie the user gave us (the
  // dashboard re-prompts if MAM rejected it) and the verdict surfaces via
  // /health. `ipUpdate` is asserted only where MAM ran the update.
  test.each<{
    name: string;
    outcome: MamUpdateOutcome;
    healthResult: ContactStatus;
    ipUpdate?: IpUpdate;
  }>([
    {
      name: "a throttled update (429) is persisted and surfaces via /health",
      outcome: "lastChangeTooRecent",
      healthResult: "throttled",
      ipUpdate: {
        success: false,
        msg: "Last change too recent",
        httpStatus: 429,
      },
    },
    {
      name: "a rejected session (403) is persisted and surfaces via /health",
      outcome: "ipMismatch",
      healthResult: "rejected",
    },
  ])("$name", async ({ outcome, healthResult, ipUpdate }) => {
    const mamServer = createMamTestServer({ outcome });
    const { app, writeSpy } = makeTestContext({
      fetchImpl: mamServer.fetchImpl,
    });
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie);
    expect(putResponse.status).toBe(200);
    const putState = await json<PublicState>(putResponse);
    expect(putState.hasCookie).toBe(true);
    expect(writeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ cookie: "mam-session-cookie" }),
    );
    if (ipUpdate) {
      expect(reachedContact(putState).ipUpdate).toEqual(ipUpdate);
    }

    await expectHealthResult(app, healthResult);
  });

  test("PUT /cookie persists the cookie even when MAM is unreachable", async () => {
    // Default context: rejectExternalFetch makes the MAM contact fail, so the
    // update never happens. The cookie must still be saved (the IP update is a
    // side effect, not a precondition for persisting the credential).
    const { app, writeSpy } = makeTestContext();
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie, "persist-me");
    expect(putResponse.status).toBe(200);
    const putState = await json<PublicState>(putResponse);
    expect(putState.hasCookie).toBe(true);
    expect(putState.lastMamContact?.reached).toBe(false);

    // The failed contact didn't stop the cookie from being persisted.
    expect(writeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ cookie: "persist-me" }),
    );

    // And it survives a re-read from the store.
    const stateResponse = await getState(app, cookie);
    const state = await json<PublicState>(stateResponse);
    expect(state.hasCookie).toBe(true);
  });

  test("a rotated mam_id (Set-Cookie) is persisted and presented on the next contact", async () => {
    const mamServer = createMamTestServer({ rotateCookieTo: "rotated-mam-id" });
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    await putMamCookie(app, cookie, "original-mam-id");
    expect(mamServer.received.at(-1)?.mamId).toBe("original-mam-id");

    // POST /updates contacts again with whatever cookie is on disk — which
    // must now be the rotated one.
    const updatesResponse = await postUpdates(app, cookie);
    expect(updatesResponse.status).toBe(200);
    expect(mamServer.received.at(-1)?.mamId).toBe("rotated-mam-id");
  });

  test("without a MAM cookie, an update is just an IP lookup via jsonIp.php", async () => {
    const mamServer = createMamTestServer();
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    const updatesResponse = await postUpdates(app, cookie);
    expect(updatesResponse.status).toBe(200);
    const state = await json<PublicState>(updatesResponse);
    expect(state.hasCookie).toBe(false);
    const contact = reachedContact(state);
    expect(contact.ip).toBe("203.0.113.7");
    expect(contact.ipUpdate).toBeUndefined();
    expect(mamServer.received.at(-1)?.path).toBe("/json/jsonIp.php");

    await expectHealthResult(app, "no-cookie");
  });

  test("a network failure is recorded as an unreachable contact, not an error", async () => {
    const { app } = makeTestContext({
      fetchImpl: () => Promise.reject(new Error("connection refused")),
    });
    const cookie = await login(app);

    const updatesResponse = await postUpdates(app, cookie);
    expect(updatesResponse.status).toBe(200);
    const state = await json<PublicState>(updatesResponse);
    expect(unreachedContact(state).error.type).toBe("network-error");

    await expectHealthResult(app, "unreachable");
  });

  test("a stalled MAM connection times out and is recorded as unreachable", async () => {
    const { app } = makeTestContext({
      env: { MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "0.05" },
      fetchImpl: hangingFetch,
    });
    const cookie = await login(app);

    const updatesResponse = await postUpdates(app, cookie);
    expect(updatesResponse.status).toBe(200);
    const state = await json<PublicState>(updatesResponse);
    expect(unreachedContact(state).error.type).toBe("timeout-error");
  });
});
