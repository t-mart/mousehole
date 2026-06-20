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

function callLogin(
  body: Record<string, unknown> | string,
  authConfig: AuthConfig = passwordAuthConfig,
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return handlePostLogin(loginRequest(raw), authConfig, sessions);
}

describe("login handler", () => {
  test("correct password returns ok with the created session id", async () => {
    const result = await callLogin({ password: "s3cr3t" });

    expect(result).toEqual(
      expect.objectContaining({ ok: true, sessionId: "test-session-id" }),
    );
  });

  // Every failure surfaces as { ok: false } with a status the login form maps
  // to a message. The 500s matter most: with no password configured the form
  // must not fall back to "Incorrect password", which would lie to
  // token-only/no-auth setups.
  test.each<{
    name: string;
    body: Record<string, unknown> | string;
    authConfig?: AuthConfig;
    status: number;
  }>([
    {
      name: "wrong password returns not-ok with 401",
      body: { password: "wrong" },
      status: 401,
    },
    {
      name: "a body that isn't JSON returns 400",
      body: "not json",
      status: 400,
    },
    {
      name: "a JSON body without a password returns 400",
      body: { foo: "bar" },
      status: 400,
    },
    {
      name: "token-only auth makes login unavailable (500)",
      body: { password: "s3cr3t" },
      authConfig: { type: "configured", token: "api-token" },
      status: 500,
    },
    {
      name: "no-auth makes login unavailable (500)",
      body: { password: "s3cr3t" },
      authConfig: { type: "none", insecureAllowNoAuth: true },
      status: 500,
    },
  ])("$name", async ({ body, authConfig, status }) => {
    const result = await callLogin(body, authConfig);
    expect(result).toEqual(expect.objectContaining({ ok: false, status }));
  });
});
