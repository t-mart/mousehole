# Migration: off Bun → Vite (frontend) + Hono (backend)

Status: **exploratory** · Separate initiative from the SSE/state redesign — do not
interleave; this lands on its own branch after that one ships.

Goal: leave Bun entirely. Vite owns the frontend (build + dev HMR). Hono owns the
backend (API + SSE + static serving), running on a **standards-based runtime —
Deno preferred, Node as the fallback**. Hono serves the *built* frontend assets; no
SSR.

---

## 1. Motivation

Two threads converge here.

**The API layer is a hand-rolled mess.** Routing, auth, host/origin checks,
content-type gating, body limits, and logging are stitched together imperatively
through `guardProtectedRequest` → `makeProtectedJSONResponse` → `makeJSONResponse`,
with per-failure logging scattered inside `checkProtectedRequest` (which even has a
`// logging is a middleware job` TODO). These are textbook cross-cutting concerns —
exactly what a middleware framework expresses declaratively.

**Bun-isms cost us, with no upside for this app:**
- **Exhibit A:** the Bun CSS bundler has no maintained Tailwind v4 plugin, so we
  hand-wrote `bun-plugins/tailwind-plugin.ts` against `@tailwindcss/node` + `oxide`.
- **Exhibit B:** Bun's backend `--hot` HMR doesn't run teardown hooks reliably, so
  `contact.ts` carries a `__contactGeneration` global-counter hack to stop stale
  timers from surviving a reload.
- **Exhibit C:** `server.stop(true)` frequently fails to shut down promptly, so the
  shutdown path can't even `await` it.
- Plus the SSE idle-timeout knob (`server.timeout(req, 0)`) — a Bun-specific
  workaround for Bun closing quiet streams at 10s.

None of these buy us anything a portable, standards-based stack wouldn't.

## 2. Bun surface area (what we replace)

| Bun API / feature | Where | Replacement |
|---|---|---|
| `Bun.serve` + `routes` | `index.tsx` | Hono app + `Deno.serve(app.fetch)` / `@hono/node-server` |
| `server.timeout(req, 0)` (SSE idle) | `index.tsx` | gone — Node/Deno don't idle-close streams |
| `maxRequestBodySize` | `index.tsx` | `bodyLimit()` middleware |
| `import index from "*.html"` (bundler) | `index.tsx` | Vite build → `dist/`, Hono `serveStatic` |
| `--hot` HMR + `import.meta.hot` | `index.tsx`, `root.tsx`, `contact.ts` | Vite HMR (frontend); restart-watcher (backend) |
| `Bun.file` / `Bun.write` | `store.ts` | `Deno.readTextFile`/`writeTextFile`/`rename` (or `node:fs`) |
| `CookieMap` / `Bun.Cookie` | `session.ts`, `mam.ts` | `hono/cookie` helpers (`getCookie`/`setCookie`) |
| `bun:test` | 5 files in `tests/` | `deno test` (or vitest on Node) |
| `bun-plugin-tailwind` (hand-rolled) | `bun-plugins/` | `@tailwindcss/vite` (official, maintained) |
| `bunfig.toml`, `bun.lock` | root | `deno.json` + import map (or `package.json` + lock) |
| `package.json` `"imports"` (`#backend` etc.) | root | Deno import map (or keep tsconfig paths) |

## 3. Target architecture

Hono serves built assets, not SSR. The frontend build and the backend runtime are
**independent** — they only meet over HTTP.

### Dev — two processes, Vite proxies the API

```
browser ─▶ Vite dev server (5173)        # HMR, bundling, Tailwind
              │ /api/* , /web/events
              └─proxy─▶ Hono backend (5010)   # API + SSE
```

`vite.config.ts` (sketch):

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"; // official v4 plugin — kills Exhibit A

export default {
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:5010", "/web/events": "http://localhost:5010" } },
};
```

Worth restructuring the API under a single `/api/*` prefix in the same pass so the
proxy (and the prod mount) is one rule. SSE proxies fine — it's just a long HTTP
response, and Vite streams it.

### Prod — one process, Hono serves `dist/` + the API

```ts
const app = new Hono();
app.route("/api", api);                                    // JSON API + SSE
app.use("/*", serveStatic({ root: "./dist" }));            // built assets
app.get("*", serveStatic({ path: "./dist/index.html" }));  // SPA fallback
```

`vite build` emits `dist/`; the server `serveStatic`s it. No HTML-import magic.

## 4. Runtime: Deno (preferred) vs Node

Because handlers only touch Hono's `c` (Context), the runtime is a **one-file
adapter swap**. We are leaving Bun; the choice is Deno or Node.

**Deno — the scorched-earth pick.** Standards-first (Web APIs), native TypeScript
(no build step to *run*), built-in test/lint/fmt, first-class Hono support
(`Deno.serve(app.fetch)`, `hono/deno` for `serveStatic` + `getConnInfo`), npm deps
via `npm:` specifiers (Deno 2). Clean process lifecycle. This is the most
anti-Bun-proprietary option and the one to explore first.

**Node (`@hono/node-server`) — the conservative fallback.** Most boring/portable;
real `http.Server` with a deterministic `.close(cb)` (directly fixes Exhibit C);
needs `tsx`/build to run TS. Pick this if Deno's edges (below) bite.

**Key de-risking point:** the frontend toolchain (Vite) does **not** have to run on
the same runtime as the backend. Build the frontend with Vite-on-Node (mature) and
run the *backend* on Deno — `dist/` is just static files Deno serves. So "explore
Deno" is scoped to the backend runtime; we don't gate it on Vite-under-Deno.

Open Deno questions to spike: running Vite under Deno (if we want a single runtime),
`npm:` compat for our deps (Hono, zod, temporal-polyfill, negotiator), and the
test-runner story.

## 5. The middleware win (API layer)

The guard chain collapses into declarative middleware on a protected route group,
and handlers return `c.json(...)` directly:

| Today | Hono |
|---|---|
| `makeJSONResponse` / `makeProtectedJSONResponse` / `JSONResponseArgs` | `c.json(body, status)` — delete all three |
| `checkOrigin` | `csrf()` (built-in: Origin + Sec-Fetch-Site) |
| `checkJsonContentType` + `parseRequestJson` + `safeParse` + `SchemaError` | `zValidator("json", schema)` → typed `c.req.valid("json")` |
| `maxRequestBodySize` | `bodyLimit()` |
| scattered failure logging | `logger()` + each check logging inside its own middleware |
| `checkAuthentication` (session/token) | one custom auth middleware on the protected group |
| `checkHost` (Host allowlist) | one small custom middleware (no built-in; `ipRestriction` is IP-based) |
| Bun `error()` / `fetch()` | `app.onError()` / `app.notFound()` |
| `Negotiator` on `/` | `accepts` helper |
| SSE `ReadableStream` + `server.timeout` | `streamSSE(c, …)` |

Net: `http-boundary.ts` shrinks to a few middleware; `index.tsx`'s response
plumbing disappears; logging lands in exactly one place.

## 6. How each exhibit dies

- **A (Tailwind):** delete `bun-plugins/`; use `@tailwindcss/vite` (first-party v4).
- **B (backend HMR hack):** no in-process hot reload — run the backend dev process
  with a **restart** watcher (`deno run --watch`, `node --watch`, or `tsx watch`).
  Fresh process per change ⇒ no stale timers ⇒ delete `__contactGeneration` and the
  `__is_stale_contact_task_from_hmr` guard entirely. Vite owns frontend HMR.
- **C (`server.stop`):** on Deno/Node the server has a real, awaitable shutdown;
  graceful stop becomes deterministic (stop accepting → clear the contact timer →
  drain the mutex → close → exit). No "don't await it" hack.
- **SSE idle-timeout:** Node/Deno don't idle-close an open streaming response, so
  `server.timeout(req, 0)` is removed.

## 7. Migration stages (rough)

1. **Frontend on Vite.** Add Vite + `@vitejs/plugin-react` + `@tailwindcss/vite`;
   move `index.html`; get dev HMR + `vite build` green; delete `bun-plugins/`.
2. **Backend to Hono.** Introduce the Hono app; port routes to middleware +
   `c`-based handlers; replace the guard chain, `makeJSONResponse`, and logging;
   swap SSE to `streamSSE`. (Still on a temporary adapter.)
3. **Runtime swap to Deno (or Node).** `Deno.serve(app.fetch)` + `hono/deno`
   `serveStatic`; replace Bun file I/O (`store.ts`), cookies (`session.ts`,
   `mam.ts`), and env access; wire the dev proxy and prod static mount.
4. **Tooling.** `bun:test` → `deno test` (or vitest); `deno.json` + import map;
   Docker (deno base image + a `vite build` stage).
5. **Scorched earth.** Delete `bunfig.toml`, `bun.lock`, `bun-plugins/`, the HMR
   generation hack, `server.timeout`, and the `server.stop` workaround.

## 8. Risks / open questions

- **Vite under Deno** is newer territory; mitigated by building the frontend on Node
  and only running the backend on Deno (§4).
- **Cookies through the dev proxy:** browser talks to Vite's origin; the proxy
  forwards `Set-Cookie`. The `httpOnly`, `sameSite=lax` session cookie should work as
  long as it isn't `Domain`-locked — verify once.
- **Test runner swap** touches all 5 `tests/*` files (`bun:test` imports).
- **Docker** becomes a two-stage build (frontend `vite build`, then the runtime
  image serving `dist/`).
- **`npm:`/JSR dependency compat** on Deno for Hono, zod, temporal-polyfill,
  negotiator — spike before committing.