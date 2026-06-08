import { describe, expect, test } from "bun:test";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Temporal } from "temporal-polyfill";

import type { SecurityConfig } from "../src/backend/http-boundary.ts";
import type { HostInfo, State } from "../src/backend/types.ts";

import { handlePostLogin } from "../src/backend/handlers/login.ts";
import { makeStateResponseBody } from "../src/backend/handlers/state.ts";
import { checkProtectedRequest } from "../src/backend/http-boundary.ts";
import { serializePublicState, serializeState } from "../src/backend/serde.ts";
import {
  SESSION_COOKIE_NAME,
  createSession,
  deleteSession,
  registerSessionSocket,
} from "../src/backend/session.ts";
import { makeStateUpdateMessage } from "../src/backend/websocket.ts";

const requestAt = Temporal.ZonedDateTime.from(
  "2025-06-21T13:26:50.536+00:00[UTC]",
);
const updateAt = Temporal.ZonedDateTime.from(
  "2025-06-21T14:22:28.111+00:00[UTC]",
);
const nextCheckAt = Temporal.ZonedDateTime.from(
  "2025-06-21T14:27:28.113+00:00[UTC]",
);

const hostInfo: HostInfo = {
  ip: "123.123.123.123",
  asn: 12_345,
  as: "MegaCorp",
};

const state: State = {
  currentCookie: "secret-current-cookie",
  lastMam: {
    request: {
      cookie: "secret-request-cookie",
      at: requestAt,
    },
    response: {
      cookie: "secret-response-cookie",
      httpStatus: 200,
      body: {
        Success: true,
        msg: "No change",
        ip: "123.123.123.123",
        ASN: 12_345,
        AS: "MegaCorp",
      },
    },
  },
  lastUpdate: {
    at: updateAt,
    mamUpdated: true,
    mamUpdateReason: "force-update",
  },
};

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

function makeRequest(pathName: string, init?: RequestInit): Request {
  return new Request(new URL(pathName, "http://localhost"), init);
}

function makeSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFakeSocket() {
  const messages: string[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];

  return {
    socket: {
      send: (message: string) => messages.push(message),
      close: (code?: number, reason?: string) => closes.push({ code, reason }),
    } as unknown as Parameters<typeof registerSessionSocket>[1],
    messages,
    closes,
  };
}

describe("state serialization boundary", () => {
  test("internal serialization preserves cookie fields for state.json", () => {
    const serialized = serializeState(state);

    expect(serialized.currentCookie).toBe("secret-current-cookie");
    expect(serialized.lastMam?.request.cookie).toBe("secret-request-cookie");
    expect(serialized.lastMam?.response.cookie).toBe("secret-response-cookie");
  });

  test("public GET /state shape exposes only the cookie presence flag", () => {
    const body = makeStateResponseBody({
      hostInfo,
      nextCheckAt,
      state,
    });

    expect(body.hasCurrentCookie).toBe(true);
    expect("currentCookie" in body).toBe(false);
    expect("cookie" in body.lastMam!.request).toBe(false);
    expect("cookie" in body.lastMam!.response).toBe(false);
    expect(JSON.stringify(body)).not.toContain("secret-");
  });

  test("public serializer reports no configured cookie without state", () => {
    expect(serializePublicState().hasCurrentCookie).toBe(false);
  });

  test("WebSocket state-update payload does not include cookie fields", () => {
    const body = makeStateResponseBody({
      hostInfo,
      nextCheckAt,
      state,
    });
    const message = makeStateUpdateMessage(body);

    expect(message.type).toBe("state-update");
    expect(message.data.hasCurrentCookie).toBe(true);
    expect(JSON.stringify(message)).not.toContain("secret-");
    expect("cookie" in message.data.lastMam!.request).toBe(false);
    expect("cookie" in message.data.lastMam!.response).toBe(false);
  });
});

describe("protected HTTP boundary", () => {
  test("token auth accepts valid Bearer token", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Authorization: "Bearer api-token" },
      }),
      {},
      tokenConfig,
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
    );

    expect(failure?.status).toBe(401);
  });

  test("session cookie auth accepts a valid session", () => {
    const sessionId = createSession();
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: makeSessionCookie(sessionId) },
      }),
      {},
      passwordConfig,
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
    );

    expect(failure?.status).toBe(401);
    expect(failure?.type).toBe("authentication-required");
  });

  test("both credentials and token work independently when both are configured", () => {
    const sessionId = createSession();

    const viaSession = checkProtectedRequest(
      makeRequest("/state", { headers: { Cookie: makeSessionCookie(sessionId) } }),
      {},
      bothConfig,
    );
    const viaToken = checkProtectedRequest(
      makeRequest("/state", { headers: { Authorization: "Bearer api-token" } }),
      {},
      bothConfig,
    );

    expect(viaSession).toBeUndefined();
    expect(viaToken).toBeUndefined();
  });

  test("PUT /state and POST /update reject unauthenticated requests", () => {
    for (const [method, pathName] of [
      ["PUT", "/state"],
      ["POST", "/update"],
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
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
  });

  test("mutating routes reject text/plain content type", () => {
    const failure = checkProtectedRequest(
      makeRequest("/update", {
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
    );

    expect(failure?.status).toBe(415);
    expect(failure?.type).toBe("unsupported-media-type");
  });

  test("requireAuth: false allows unauthenticated requests through (login scenario)", () => {
    const failure = checkProtectedRequest(
      makeRequest("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: "{}",
      }),
      { requireAuth: false, requireOrigin: true, requireJsonContentType: true },
      passwordConfig,
    );

    expect(failure).toBeUndefined();
  });

  test("requireAuth: false still enforces origin check — disallowed origin gets 403", () => {
    const failure = checkProtectedRequest(
      makeRequest("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
        body: "{}",
      }),
      { requireAuth: false, requireOrigin: true, requireJsonContentType: true },
      passwordConfig,
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
    const result = await handlePostLogin(loginRequest("s3cr3t"), passwordAuthConfig);

    expect(result.ok).toBe(true);
    expect(result.ok && result.sessionId).toBeTruthy();
  });

  test("wrong password returns not-ok with 401 status", async () => {
    const result = await handlePostLogin(loginRequest("wrong"), passwordAuthConfig);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(401);
  });

  test("session created by login is accepted by checkProtectedRequest", async () => {
    const result = await handlePostLogin(loginRequest("s3cr3t"), passwordAuthConfig);
    if (!result.ok) throw new Error("Login should have succeeded");

    const failure = checkProtectedRequest(
      makeRequest("/state", { headers: { Cookie: makeSessionCookie(result.sessionId) } }),
      {},
      passwordConfig,
    );

    expect(failure).toBeUndefined();
  });
});

describe("session deletion", () => {
  test("deleting a session invalidates it", async () => {
    const loginResult = await handlePostLogin(loginRequest("s3cr3t"), passwordAuthConfig);
    if (!loginResult.ok) throw new Error("Login should have succeeded");

    deleteSession(loginResult.sessionId);

    const failure = checkProtectedRequest(
      makeRequest("/state", { headers: { Cookie: makeSessionCookie(loginResult.sessionId) } }),
      {},
      passwordConfig,
    );
    expect(failure?.status).toBe(401);
  });

  test("deleting an unknown session is a no-op", () => {
    expect(() => deleteSession("not-a-real-session")).not.toThrow();
  });

  test("session expires without another protected request", async () => {
    const sessionId = createSession(5);

    await sleep(30);

    const failure = checkProtectedRequest(
      makeRequest("/state", { headers: { Cookie: makeSessionCookie(sessionId) } }),
      {},
      passwordConfig,
    );
    expect(failure?.status).toBe(401);
  });

  test("session expiry closes registered WebSockets", async () => {
    const sessionId = createSession(5);
    const { socket, messages, closes } = makeFakeSocket();

    registerSessionSocket(sessionId, socket);

    await sleep(30);

    expect(messages).toEqual([JSON.stringify({ type: "session-expired" })]);
    expect(closes).toEqual([{ code: 1008, reason: "Session expired" }]);
  });

  test("manual deletion clears pending expiry timer", async () => {
    const sessionId = createSession(50);
    const { socket, messages, closes } = makeFakeSocket();

    registerSessionSocket(sessionId, socket);
    deleteSession(sessionId);
    await sleep(70);

    expect(messages).toEqual([JSON.stringify({ type: "session-expired" })]);
    expect(closes).toEqual([{ code: 1008, reason: "Session expired" }]);
  });
});
