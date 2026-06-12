import { describe, expect, test } from "bun:test";

import type { AuthConfig } from "../src/backend/config.ts";

import { handlePostLogin } from "../src/backend/handlers/login.ts";

// The handler only needs `create` from the session store.
const sessions = { create: () => "test-session-id" };

const passwordAuthConfig: AuthConfig = {
  type: "configured",
  password: "s3cr3t",
};

function loginRequest(body: BodyInit): Request {
  return new Request("http://localhost/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("login handler", () => {
  test("correct password returns ok with the created session id", async () => {
    const result = await handlePostLogin(
      loginRequest(JSON.stringify({ password: "s3cr3t" })),
      passwordAuthConfig,
      sessions,
    );

    expect(result).toEqual({ ok: true, sessionId: "test-session-id" });
  });

  test("wrong password returns not-ok with 401 status", async () => {
    const result = await handlePostLogin(
      loginRequest(JSON.stringify({ password: "wrong" })),
      passwordAuthConfig,
      sessions,
    );

    expect(result).toEqual({ ok: false, status: 401 });
  });

  test("a body that isn't JSON returns 400", async () => {
    const result = await handlePostLogin(
      loginRequest("not json"),
      passwordAuthConfig,
      sessions,
    );

    expect(result).toEqual({ ok: false, status: 400 });
  });

  test("a JSON body without a password returns 400", async () => {
    const result = await handlePostLogin(
      loginRequest(JSON.stringify({ user: "tim" })),
      passwordAuthConfig,
      sessions,
    );

    expect(result).toEqual({ ok: false, status: 400 });
  });

  test("login is unavailable (500) when no password is configured", async () => {
    const tokenOnly: AuthConfig = { type: "configured", token: "api-token" };
    const none: AuthConfig = { type: "none", insecureAllowNoAuth: true };

    for (const authConfig of [tokenOnly, none]) {
      const result = await handlePostLogin(
        loginRequest(JSON.stringify({ password: "s3cr3t" })),
        authConfig,
        sessions,
      );
      // The message keeps the login form from defaulting to "Incorrect
      // password", which would lie to token-only/no-auth setups.
      expect(result).toEqual({
        ok: false,
        status: 500,
        message:
          "Browser login is unavailable: MOUSEHOLE_AUTH_PASSWORD is not set.",
      });
    }
  });
});
