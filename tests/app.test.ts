import { describe, expect, test } from "bun:test";

import type { SecurityConfig } from "../src/backend/http-boundary.ts";

import { createApp } from "../src/backend/app.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";

// Routes that hit the network (POST /checks, PUT /cookie happy path) are
// exercised only up to the boundary here.

const security: SecurityConfig = {
  allowedHosts: { type: "allowlist", hosts: ["localhost"] },
  allowedOrigins: { type: "same-origin" },
  auth: { type: "configured", password: "s3cr3t" },
};

const app = createApp(security);

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie);
  if (!match?.[1]) throw new Error(`No session cookie in: "${setCookie}"`);
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}

async function login(password: string): Promise<Response> {
  return app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("GET / content negotiation", () => {
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
    const response = await login("wrong");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
  });

  test("login sets a session cookie that authenticates GET /state; logout revokes it", async () => {
    const loginResponse = await login("s3cr3t");
    expect(loginResponse.status).toBe(200);
    const cookie = extractSessionCookie(loginResponse);

    const stateResponse = await app.request("/state", {
      headers: { Cookie: cookie },
    });
    expect(stateResponse.status).toBe(200);
    // hasAuth/hasCookie derive from the module-global config (not the injected
    // securityConfig), so only the shape is asserted here.
    const state = (await stateResponse.json()) as { hasCookie: boolean };
    expect(typeof state.hasCookie).toBe("boolean");

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
});

describe("public probes", () => {
  test("GET /ok maps body.ok onto the HTTP status", async () => {
    const response = await app.request("/ok");
    const body = (await response.json()) as { ok: boolean };
    expect(response.status).toBe(body.ok ? 200 : 503);
  });

  test("GET /health maps body.ok onto the HTTP status", async () => {
    const response = await app.request("/health");
    const body = (await response.json()) as { ok: boolean };
    expect(response.status).toBe(body.ok ? 200 : 503);
  });
});
