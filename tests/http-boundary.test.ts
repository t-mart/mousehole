import type { MiddlewareHandler } from "hono";

import { Hono } from "hono";

import type { SessionAuthValidator } from "../src/backend/http-boundary.ts";

import {
  hostAllowed,
  originAllowed,
  requireAuth,
  requireJsonBody,
} from "../src/backend/http-boundary.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";

// The boundary consults the session store only through this function, so the
// suite is tested against its verdict; real store behavior is covered by the
// app-level suite (app.test.ts) and session lifecycle tests.
const sessionAccepted: SessionAuthValidator = () => true;
const sessionRejected: SessionAuthValidator = () => false;

const okBody = { ok: true } as const;

/**
 * Mounts the middlewares under test on a probe route. A 200 `{ ok: true }`
 * means every check passed and the handler ran; anything else is the response
 * of the first failing check.
 */
function probeApp(...middlewares: MiddlewareHandler[]) {
  const app = new Hono();
  app.use("/probe", ...middlewares);
  app.all("/probe", (c) => c.json(okBody));
  return app;
}

describe("hostAllowed", () => {
  const localhostOnly = hostAllowed({
    type: "allowlist",
    hosts: ["localhost"],
  });

  test("passes an allowlisted host through to the handler", async () => {
    const response = await probeApp(localhostOnly).request(
      "http://localhost/probe",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody);
  });

  test("rejects an unlisted host with 403", async () => {
    const response = await probeApp(localhostOnly).request(
      "http://evil.example.com/probe",
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "host-not-allowed",
      }),
    );
  });

  test("type: all accepts any host", async () => {
    const response = await probeApp(hostAllowed({ type: "all" })).request(
      "http://arbitrary.example.com/probe",
    );

    expect(response.status).toBe(200);
  });
});

describe("requireAuth", () => {
  const tokenAuth = requireAuth(
    { type: "configured", token: "api-token" },
    sessionRejected,
  );

  test("passes a valid Bearer token through to the handler", async () => {
    const response = await probeApp(tokenAuth).request(
      "http://localhost/probe",
      { headers: { Authorization: "Bearer api-token" } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody);
  });

  test("rejects a wrong Bearer token with 401 and a challenge", async () => {
    const response = await probeApp(tokenAuth).request(
      "http://localhost/probe",
      { headers: { Authorization: "Bearer wrong-token" } },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="Mousehole"',
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "authentication-required",
      }),
    );
  });

  test("ignores a Bearer token when no token is configured", async () => {
    const passwordOnly = requireAuth(
      { type: "configured", password: "s3cr3t" },
      sessionRejected,
    );

    const response = await probeApp(passwordOnly).request(
      "http://localhost/probe",
      { headers: { Authorization: "Bearer api-token" } },
    );

    expect(response.status).toBe(401);
  });

  test("passes a valid session through (validateSession → true)", async () => {
    const sessionAuth = requireAuth(
      { type: "configured", password: "s3cr3t" },
      sessionAccepted,
    );

    const response = await probeApp(sessionAuth).request(
      "http://localhost/probe",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=some-session` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody);
  });

  test("rejects an unknown/expired session with 401 (validateSession → false)", async () => {
    const sessionAuth = requireAuth(
      { type: "configured", password: "s3cr3t" },
      sessionRejected,
    );

    const response = await probeApp(sessionAuth).request(
      "http://localhost/probe",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=not-a-real-session` } },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "authentication-required",
      }),
    );
  });

  test("session and token are independent paths when both are configured", async () => {
    const authConfig = {
      type: "configured",
      password: "s3cr3t",
      token: "api-token",
    } as const;

    const viaSession = await probeApp(
      requireAuth(authConfig, sessionAccepted),
    ).request("http://localhost/probe");
    const viaToken = await probeApp(
      requireAuth(authConfig, sessionRejected),
    ).request("http://localhost/probe", {
      headers: { Authorization: "Bearer api-token" },
    });

    expect(viaSession.status).toBe(200);
    expect(viaToken.status).toBe(200);
  });

  test("responds 500 when auth is unconfigured without the insecure opt-out", async () => {
    const response = await probeApp(
      requireAuth(
        { type: "none", insecureAllowNoAuth: false },
        sessionRejected,
      ),
    ).request("http://localhost/probe");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "auth-not-configured",
      }),
    );
  });

  test("passes everything through under the explicit insecure opt-out", async () => {
    const response = await probeApp(
      requireAuth({ type: "none", insecureAllowNoAuth: true }, sessionRejected),
    ).request("http://localhost/probe");

    expect(response.status).toBe(200);
  });
});

describe("originAllowed", () => {
  const sameOrigin = originAllowed({ type: "same-origin" });

  test("passes a request without an Origin header", async () => {
    const localhostResponse = await probeApp(sameOrigin).request(
      "http://localhost/probe",
    );
    const oneTwoSevenResponse = await probeApp(sameOrigin).request(
      "http://127.0.0.1/probe",
    );
    const ipv6Response =
      await probeApp(sameOrigin).request("http://[::1]/probe");

    expect(localhostResponse.status).toBe(200);
    expect(oneTwoSevenResponse.status).toBe(200);
    expect(ipv6Response.status).toBe(200);
  });

  test("same-origin passes a matching Origin", async () => {
    const response = await probeApp(sameOrigin).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://localhost" } },
    );

    expect(response.status).toBe(200);
  });

  test("same-origin rejects a cross-origin request with 403", async () => {
    const response = await probeApp(sameOrigin).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://evil.example" } },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "origin-not-allowed",
      }),
    );
  });

  test("type: all accepts requests from any cross-origin", async () => {
    const response = await probeApp(originAllowed({ type: "all" })).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://arbitrary.example.com" } },
    );

    expect(response.status).toBe(200);
  });

  test("allowlist accepts a configured cross-origin", async () => {
    const allowlisted = originAllowed({
      type: "allowlist",
      origins: ["http://trusted.example.com"],
    });

    const response = await probeApp(allowlisted).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://trusted.example.com" } },
    );

    expect(response.status).toBe(200);
  });

  test("allowlist still rejects unlisted origins", async () => {
    const allowlisted = originAllowed({
      type: "allowlist",
      origins: ["http://trusted.example.com"],
    });

    const response = await probeApp(allowlisted).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://evil.example.com" } },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "origin-not-allowed",
      }),
    );
  });
});

describe("requireJsonBody", () => {
  test("passes application/json through to the handler", async () => {
    const response = await probeApp(requireJsonBody).request(
      "http://localhost/probe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(200);
  });

  test("passes application/json with a charset parameter", async () => {
    const response = await probeApp(requireJsonBody).request(
      "http://localhost/probe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: "{}",
      },
    );

    expect(response.status).toBe(200);
  });

  test("rejects text/plain with 415", async () => {
    const response = await probeApp(requireJsonBody).request(
      "http://localhost/probe",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      },
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "unsupported-media-type",
      }),
    );
  });

  test("rejects a missing Content-Type with 415", async () => {
    const response = await probeApp(requireJsonBody).request(
      "http://localhost/probe",
      { method: "POST" },
    );

    expect(response.status).toBe(415);
  });
});

describe("multi-middleware compositions", () => {
  const localhostOnly = hostAllowed({
    type: "allowlist",
    hosts: ["localhost"],
  });
  const tokenAuth = requireAuth(
    { type: "configured", token: "api-token" },
    sessionRejected,
  );
  const sameOrigin = originAllowed({ type: "same-origin" });

  test("checks respond in listed order: a host failure wins over auth", async () => {
    const response = await probeApp(localhostOnly, tokenAuth).request(
      "http://evil.example.com/probe",
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "host-not-allowed",
      }),
    );
  });

  test("a token-authenticated request bypasses the origin check", async () => {
    // A Bearer token is an explicit credential a cross-site page can't attach,
    // so there's no CSRF for the origin check to block.
    const response = await probeApp(tokenAuth, sameOrigin).request(
      "http://localhost/probe",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer api-token",
          Origin: "http://arbitrary.example",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody);
  });

  test("a session-authenticated request still has its origin enforced", async () => {
    const sessionAuth = requireAuth(
      { type: "configured", password: "s3cr3t", token: "api-token" },
      sessionAccepted,
    );

    const response = await probeApp(sessionAuth, sameOrigin).request(
      "http://localhost/probe",
      {
        method: "PUT",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=some-session`,
          Origin: "http://evil.example",
        },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "origin-not-allowed",
      }),
    );
  });

  test("a valid session with a garbage Bearer tag-along keeps origin enforced", async () => {
    // The auth ladder tries the session first; the ambient cookie did the
    // authorizing, so the CSRF check must stay even though a token was waved.
    const sessionAuth = requireAuth(
      { type: "configured", password: "s3cr3t", token: "api-token" },
      sessionAccepted,
    );

    const response = await probeApp(sessionAuth, sameOrigin).request(
      "http://localhost/probe",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer not-the-token",
          Cookie: `${SESSION_COOKIE_NAME}=some-session`,
          Origin: "http://evil.example",
        },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "origin-not-allowed",
      }),
    );
  });

  test("the insecure no-auth opt-out keeps origin enforced", async () => {
    // Without credentials the "ambient credential" is network position itself;
    // a cross-site page must not get to drive a credential-less Mousehole.
    // Bit of a gray area? In lieu of a firm answer, err on the side of caution.
    const optOut = requireAuth(
      { type: "none", insecureAllowNoAuth: true },
      sessionRejected,
    );

    const response = await probeApp(optOut, sameOrigin).request(
      "http://localhost/probe",
      { method: "PUT", headers: { Origin: "http://evil.example" } },
    );

    expect(response.status).toBe(403);
  });

  test("a login-shaped stack (no auth) passes unauthenticated requests", async () => {
    const response = await probeApp(
      localhostOnly,
      sameOrigin,
      requireJsonBody,
    ).request("http://localhost/probe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody);
  });

  test("a login-shaped stack still enforces its other checks", async () => {
    const response = await probeApp(
      localhostOnly,
      sameOrigin,
      requireJsonBody,
    ).request("http://localhost/probe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.example",
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        type: "origin-not-allowed",
      }),
    );
  });
});
