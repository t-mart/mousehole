import { describe, expect, test } from "bun:test";

import type { SecurityConfig } from "../src/backend/http-boundary.ts";

import { handlePostLogin } from "../src/backend/handlers/login.ts";
import { checkProtectedRequest } from "../src/backend/http-boundary.ts";
import {
  SESSION_COOKIE_NAME,
  createSessionStore,
} from "../src/backend/session.ts";
import { createSseRegistry } from "../src/backend/sse.ts";

const passwordConfig: SecurityConfig = {
  allowedHosts: { type: "allowlist", hosts: ["localhost"] },
  allowedOrigins: { type: "same-origin" },
  auth: { type: "configured", password: "s3cr3t" },
};

const tokenConfig: SecurityConfig = {
  allowedHosts: { type: "allowlist", hosts: ["localhost"] },
  allowedOrigins: { type: "same-origin" },
  auth: { type: "configured", token: "api-token" },
};

const bothConfig: SecurityConfig = {
  allowedHosts: { type: "allowlist", hosts: ["localhost"] },
  allowedOrigins: { type: "same-origin" },
  auth: { type: "configured", password: "s3cr3t", token: "api-token" },
};

// One store/registry pair for the whole file; sessions are keyed by random ids,
// so tests don't collide.
const sse = createSseRegistry();
const sessions = createSessionStore({
  durationSeconds: 60 * 60,
  httpsOnlyCookies: false,
  onSessionDeleted: (sessionId) => sse.closeSessionStreams(sessionId),
});
const boundaryDeps = { validateSession: sessions.validateRequest };

function makeRequest(pathName: string, init?: RequestInit): Request {
  return new Request(new URL(pathName, "http://localhost"), init);
}

function makeSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFakeController() {
  let closed = false;
  return {
    controller: {
      enqueue() {},
      close() {
        closed = true;
      },
    } as unknown as ReadableStreamDefaultController<string>,
    isClosed: () => closed,
  };
}

describe("protected HTTP boundary", () => {
  test("token auth accepts valid Bearer token", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Authorization: "Bearer api-token" },
      }),
      {},
      tokenConfig,
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("token auth rejects wrong Bearer token", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Authorization: "Bearer wrong-token" },
      }),
      {},
      tokenConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(401);
    expect(failure?.type).toBe("authentication-required");
  });

  test("Bearer token is ignored when no token is configured", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Authorization: "Bearer api-token" },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(401);
  });

  test("session cookie auth accepts a valid session", () => {
    const sessionId = sessions.create();
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(sessionId) },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("session cookie auth rejects an unknown session id", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie("not-a-real-session") },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(401);
    expect(failure?.type).toBe("authentication-required");
  });

  test("both credentials and token work independently when both are configured", () => {
    const sessionId = sessions.create();

    const viaSession = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(sessionId) },
      }),
      {},
      bothConfig,
      boundaryDeps,
    );
    const viaToken = checkProtectedRequest(
      makeRequest("/state", { headers: { Authorization: "Bearer api-token" } }),
      {},
      bothConfig,
      boundaryDeps,
    );

    expect(viaSession).toBeUndefined();
    expect(viaToken).toBeUndefined();
  });

  test("PUT /cookie and POST /checks reject unauthenticated requests", () => {
    for (const [method, pathName] of [
      ["PUT", "/cookie"],
      ["POST", "/checks"],
    ] as const) {
      const failure = checkProtectedRequest(
        makeRequest(pathName, {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        {
          requireJsonContentType: true,
          requireOrigin: true,
        },
        tokenConfig,
        boundaryDeps,
      );

      expect(failure?.status).toBe(401);
      expect(failure?.type).toBe("authentication-required");
    }
  });

  test("mutating routes reject a disallowed Origin", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        method: "PUT",
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
          Origin: "http://evil.example",
        },
        body: "{}",
      }),
      {
        requireJsonContentType: true,
        requireOrigin: true,
      },
      tokenConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
  });

  test("allowedHosts: all accepts requests with any Host header", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: {
          Authorization: "Bearer api-token",
          Host: "arbitrary.example.com",
        },
      }),
      {},
      {
        ...tokenConfig,
        allowedHosts: { type: "all" },
      },
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("allowedHosts: allowlist rejects a disallowed Host header", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: {
          Authorization: "Bearer api-token",
          Host: "evil.example.com",
        },
      }),
      {},
      tokenConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("host-not-allowed");
  });

  test("allowedOrigins: all accepts requests from any cross-origin", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        method: "PUT",
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
          Origin: "http://arbitrary.example.com",
        },
        body: "{}",
      }),
      {
        requireJsonContentType: true,
        requireOrigin: true,
      },
      {
        ...tokenConfig,
        allowedOrigins: { type: "all" },
      },
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("allowedOrigins: allowlist accepts a configured cross-origin", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        method: "PUT",
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
          Origin: "http://trusted.example.com",
        },
        body: "{}",
      }),
      {
        requireJsonContentType: true,
        requireOrigin: true,
      },
      {
        ...tokenConfig,
        allowedOrigins: {
          type: "allowlist",
          origins: ["http://trusted.example.com"],
        },
      },
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("allowedOrigins: allowlist still rejects unlisted origins", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        method: "PUT",
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "application/json",
          Origin: "http://evil.example.com",
        },
        body: "{}",
      }),
      {
        requireJsonContentType: true,
        requireOrigin: true,
      },
      {
        ...tokenConfig,
        allowedOrigins: {
          type: "allowlist",
          origins: ["http://trusted.example.com"],
        },
      },
      boundaryDeps,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
  });

  test("mutating routes reject text/plain content type", () => {
    const failure = checkProtectedRequest(
      makeRequest("/checks", {
        method: "POST",
        headers: {
          Authorization: "Bearer api-token",
          "Content-Type": "text/plain",
          Origin: "http://localhost",
        },
        body: "{}",
      }),
      {
        requireJsonContentType: true,
        requireOrigin: true,
      },
      tokenConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(415);
    expect(failure?.type).toBe("unsupported-media-type");
  });

  test("requireAuth: false allows unauthenticated requests through (login scenario)", () => {
    const failure = checkProtectedRequest(
      makeRequest("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: "{}",
      }),
      { requireAuth: false, requireOrigin: true, requireJsonContentType: true },
      passwordConfig,
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });

  test("requireAuth: false still enforces origin check — disallowed origin gets 403", () => {
    const failure = checkProtectedRequest(
      makeRequest("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://evil.example",
        },
        body: "{}",
      }),
      { requireAuth: false, requireOrigin: true, requireJsonContentType: true },
      passwordConfig,
      boundaryDeps,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
  });
});

const passwordAuthConfig = {
  type: "configured",
  password: "s3cr3t",
} as const;

function loginRequest(password: string): Request {
  return makeRequest("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("login handler", () => {
  test("correct password returns ok with a sessionId", async () => {
    const result = await handlePostLogin(
      loginRequest("s3cr3t"),
      passwordAuthConfig,
      sessions,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.sessionId).toBeTruthy();
  });

  test("wrong password returns not-ok with 401 status", async () => {
    const result = await handlePostLogin(
      loginRequest("wrong"),
      passwordAuthConfig,
      sessions,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(401);
  });

  test("session created by login is accepted by checkProtectedRequest", async () => {
    const result = await handlePostLogin(
      loginRequest("s3cr3t"),
      passwordAuthConfig,
      sessions,
    );
    if (!result.ok) throw new Error("Login should have succeeded");

    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(result.sessionId) },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );

    expect(failure).toBeUndefined();
  });
});

describe("session deletion", () => {
  test("deleting a session invalidates it", async () => {
    const loginResult = await handlePostLogin(
      loginRequest("s3cr3t"),
      passwordAuthConfig,
      sessions,
    );
    if (!loginResult.ok) throw new Error("Login should have succeeded");

    sessions.deleteSession(loginResult.sessionId);

    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(loginResult.sessionId) },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );
    expect(failure?.status).toBe(401);
  });

  test("deleting an unknown session is a no-op", () => {
    expect(() => sessions.deleteSession("not-a-real-session")).not.toThrow();
  });

  test("session expires without another protected request", async () => {
    const sessionId = sessions.create(5);

    await sleep(30);

    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(sessionId) },
      }),
      {},
      passwordConfig,
      boundaryDeps,
    );
    expect(failure?.status).toBe(401);
  });

  test("session expiry closes registered SSE streams", async () => {
    const sessionId = sessions.create(5);
    const fake = makeFakeController();

    sse.register({ sessionId, controller: fake.controller });

    await sleep(30);

    expect(fake.isClosed()).toBe(true);
  });

  test("manual deletion closes registered SSE streams", () => {
    const sessionId = sessions.create(50);
    const fake = makeFakeController();

    sse.register({ sessionId, controller: fake.controller });
    sessions.deleteSession(sessionId);

    expect(fake.isClosed()).toBe(true);
  });
});
