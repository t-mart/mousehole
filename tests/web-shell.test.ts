import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp } from "../src/backend/app.ts";
import { buildConfig } from "../src/backend/config.ts";
import { createAppContext } from "../src/backend/context.ts";
import { WEB_BASE_URL_PLACEHOLDER } from "../src/shared/web-base-url.ts";
import viteConfig from "../vite.config.ts";
import {
  createInMemoryStateStore,
  rejectExternalFetch,
} from "./lib/helpers.ts";

type TestApp = ReturnType<typeof createApp>;

// An app serving a web UI out of a throwaway dist directory. The UI routes are
// unauthenticated, so the password is only there to make config resolvable.
function makeApp(root: string, env: NodeJS.ProcessEnv = {}): TestApp {
  const config = buildConfig({ MOUSEHOLE_AUTH_PASSWORD: "s3cr3t", ...env });
  const ctx = createAppContext(config, {
    fetchImpl: rejectExternalFetch,
    stateFile: createInMemoryStateStore(),
  });
  return createApp(ctx, { mode: "serve-static", root });
}

// The shell's behaviour must not depend on where the app is mounted, so every
// case runs against the origin root and against a configured prefix.
const mounts = [
  { name: "at the origin root", env: {}, basePath: "" },
  {
    name: "under MOUSEHOLE_BASE_PATH=/mousehole",
    env: { MOUSEHOLE_BASE_PATH: "/mousehole" },
    basePath: "/mousehole",
  },
];

// The `<base>` value a shell response was rendered with, if it has one.
async function baseHref(response: Response): Promise<string | undefined> {
  const html = await response.text();
  return /<base href="([^"]*)"/.exec(html)?.[1];
}

function writeFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "mousehole-web-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><base href="${WEB_BASE_URL_PLACEHOLDER}" />` +
      '<script type="module" src="./assets/app.js"></script>',
  );
  writeFileSync(path.join(root, "assets", "app.js"), "// bundle");
  return root;
}

describe.each(mounts)("web shell served $name", ({ env, basePath }) => {
  let root: string;
  let app: TestApp;
  const web = `${basePath}/web`;

  beforeAll(() => {
    root = writeFixture();
    app = makeApp(root, env);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // The document declares its own base, so every form the shell is served at —
  // with the trailing slash, without it, and the index file itself — resolves
  // its relative asset URLs and API calls to the same place.
  test("serves the shell, and its base, at every form of the mount", async () => {
    for (const pagePath of [web, `${web}/`, `${web}/index.html`]) {
      const response = await app.request(pagePath);
      expect(response.status).toBe(200);
      expect(await baseHref(response)).toBe(`${web}/`);
    }
  });

  test("serves the bundle's assets", async () => {
    const response = await app.request(`${web}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("bundle");
  });

  test("404s a path under the mount that is not a file", async () => {
    const response = await app.request(`${web}/settings/profile`, {
      headers: { accept: "text/html" },
    });
    expect(response.status).toBe(404);
    expect(await baseHref(response)).toBeUndefined();
  });

  test("404s a missing asset", async () => {
    const response = await app.request(`${web}/assets/missing.js`, {
      headers: { accept: "text/html" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(await baseHref(response)).toBeUndefined();
  });

  test("sends the mount root to the canonical UI URL", async () => {
    const response = await app.request(basePath || "/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${basePath}/web`);
  });
});

describe("the shell's base comes from the runtime, not the build", () => {
  // With no prefix configured, the served document must stay exactly what it
  // was before the prefix work: the cached source with `/web/` substituted.
  test("the root mount's shell is the document with /web/ filled in", async () => {
    const root = writeFixture();
    try {
      const app = makeApp(root);
      const response = await app.request("/web/");
      const html = readFileSync(path.join(root, "index.html"), "utf8");

      expect(await response.text()).toBe(
        html.replaceAll(WEB_BASE_URL_PLACEHOLDER, "/web/"),
      );
      // The base is prefix-dependent per request, so the shell must not be
      // cached under one prefix's URL for another.
      expect(response.headers.get("cache-control")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses to assemble an app whose shell lost the base marker", () => {
    const markerlessRoot = mkdtempSync(path.join(tmpdir(), "mousehole-web-"));
    writeFileSync(
      path.join(markerlessRoot, "index.html"),
      '<!doctype html><script type="module" src="./assets/app.js"></script>',
    );

    try {
      expect(() => makeApp(markerlessRoot)).toThrow(WEB_BASE_URL_PLACEHOLDER);
    } finally {
      rmSync(markerlessRoot, { recursive: true, force: true });
    }
  });

  test("ships the base URL placeholder in index.html", () => {
    const html = readFileSync(
      path.resolve(import.meta.dirname, "../src/frontend/index.html"),
      "utf8",
    );

    expect(html).toContain(`<base href="${WEB_BASE_URL_PLACEHOLDER}" />`);
  });

  test("builds with a relative base", () => {
    expect(resolveViteConfig("build", "production").base).toBe("./");
  });

  test("serves dev with the base the shell declares", () => {
    expect(resolveViteConfig("serve", "development").base).toBe("/web/");
  });

  // The backend does not serve the document in dev, so this plugin is the only
  // thing that fills the marker in there — and it must not run for the build,
  // which has to reach the server still carrying it.
  test("fills the placeholder where Vite serves the document in dev", () => {
    const plugins = (resolveViteConfig("serve", "development").plugins ??
      []) as unknown as HtmlTransformPlugin[];
    const plugin = plugins
      .flat()
      .find((candidate) => candidate.name === "mousehole-base-url-placeholder");
    expect(plugin?.apply).toBe("serve");

    const transform = plugin?.transformIndexHtml;
    const replacePlaceholder =
      typeof transform === "function" ? transform : transform?.handler;
    expect(typeof replacePlaceholder).toBe("function");

    expect(
      replacePlaceholder?.(`<base href="${WEB_BASE_URL_PLACEHOLDER}" />`),
    ).toBe('<base href="/web/" />');
  });
});

// `transformIndexHtml` is a hook union; the plugin in vite.config.ts uses the
// object form, whose handler ignores its context argument.
type HtmlReplacer = (html: string) => string | undefined;

type HtmlTransformPlugin = {
  name: string;
  apply?: string;
  transformIndexHtml?: HtmlReplacer | { order?: string; handler: HtmlReplacer };
};

// The exported config is either the object or a function of the command, and the
// build and serve arms set different bases, so each has to be reached on its own.
function resolveViteConfig(command: "build" | "serve", mode: string) {
  return typeof viteConfig === "function"
    ? viteConfig({ command, mode })
    : viteConfig;
}
