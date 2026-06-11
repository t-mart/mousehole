import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import path from "node:path";

import type { AppContext } from "../src/backend/context.ts";

import { createApp } from "../src/backend/app.ts";
import { buildConfig } from "../src/backend/config.ts";
import { createAppContext } from "../src/backend/context.ts";
import { DEFAULT_LOG_LEVEL, setLogLevel } from "../src/backend/logger.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";

// The mocked contact flows log at info; keep test output quiet.
setLogLevel("error");

// Each context gets its own state directory so tests never share files.
const temporaryStateRoot = path.join(import.meta.dir, ".tmp-state");
let stateDirectoryCounter = 0;

afterAll(() => {
  setLogLevel(DEFAULT_LOG_LEVEL);
  rmSync(temporaryStateRoot, { recursive: true, force: true });
});

function makeTestContext(envOverrides: NodeJS.ProcessEnv = {}): {
  ctx: AppContext;
  app: ReturnType<typeof createApp>;
} {
  const config = buildConfig({
    MOUSEHOLE_AUTH_PASSWORD: "s3cr3t",
    MOUSEHOLE_STATE_DIR_PATH: path.join(
      temporaryStateRoot,
      `${process.pid}-${stateDirectoryCounter++}`,
    ),
    MOUSEHOLE_CHECK_INTERVAL_SECONDS: "3600",
    ...envOverrides,
  });
  const ctx = createAppContext(config);
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
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie);
  if (!match?.[1]) throw new Error(`No session cookie in: "${setCookie}"`);
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}

// A MAM dynamicSeedbox.php response; the IP-update flows stub global fetch with
// this so no test ever touches the network.
function mamResponse(
  overrides: Partial<{
    Success: boolean;
    msg: string;
    status: number;
  }> = {},
): Response {
  return Response.json(
    {
      Success: overrides.Success ?? true,
      msg: overrides.msg ?? "Completed",
      ip: "203.0.113.7",
      ASN: 64_496,
      AS: "Test AS",
    },
    { status: overrides.status ?? 200 },
  );
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubExternalFetch(response: () => Response): void {
  globalThis.fetch = (() =>
    Promise.resolve(response())) as unknown as typeof fetch;
}

describe("GET / content negotiation", () => {
  const { app } = makeTestContext();

  test("Accept: application/json redirects to /ok", async () => {
    const response = await app.request("/", {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/ok");
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
    expect(await response.json()).toEqual({
      type: "not-found",
      message: "Not Found",
    });
  });

  test("unauthenticated GET /state returns 401 with a WWW-Authenticate challenge", async () => {
    const response = await app.request("/state");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    const body = (await response.json()) as { type: string };
    expect(body.type).toBe("authentication-required");
  });

  test("unauthenticated GET /events returns 401", async () => {
    const response = await app.request("/events");
    expect(response.status).toBe(401);
  });

  test("a disallowed Host is rejected through the full route chain", async () => {
    const cookie = await login(app);
    const response = await app.request("/state", {
      headers: { Cookie: cookie, Host: "evil.example.com" },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { type: string };
    expect(body.type).toBe("host-not-allowed");
  });

  test("oversized request bodies are rejected with 413 before any other handling", async () => {
    const response = await app.request("/cookie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(9 * 1024) }),
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as { type: string };
    expect(body.type).toBe("payload-too-large");
  });
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
    expect(await response.json()).toEqual({ ok: false });
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
  test("with no contact yet, /ok and /health are 503 and not ok", async () => {
    const { app } = makeTestContext();
    for (const probePath of ["/ok", "/health"]) {
      const response = await app.request(probePath);
      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean };
      expect(body.ok).toBe(false);
    }
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
    expect(response.headers.get("content-type")).toContain(
      "text/event-stream",
    );

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

describe("cookie flow (external fetch stubbed)", () => {
  test("PUT /cookie runs an update, persists, and flips /ok to healthy", async () => {
    const { app } = makeTestContext();
    const cookie = await login(app);
    stubExternalFetch(() => mamResponse());

    const putResponse = await app.request("/cookie", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ value: "mam-session-cookie" }),
    });
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

    const okResponse = await app.request("/ok");
    expect(okResponse.status).toBe(200);
    expect(await okResponse.json()).toEqual({ ok: true, reason: "ok" });

    // GET /state serves the same persisted contact.
    const stateResponse = await app.request("/state", {
      headers: { Cookie: cookie },
    });
    const state = (await stateResponse.json()) as {
      lastMamContact: unknown;
    };
    expect(state.lastMamContact).toEqual(putState.lastMamContact);
  });

  test("a throttled update (429) is persisted and surfaces via /ok", async () => {
    const { app } = makeTestContext();
    const cookie = await login(app);
    stubExternalFetch(() =>
      mamResponse({
        Success: false,
        msg: "Last change too recent",
        status: 429,
      }),
    );

    const putResponse = await app.request("/cookie", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ value: "mam-session-cookie" }),
    });
    expect(putResponse.status).toBe(200);
    const putState = (await putResponse.json()) as {
      hasCookie: boolean;
      lastMamContact: { ipUpdate: { success: boolean; httpStatus: number } };
    };
    expect(putState.hasCookie).toBe(true);
    expect(putState.lastMamContact.ipUpdate.success).toBe(false);
    expect(putState.lastMamContact.ipUpdate.httpStatus).toBe(429);

    const okResponse = await app.request("/ok");
    expect(okResponse.status).toBe(503);
    expect(await okResponse.json()).toEqual({
      ok: false,
      reason: "throttled",
    });
  });
});
