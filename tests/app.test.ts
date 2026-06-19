import { parseSetCookie } from "set-cookie-parser";

import type { AppContext } from "../src/backend/context.ts";
import type { FetchLike } from "../src/backend/external-api/fetch.ts";
import type { State } from "../src/backend/state/serde.ts";
import type { StateStore } from "../src/backend/state/store.ts";

import { createApp } from "../src/backend/app.ts";
import { buildConfig } from "../src/backend/config.ts";
import { createAppContext } from "../src/backend/context.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";
import { createMamTestServer } from "./mam-test-server.ts";

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
  app: ReturnType<typeof createApp>;
} {
  const config = buildConfig({
    MOUSEHOLE_AUTH_PASSWORD: "s3cr3t",
    MOUSEHOLE_UPDATE_INTERVAL_SECONDS: "3600",
    ...options.env,
  });
  const ctx = createAppContext(config, {
    fetchImpl: options.fetchImpl ?? rejectExternalFetch,
    stateFile: createInMemoryStateStore(),
  });
  return { ctx, app: createApp(ctx) };
}

async function login(
  app: ReturnType<typeof createApp>,
  password = "s3cr3t",
): Promise<string> {
  const response = await app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}`);
  }
  const cookieValue = parseSetCookie(response.headers.getSetCookie()).find(
    (cookie) => cookie.name === SESSION_COOKIE_NAME,
  )?.value;
  if (!cookieValue) throw new Error("Login response missing session cookie");
  return `${SESSION_COOKIE_NAME}=${cookieValue}`;
}

describe("GET / content negotiation", () => {
  const { app } = makeTestContext();

  test("Accept: application/json redirects to /health", async () => {
    const response = await app.request("/", {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/health");
  });

  test("Accept: text/html redirects to /web", async () => {
    const response = await app.request("/", {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/web");
  });

  test("no Accept header redirects to /web", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/web");
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
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("nas.local:5010");
    expect(body.message).toContain("MOUSEHOLE_ALLOWED_HOSTS");
  });

  test("login explains itself when browser login is unavailable", async () => {
    // Token-only auth: the form must not report "Incorrect password".
    const { app: tokenOnlyApp } = makeTestContext({
      env: { MOUSEHOLE_AUTH_PASSWORD: "", MOUSEHOLE_AUTH_TOKEN: "api-token" },
    });

    const response = await tokenOnlyApp.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as { message?: string };
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
          const body = (await response.json()) as { type: string };
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
  test("wrong password is rejected with 401", async () => {
    const { app } = makeTestContext();
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  test("malformed JSON is rejected with 400", async () => {
    const { app } = makeTestContext();
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  test("wrong schema is rejected with 400", async () => {
    const { app } = makeTestContext();
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bad: "schema" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  test("login sets a session cookie that authenticates GET /state; logout revokes it", async () => {
    const { app } = makeTestContext();
    const cookie = await login(app);

    const stateResponse = await app.request("/state", {
      headers: { Cookie: cookie },
    });
    expect(stateResponse.status).toBe(200);
    const state = (await stateResponse.json()) as {
      hasAuth: boolean;
      hasCookie: boolean;
    };
    expect(state.hasAuth).toBe(true);
    expect(state.hasCookie).toBe(false);

    const logoutResponse = await app.request("/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logoutResponse.status).toBe(200);

    const afterLogout = await app.request("/state", {
      headers: { Cookie: cookie },
    });
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

    const onA = await a.app.request("/state", { headers: { Cookie: cookie } });
    const onB = await b.app.request("/state", { headers: { Cookie: cookie } });

    expect(onA.status).toBe(200);
    expect(onB.status).toBe(401);
  });
});

describe("public probes", () => {
  test("with no contact yet, /health answer 200 but report not-ok", async () => {
    const { app } = makeTestContext();
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sync: { ok: false, reason: "pending" },
    });
  });
});

describe("session lifecycle", () => {
  test("an expired session stops authenticating without any intervening request", async () => {
    const { ctx, app } = makeTestContext();
    const cookie = `${SESSION_COOKIE_NAME}=${ctx.sessions.create(5)}`;

    await new Promise((resolve) => setTimeout(resolve, 30));

    const response = await app.request("/state", {
      headers: { Cookie: cookie },
    });
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
    const reader = response.body!.getReader();
    const { done } = await reader.read();
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
    const first = await reader.read();
    const frame: unknown = first.value;
    const text =
      typeof frame === "string"
        ? frame
        : new TextDecoder().decode(frame as Uint8Array);
    expect(text).toContain("data: changed");

    // Logout closes the session's streams (the dashboard then re-pulls, gets a
    // 401, and shows the login screen).
    await app.request("/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const afterLogout = await reader.read();
    expect(afterLogout.done).toBe(true);
  });
});

// PUT /cookie with the session cookie + a MAM cookie value (the contact flows).
async function putMamCookie(
  app: ReturnType<typeof createApp>,
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
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie);
    expect(putResponse.status).toBe(200);
    const putState = (await putResponse.json()) as {
      hasCookie: boolean;
      lastMamContact: {
        reached: boolean;
        ip: string;
        ipUpdate: { success: boolean; msg: string; httpStatus: number };
      };
    };
    expect(putState.hasCookie).toBe(true);
    expect(putState.lastMamContact.reached).toBe(true);
    expect(putState.lastMamContact.ip).toBe("203.0.113.7");
    expect(putState.lastMamContact.ipUpdate).toEqual({
      success: true,
      msg: "Completed",
      httpStatus: 200,
    });

    // MAM saw our credentials: the mam_id cookie and Mousehole's user agent.
    const seen = mamServer.received.at(-1);
    expect(seen?.path).toBe("/json/dynamicSeedbox.php");
    expect(seen?.mamId).toBe("mam-session-cookie");
    expect(seen?.userAgent).toMatch(/^mousehole-by-timtimtim\//);

    const healthResponse = await app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      sync: { ok: true, reason: "ok" },
    });

    // GET /state serves the same persisted contact.
    const stateResponse = await app.request("/state", {
      headers: { Cookie: cookie },
    });
    const state = (await stateResponse.json()) as {
      lastMamContact: unknown;
    };
    expect(state.lastMamContact).toEqual(putState.lastMamContact);
  });

  test("a throttled update (429) is persisted and surfaces via /health", async () => {
    const mamServer = createMamTestServer({ outcome: "lastChangeTooRecent" });
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie);
    expect(putResponse.status).toBe(200);
    const putState = (await putResponse.json()) as {
      hasCookie: boolean;
      lastMamContact: {
        ipUpdate: { success: boolean; msg: string; httpStatus: number };
      };
    };
    expect(putState.hasCookie).toBe(true);
    expect(putState.lastMamContact.ipUpdate).toEqual({
      success: false,
      msg: "Last change too recent",
      httpStatus: 429,
    });

    const healthResponse = await app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      sync: { ok: false, reason: "throttled" },
    });
  });

  test("a rejected session (403) is persisted and surfaces via /health", async () => {
    const mamServer = createMamTestServer({ outcome: "ipMismatch" });
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    const putResponse = await putMamCookie(app, cookie);
    expect(putResponse.status).toBe(200);

    const healthResponse = await app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      sync: {
        ok: false,
        reason: "rejected",
      },
    });
  });

  test("a rotated mam_id (Set-Cookie) is persisted and presented on the next contact", async () => {
    const mamServer = createMamTestServer({ rotateCookieTo: "rotated-mam-id" });
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    await putMamCookie(app, cookie, "original-mam-id");
    expect(mamServer.received.at(-1)?.mamId).toBe("original-mam-id");

    // POST /updates contacts again with whatever cookie is on disk — which
    // must now be the rotated one.
    const updatesResponse = await app.request("/updates", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(updatesResponse.status).toBe(200);
    expect(mamServer.received.at(-1)?.mamId).toBe("rotated-mam-id");
  });

  test("without a MAM cookie, an update is just an IP lookup via jsonIp.php", async () => {
    const mamServer = createMamTestServer();
    const { app } = makeTestContext({ fetchImpl: mamServer.fetchImpl });
    const cookie = await login(app);

    const updatesResponse = await app.request("/updates", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(updatesResponse.status).toBe(200);
    const state = (await updatesResponse.json()) as {
      hasCookie: boolean;
      lastMamContact: { reached: boolean; ip: string; ipUpdate?: unknown };
    };
    expect(state.hasCookie).toBe(false);
    expect(state.lastMamContact.reached).toBe(true);
    expect(state.lastMamContact.ip).toBe("203.0.113.7");
    expect(state.lastMamContact.ipUpdate).toBeUndefined();
    expect(mamServer.received.at(-1)?.path).toBe("/json/jsonIp.php");

    const healthResponse = await app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      sync: { ok: false, reason: "no-cookie" },
    });
  });

  test("a network failure is recorded as an unreachable contact, not an error", async () => {
    const { app } = makeTestContext({
      fetchImpl: () => Promise.reject(new Error("connection refused")),
    });
    const cookie = await login(app);

    const updatesResponse = await app.request("/updates", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(updatesResponse.status).toBe(200);
    const state = (await updatesResponse.json()) as {
      lastMamContact: { reached: boolean; error: { type: string } };
    };
    expect(state.lastMamContact.reached).toBe(false);
    expect(state.lastMamContact.error.type).toBe("network-error");

    const healthResponse = await app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      sync: { ok: false, reason: "unreachable" },
    });
  });

  test("a stalled MAM connection times out and is recorded as unreachable", async () => {
    const { app } = makeTestContext({
      env: { MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "0.05" },
      fetchImpl: hangingFetch,
    });
    const cookie = await login(app);

    const updatesResponse = await app.request("/updates", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(updatesResponse.status).toBe(200);
    const state = (await updatesResponse.json()) as {
      lastMamContact: { reached: boolean; error: { type: string } };
    };
    expect(state.lastMamContact.reached).toBe(false);
    expect(state.lastMamContact.error.type).toBe("timeout-error");
  });
});
