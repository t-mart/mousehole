import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseSetCookie } from "set-cookie-parser";

import { createApp, type WebMount } from "../src/backend/app.ts";
import { normalizeBasePath, webBaseFor } from "../src/backend/base-path.ts";
import { buildConfig } from "../src/backend/config.ts";
import { createAppContext } from "../src/backend/context.ts";
import { SESSION_COOKIE_NAME } from "../src/backend/session.ts";
import { WEB_BASE_URL_PLACEHOLDER } from "../src/shared/web-base-url.ts";
import {
  createInMemoryStateStore,
  rejectExternalFetch,
} from "./lib/helpers.ts";

type TestApp = ReturnType<typeof createApp>;

function makeApp(env: NodeJS.ProcessEnv, webMount?: WebMount): TestApp {
  const config = buildConfig({ MOUSEHOLE_AUTH_PASSWORD: "s3cr3t", ...env });
  const ctx = createAppContext(config, {
    fetchImpl: rejectExternalFetch,
    stateFile: createInMemoryStateStore(),
  });
  return createApp(ctx, webMount);
}

async function postLogin(
  app: TestApp,
  loginPath: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await app.request(loginPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ password: "s3cr3t" }),
  });
}

function sessionCookiePath(response: Response): string | undefined {
  return parseSetCookie(response.headers.getSetCookie()).find(
    (cookie) => cookie.name === SESSION_COOKIE_NAME,
  )?.path;
}

async function login(
  app: TestApp,
  loginPath: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await postLogin(app, loginPath, headers);
  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}`);
  }
  const cookie = parseSetCookie(response.headers.getSetCookie()).find(
    (candidate) => candidate.name === SESSION_COOKIE_NAME,
  );
  if (!cookie) throw new Error("login response missing session cookie");
  return `${SESSION_COOKIE_NAME}=${cookie.value}`;
}

describe("normalizeBasePath", () => {
  test.each<[string, string]>([
    ["", ""],
    ["/", ""],
    ["//", ""],
    ["mousehole", "/mousehole"],
    ["mousehole/", "/mousehole"],
    ["/mousehole", "/mousehole"],
    ["/mousehole/", "/mousehole"],
    ["/apps/mousehole", "/apps/mousehole"],
    ["  /mousehole/  ", "/mousehole"],
  ])("normalises %j to %j", (value, expected) => {
    expect(normalizeBasePath(value)).toBe(expected);
  });

  test.each([
    // would read as an authority, i.e. an off-site URL
    "//evil.example",
    "/a//b",
    // dot segments
    "/a/../b",
    "/a/./b",
    "/..",
    "/.",
    // whitespace, query, fragment, backslash, control characters
    "/a b",
    "/a\tb",
    "/a?b",
    "/a#b",
    String.raw`/a\b`,
    "/a\u0000b",
    // scheme-ish and characters a mount point never needs
    "https://evil.example",
    "http://evil.example/path",
    "a;b",
  ])("rejects %j", (value) => {
    expect(normalizeBasePath(value)).toBeUndefined();
  });
});

describe("webBaseFor", () => {
  test("is the root base when no prefix is configured", () => {
    expect(webBaseFor("")).toBe("/web/");
  });

  test("nests under the prefix", () => {
    expect(webBaseFor("/mousehole")).toBe("/mousehole/web/");
    expect(webBaseFor("/apps/mousehole")).toBe("/apps/mousehole/web/");
  });
});

describe("MOUSEHOLE_BASE_PATH=/mousehole mounts the whole app", () => {
  const app = makeApp({ MOUSEHOLE_BASE_PATH: "/mousehole" });

  test("serves the health endpoint under the prefix", async () => {
    const response = await app.request("/mousehole/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lastMamContactResult: "pending" });
  });

  test("serves nothing outside the prefix", async () => {
    for (const outsidePath of ["/health", "/state", "/events"]) {
      const response = await app.request(outsidePath);
      expect(response.status).toBe(404);
    }
  });

  test("redirects the prefix root, trailing slash or not", async () => {
    for (const rootPath of ["/mousehole", "/mousehole/"]) {
      const response = await app.request(rootPath);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/mousehole/web");
    }
  });

  test("sends a JSON client at the prefix root to the health endpoint", async () => {
    for (const rootPath of ["/mousehole", "/mousehole/"]) {
      const response = await app.request(rootPath, {
        headers: { Accept: "application/json" },
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/mousehole/health");
    }
  });

  test("the API is protected and reachable under the prefix", async () => {
    const unauthenticated = await app.request("/mousehole/state");
    expect(unauthenticated.status).toBe(401);

    const cookie = await login(app, "/mousehole/login");
    const authenticated = await app.request("/mousehole/state", {
      headers: { Cookie: cookie },
    });
    expect(authenticated.status).toBe(200);
  });

  test("the SSE stream opens under the prefix", async () => {
    const cookie = await login(app, "/mousehole/login");
    const response = await app.request("/mousehole/events", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });

  test("scopes the session cookie to the prefix", async () => {
    const response = await postLogin(app, "/mousehole/login");
    expect(sessionCookiePath(response)).toBe("/mousehole");
  });

  test("clears the cookie with the same prefix", async () => {
    const response = await app.request("/mousehole/logout", { method: "POST" });
    expect(sessionCookiePath(response)).toBe("/mousehole");
  });
});

describe("the Vite dev server mount under a prefix", () => {
  const app = makeApp(
    { MOUSEHOLE_BASE_PATH: "/mousehole" },
    { mode: "vite-dev-server-proxy", target: "http://vite.test" },
  );

  // Vite serves the UI from its own `/web/` base, so the mount prefix has to be
  // gone by the time the request reaches it.
  test("forwards the UI request with the mount prefix stripped", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("// bundle"));

    const response = await app.request("/mousehole/web/assets/app.js?v=1");
    expect(response.status).toBe(200);

    const [input] = fetchSpy.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(Request);
    expect((input as Request).url).toBe(
      "http://vite.test/web/assets/app.js?v=1",
    );
  });

  // Vite answers the slash-less /web with a redirect to /web/, an origin-root
  // URL this deployment does not serve, so the proxy asks for the directory
  // form on the caller's behalf.
  test("asks the dev server for the directory form of the slash-less /web", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response("// bundle")));

    for (const requestPath of ["/mousehole/web", "/mousehole/web/"]) {
      const response = await app.request(requestPath);
      expect(response.status).toBe(200);

      const [input] = fetchSpy.mock.calls.at(-1) ?? [];
      expect(input).toBeInstanceOf(Request);
      expect((input as Request).url).toBe("http://vite.test/web/");
    }
  });

  test("reports an unreachable dev server", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await app.request("/mousehole/web/");
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("http://vite.test");
  });
});

describe("static UI under a prefix", () => {
  let tmp: string;
  let app: ReturnType<typeof createApp>;
  const canary = "served-from-outside-the-dist-root";

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "mousehole-base-path-"));
    // The served root is a subdirectory, so a traversal attempt has a real file
    // to reach: `canary.json` sits one level above it and must never be served.
    const root = path.join(tmp, "dist");
    mkdirSync(path.join(root, "assets"), { recursive: true });
    writeFileSync(
      path.join(root, "index.html"),
      `<!doctype html><base href="${WEB_BASE_URL_PLACEHOLDER}" />`,
    );
    writeFileSync(path.join(root, "assets", "app.js"), "// bundle");
    writeFileSync(path.join(tmp, "canary.json"), canary);
    app = makeApp(
      { MOUSEHOLE_BASE_PATH: "/mousehole" },
      { mode: "serve-static", root },
    );
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("serves assets with the prefix stripped before the /web segment", async () => {
    const response = await app.request("/mousehole/web/assets/app.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("bundle");
  });

  // The shell routes are the only ones that answer the mount itself, so a
  // registration that missed the prefix would serve the document at the origin
  // root — announcing the mount's base from an off-mount URL.
  test("serves the shell only under the prefix", async () => {
    for (const outsidePath of ["/web", "/web/", "/web/index.html"]) {
      const response = await app.request(outsidePath);
      expect(response.status).toBe(404);
    }
  });

  test("does not serve a file at the same path outside the prefix", async () => {
    const response = await app.request("/web/assets/app.js");
    expect(response.status).toBe(404);
  });

  // The mount strips the prefix from the already-decoded path before serveStatic
  // resolves it, so what reaches `join(root, …)` decides whether it can read
  // outside the root. `%2f` survives `decodeURI` (reserved characters stay
  // encoded) and a literal `../` is normalised away by the URL parser before it
  // gets here, so what these rows pin is the outcome — nothing outside the root
  // is served — and the canary is the file that would leak if an encoded
  // separator ever became a real one.
  test.each([
    "/mousehole/web/..%2fcanary.json",
    "/mousehole/web/assets/..%2f..%2fcanary.json",
  ])(
    "does not serve a file outside the dist root through %s",
    async (requestPath) => {
      const response = await app.request(requestPath);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(canary);
    },
  );
});
