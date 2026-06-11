import { describe, expect, test } from "bun:test";

import type {
  BoundaryDeps,
  SecurityConfig,
} from "../src/backend/http-boundary.ts";

import { checkProtectedRequest } from "../src/backend/http-boundary.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";

// The boundary consults the session store only through this dep, so the matrix
// is tested against its verdict; real store behavior is covered by the
// app-level suite (app.test.ts) and session lifecycle tests.
const sessionAccepted: BoundaryDeps = { validateSession: () => true };
const sessionRejected: BoundaryDeps = { validateSession: () => false };

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

describe("authentication", () => {
  test("token auth accepts valid Bearer token", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Authorization: "Bearer api-token" },
      }),
      {},
      tokenConfig,
      sessionRejected,
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
      sessionRejected,
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
      sessionRejected,
    );

    expect(failure?.status).toBe(401);
  });

  test("a valid session passes (validateSession → true)", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=some-session` },
      }),
      {},
      passwordConfig,
      sessionAccepted,
    );

    expect(failure).toBeUndefined();
  });

  test("an unknown/expired session is rejected with 401 (validateSession → false)", () => {
    const failure = checkProtectedRequest(
      makeRequest("/state", {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=not-a-real-session` },
      }),
      {},
      passwordConfig,
      sessionRejected,
    );

    expect(failure?.status).toBe(401);
    expect(failure?.type).toBe("authentication-required");
  });

  test("session and token are independent paths when both are configured", () => {
    const viaSession = checkProtectedRequest(
      makeRequest("/state"),
      {},
      bothConfig,
      sessionAccepted,
    );
    const viaToken = checkProtectedRequest(
      makeRequest("/state", { headers: { Authorization: "Bearer api-token" } }),
      {},
      bothConfig,
      sessionRejected,
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
        sessionRejected,
      );

      expect(failure?.status).toBe(401);
      expect(failure?.type).toBe("authentication-required");
    }
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
      sessionRejected,
    );

    expect(failure).toBeUndefined();
  });
});

describe("host allowlist", () => {
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
      sessionRejected,
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
      sessionRejected,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("host-not-allowed");
  });
});

describe("origin checks", () => {
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
      sessionRejected,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
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
      sessionRejected,
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
      sessionRejected,
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
      sessionRejected,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
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
      sessionRejected,
    );

    expect(failure?.status).toBe(403);
    expect(failure?.type).toBe("origin-not-allowed");
  });
});

describe("content type", () => {
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
      sessionRejected,
    );

    expect(failure?.status).toBe(415);
    expect(failure?.type).toBe("unsupported-media-type");
  });
});
