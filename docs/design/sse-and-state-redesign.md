# Redesign: SSE, "always update", flattened state, and a coherent error model

Status: **planning** · Branch: `always-update`

This document is the working plan for a multi-part redesign. It is staged so
each stage is a reviewable checkpoint commit. The test suite is expected to be
red through the middle stages; it goes green again in the final stage.

---

## 1. Motivation

Four entangled problems, discovered while reviewing the WebSocket layer:

1. **WebSockets are heavyweight for what we need.** The only real value is
   pushing "something changed" to open dashboards so they don't poll. But the WS
   message duplicates the `GET /state` body (constructed in three places:
   `makeStateResponseBody`, an inline copy in `check.ts`, and the WS schema),
   and the client hook multiplexes four message types, a heartbeat, reconnect,
   and manual listener cleanup into ~116 lines with two cache-writers feeding
   one query key.

2. **`isOnline` is dead.** It is a global mutable boolean set as a side effect
   of `fetchExternal`, then read into the `/state` body. But every read site
   forces it back to `true` first: `GET /state` calls `getHostInfo()` (→
   `setIsOnline(true)`) before reading it, and the background-check push only
   happens when the check succeeded (which also set it true). It can essentially
   never deliver `false`.

3. **The check pipeline gates needlessly.** Today: `getHostInfo` (probe) →
   `getUpdateReason` (compare to last) → _maybe_ `updateMamIp`. Per the MAM
   docs, `dynamicSeedbox.php` returns a strict superset of `jsonIp.php`
   (`{Success, msg, ip, ASN, AS}` vs `{ip, ASN, AS}`), always includes IP/ASN
   even on 429/403, and only 429s on a genuine too-recent change. So the probe +
   gate buy nothing and add a failure mode and a two-endpoint IP race.

4. **Errors are surfaced three uncoordinated ways.** A network failure during
   `GET /state` → full-page Retry (dashboard vanishes); during `POST /update` →
   a toast; during a background check → a WS error toast. Same condition, three
   UIs, and the rich typed errors from the backend are discarded except
   `.message`.

5. **Types should live near the code that uses them.** `src/backend/types.ts` is
   a dumping ground for types. We should collocate types with the code that uses
   them, and export only the ones that need to be shared.

6. **Use JSDoc for exported functions, types and variables.** This makes it
   easier to understand the code and its usage, and also helps with IDE
   autocompletion.

## 2. Principles

- **One source of truth.** `GET /state` is the only data the frontend trusts.
  The SSE channel only signals "re-pull"; it carries no state.
- **`GET /state` is a pure read.** It never touches the network. A MAM outage
  can never fail it.
- **Make illegal states unrepresentable.** Model a check outcome as a
  reachability-tagged union; IP/ASN exist iff we reached MAM.
- **Separate transport failure from domain failure.** "Your click couldn't be
  delivered" (action error → transient toast) is a different thing from "the
  last check couldn't reach MAM / MAM rejected us" (condition → a status
  _section_).
- **Isolate the secret.** The cookie is the only credential; keep it at the top
  level of state so the public projection is "everything except `cookie`."
- **Pure functions, immutability, early returns** (house style). Kill the global
  mutable `isOnline`.

## 3. Target architecture

### 3.1 Persisted state (file) — credential included

```ts
const STATE_VERSION = 2; // lives on the *serialized* form only (a persistence detail)

type State = {
  cookie?: string; // mam_id; set by the user, rotated by checks
  lastMamContact?: MamContact; // the last contact with MAM; absent until the first check runs
};

// Nested, not a flat 3-way: reachability gates the host fields, and within a
// reached contact a configured (cookied) check additionally carries the
// IP-update result. The setup phase is simply "reached, no `ipUpdate` yet" — it
// needs no name of its own, which is why there is no "lookup" variant.
type MamContact = { at: Temporal.ZonedDateTime } & (
  | { reached: false; error: { type: string; message: string } } // transport failure; no response at all
  | {
      reached: true; // got an HTTP response from MAM (200 | 429 | 403)
      ip: string;
      asn: number;
      as: string;
      ipUpdate?: {
        // present only when a cookie drove a dynamicSeedbox update
        success: boolean; // MAM Success
        msg: string; // MAM msg, verbatim — DISPLAY ONLY, never branch on it
        httpStatus: number; // 200 | 429 | 403 — drives logic
      };
    }
);
```

zod: `z.discriminatedUnion("reached", [...])` with `at` on a shared base.

Gone vs. today: `lastMam.request` echo, nested `response`, separate
`lastUpdate`, `currentCookie` buried in a blob. The only secret is top-level
`cookie` (v2 renames the credential `currentCookie` → `cookie`).

**In-memory vs. on disk.** `State`/`MamContact` above are the in-memory _domain_
types and hold `Temporal.ZonedDateTime`. The on-disk form (`SerializedState`/
`SerializedMamContact`) is the same shape with `at` as an RFC 9557 string — the
format `ZonedDateTime.prototype.toString()` emits and
`Temporal.ZonedDateTime.from` round-trips losslessly (e.g.
`2025-06-21T14:27:28.113-05:00[America/Chicago]`). This
domain-model-vs-serialization split already exists in the codebase (`State` ↔
`SerializedState` via `serializeState`/`deserializeState`) and is the standard
way to keep rich types at the core while the wire/disk format stays a stable
primitive.

### 3.2 Consumer state (network) — credential omitted

```ts
type PublicState = {
  hasCookie: boolean; // replaces `cookie`
  hasAuth: boolean; // server-derived
  nextCheckAt?: string; // server-derived (in-memory timer), RFC 9557
  lastMamContact?: SerializedMamContact; // identical to the on-disk MamContact — no secrets to strip
};
```

There is no separate `PublicMamContact`: `MamContact` carries no secret, so its
serialized (string-`at`) form is reused verbatim on the wire. Public and
serialized only diverge at the _top_ level of `State`, where `cookie` becomes
`hasCookie` and the computed view fields (`hasAuth`, `nextCheckAt`) are added.
Sanitization is "don't include `cookie`," nothing more.

### 3.3 State versioning + migration

- Every written file carries `"version": 2`.
- On read, peek at `version`. If it equals the current version, parse strictly.
  Otherwise treat it as legacy and **preserve only the cookie** —
  `lastMamContact` is disposable (the next scheduled check regenerates it within
  one interval).

```ts
// the ONE function future migrations extend. It only ever sees *legacy*
// (pre-/non-current) shapes — the current version is parsed strictly by schema, not
// routed here. Today the sole legacy location is `currentCookie` (v2 renamed it to
// `cookie`). When a future version stops being current, append its field name here.
function findCookie(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const o = json as Record<string, unknown>;
  for (const key of ["currentCookie"]) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function migrateToCurrent(json: unknown): SerializedState {
  if (isCurrentVersion(json)) return serializedStateSchema.parse(json);
  return { version: STATE_VERSION, cookie: findCookie(json) };
}
```

This realizes the rule: _"even at v3/4/5, migration is just: find the cookie,
apply it to the new form."_

### 3.4 Check logic — "always update"

A check is one network call, branched only on configuration:

| cookie? | call                 | gives                                                     |
| ------- | -------------------- | --------------------------------------------------------- |
| present | `dynamicSeedbox.php` | IP/ASN/AS **and** commits any change                      |
| absent  | `jsonIp.php`         | IP/ASN/AS only (so an un-set-up user still sees their IP) |

Both write a `lastMamContact`. The no-cookie branch yields a `reached: true`
contact with no `ipUpdate`; the cookie branch adds the `ipUpdate` result.
Deleted: `getUpdateReason`, `responseIsStale` /
`MOUSEHOLE_STALE_RESPONSE_SECONDS`, the `UpdateReason` enum gating, `force`,
`isOnline` + `connectivity.ts`. `fetch.ts` keeps mapping low-level failures to
`NetworkError` / `TimeoutError` but no longer mutates a global.

A shared pure classifier interprets a reached contact's `ipUpdate` so frontend
and scheduler agree (the no-`ipUpdate` setup case is handled by `hasCookie`):

```ts
type CheckClass =
  | "updated"
  | "no-change"
  | "throttled"
  | "rejected"
  | "unreachable";
// ipUpdate 200 Completed → updated; 200 No change → no-change; 429 → throttled;
// 403 → rejected; reached:false → unreachable
```

**429 handling:** the docs say a 429 update is _quashed_ (not applied), so the
new IP is still pending. No special scheduler needed — the normal interval
re-sends the same IP each cycle until MAM returns 200 Completed. Surface it as
"change pending (throttled)" (warn), not an error.

**Cookie rotation:** if MAM returns a new `mam_id` via `Set-Cookie`, persist it
into `cookie`. (So `cookie` is written by both the user and by checks.)

### 3.5 HTTP surface

| Today                                                                      | New                                            | Notes                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /state` (hits network)                                                | `GET /state` (pure read)                       | returns `PublicState`; never 500s on a MAM blip                                                                                                                                                                                           |
| `PUT /state {currentCookie}`                                               | `PUT /cookie {value}`                          | credential is its own write-only sub-resource; setting it kicks an immediate check, then signals SSE                                                                                                                                      |
| `POST /update {force}`                                                     | `POST /checks`                                 | "create a check"; no `force`; **synchronously** runs a check, persists, signals SSE, returns the full `PublicState`                                                                                                                       |
| `GET /ok`, `GET /health` (probe network, use `isOnline`/`getUpdateReason`) | same paths, **pure reads of `lastMamContact`** | `ok = lastMamContact?.reached && lastMamContact.ipUpdate?.success && lastMamContact.ipUpdate.httpStatus === 200`; `isOnline` → `reached`; `neededUpdateReason` → the classifier value. Bonus: the Docker healthcheck stops hammering MAM. |
| `GET /web/ws` (WebSocket)                                                  | `GET /web/events` (SSE)                        | signal-only                                                                                                                                                                                                                               |

**Commands are synchronous.** `POST /checks` and `PUT /cookie` both perform the
check within the request (network → state write → SSE signal) and return the
resulting full `PublicState`. `PUT /cookie` is `writeCookie()` → the same
`runCheck()` that `POST /checks` uses → `toPublicState()`, so both commands
share one code path and one serializer, and `checkMutex` serializes them against
the background check. The acting tab applies the response immediately for
instant feedback; the SSE-driven refetch then returns a deep-equal
`PublicState`, which React Query's structural sharing makes a guaranteed no-op
(no flash, no correlation id needed). Synchronous `PUT /cookie` is what gives
the setup flow an immediate cookie-valid (`200`) / cookie-invalid (`403`)
verdict.

### 3.6 SSE transport

- New `GET /web/events` returns a `text/event-stream`. A module-level
  `Set<controller>` registry replaces `setWebSocketPublisher`; `notifyClients()`
  enqueues a contentless `data: changed\n\n` to all. A periodic
  `: keepalive\n\n` comment defeats proxy idle-timeouts.
- Auth: ordinary GET through `guardProtectedRequest`; `EventSource` sends the
  session cookie automatically (no custom-header limitation matters).
- **Session expiry collapses into the signal.** On logout/session delete, close
  that session's streams (keep the per-session registry, now of controllers
  instead of sockets); the client repulls, gets 401, and `App` shows
  `<LoginForm>`. The dedicated `session-expired` message and the WS
  `error`/`state-update` messages are deleted.
- Reconnect + heartbeat become browser built-ins; the client hook loses its four
  refs, the 3s reconnect loop, the ping/pong, and the manual listener cleanup.

### 3.7 Frontend error model

Two surfaces, split by nature:

- **Action errors → toasts** (`error-context`, kept _only_ for these): the
  user's request couldn't be delivered/accepted — login (bad password/401),
  logout, `POST /checks` transport failure, `PUT /cookie` (e.g. 400 malformed).
  Tied to a mutation's `onError`.
- **Condition errors → the status section** (`MamResponse`, the hallmark style):
  derived from `data.lastMamContact`. Persistent, auto-clears when the next
  check succeeds, not dismissable.

`MamResponse` becomes "current sync health + last host info":

- status line from `lastMamContact`: `reached && ipUpdate?.success` → green
  (`msg`); `reached && ipUpdate && !success` → red with **MAM's** `msg` (429 →
  warn); `reached && !ipUpdate` → setup state ("No cookie set", but the IP is
  shown); `reached: false` → red with **our** `error.message`.
- IP/AS rows render **only when `reached`** (no cache; an offline user isn't
  helped by a stale IP). `hasCookie === false` → "No cookie set"; no
  `lastMamContact` yet → "Pending check".

Removed from the frontend: the `isOnline` effect, the WS error toast, the "Lost
connection" toast (connection health becomes a quiet inline indicator from
`EventSource.readyState`).

---

## 4. Staged implementation

Each stage is one checkpoint commit. Stages 1–2 land together to keep the
backend compiling (the `State` type ripples through every consumer, and the
frontend imports backend types). Tests are fixed in Stage 6.

### Stage 1 — Persisted state v2 + migration (foundation)

- `types.ts`: new `State`/`MamContact` (in-memory, Temporal),
  `SerializedState`/`SerializedMamContact` (disk, RFC 9557 strings,
  `version: 2`), `PublicState` (wire; embeds `SerializedMamContact`), classifier
  type. Remove `UpdateReason` gating types, `isOnline` from response types.
- `serde.ts`: serialize/deserialize v2; `toPublicState` sanitizer.
- `migrate.ts` (new): `findCookie`, `migrateToCurrent`, `STATE_VERSION`.
- `store.ts`: `read` runs `migrateToCurrent` before deserializing; `write`
  stamps `version`.
- **One new test now** (`tests/migrate.test.ts`): legacy `{currentCookie}` → v2,
  v2 round-trips, junk → no cookie. (Pure + high-value; the rest of the suite
  waits.)

### Stage 2 — Check/update logic ("always update")

- Rewrite `check.ts`: `performCheck` = `cookie ? updateMamIp : getHostInfo`,
  build `lastMamContact` (reached + optional `ipUpdate`, or unreachable),
  persist, handle cookie rotation. Remove `getUpdateReason`, `responseIsStale`,
  `force`, stale config use.
- Delete `connectivity.ts`; `fetch.ts` stops calling `setIsOnline`.
- Add `classify(lastMamContact)` shared helper.
- Scheduler unchanged except it no longer threads `force`/reason.
- End state: backend compiles and runs on the new model (old endpoints/SSE
  next).

### Stage 3 — HTTP surface

- `GET /state` → pure read returning `PublicState`.
- `PUT /cookie` replaces `PUT /state`: store cookie → run check → respond.
- `POST /checks` replaces `POST /update`: synchronously run check → respond full
  `PublicState`.
- Redefine `GET /ok` and `GET /health` as pure reads of `lastMamContact` (drop
  network probe, `getUpdateReason`, `isOnline`).
- Update `index.tsx` routes + endpoint-path constants.

### Stage 4 — SSE transport (backend)

- New `GET /web/events` + controller registry replacing `websocket.ts` /
  `setWebSocketPublisher`. `notifyClients()` signal + keepalive comment.
- Session-expiry closes that session's streams (registry in `session.ts` →
  controllers).
- `contact.ts` / handlers call `notifyClients()` (no payload) after writes.
- Remove WS route, `websocket.ts`, `server.publish` wiring, and the WS socket
  registry in `session.ts`.
- NOTE: the old type cluster (`GetStateResponseBody`, `wsServerMessageSchema`, etc.)
  is **not** removed here — the frontend still imports it. Its removal moves to
  Stage 5, alongside the frontend migration that's its last consumer.

### Stage 5 — Frontend

- Replace `use-server-events` (WS) with an `EventSource` hook: on message →
  `invalidateQueries(stateQueryKey)`. Drop
  refs/heartbeat/reconnect/error/session branches.
- Error model: `error-context` only for action errors; remove the `isOnline`
  effect and WS-derived toasts.
- Rework `MamResponse` per §3.7 (status from `lastMamContact`; IP/AS only when
  reached).
- `cookie-form` → `PUT /cookie`; "Check Now" → `POST /checks`; remove `force`
  UI.
- With the frontend off them, remove the now-orphaned old cluster from `types.ts`
  (`getStateResponseBodySchema`/`GetStateResponseBody`, `publicSerializedStateSchema`,
  old `serializedStateSchema`/`serializedUpdateSchema`, `UpdateReason`, WS schemas)
  and colocate the external-API schemas (`mamUpdate…` → `external-api/mam.ts`,
  `ipResponseBodySchema` + `HostInfo` → `external-api/host-info.ts`).
- `state-query.ts` unchanged in spirit (GET /state → `PublicState`).

### Stage 6 — Tests + docs (back to green)

- Rewrite `tests/health.test.ts` for the new `/health`; review
  `tests/error.test.ts` (error types mostly intact),
  `tests/security-boundary.test.ts` (WS route → `/web/events`).
- Add tests for check logic (reached/unreached/429/403/rotation), `classify`,
  `serde` round-trip, `toPublicState` (asserts `cookie` never leaks).
- Docs: `docs/API.md` (new endpoints/shapes), `README.md` concepts (check ≈
  update now; drop stale/force narrative), `docs/errors.md`, `CHANGELOG.md`.

---

## 5. Assumptions & resolved decisions

- **[Confirmed by MAM docs]** 200 "No Change" is free; 429 only on a genuine
  too-recent change. The "always update" simplification rests on this.
- **[Confirmed] 429 cooldown = 1 hour.** A 429 update is _quashed_ (not
  applied), so the new IP stays pending; the normal interval re-sends the same
  IP each cycle until MAM returns 200 Completed. No special post-429 scheduler.
  Surfaced as "change pending (throttled)" (warn), not an error.
- **[Decided] Keep `jsonIp.php` for the no-cookie branch.** Setup requires
  showing the user their IP so they can fill in MAM's session form (see
  `docs/getting-your-cookie.md`). The interval keeps running these lookups even
  before a cookie is set.
- **[Decided] Commands are synchronous and return full `PublicState`.** Both
  `POST /checks` and `PUT /cookie` run the check in-request and return the new
  `PublicState`; the acting tab applies it immediately and the SSE refetch is a
  structural-sharing no-op. No correlation id. Synchronous `PUT /cookie` gives
  the setup flow an immediate cookie-valid/invalid verdict.
- **Auth docs mismatch** (Bearer in `API.md` vs session cookie in code) is out
  of scope here but worth a separate pass.

## 6. Known limitations

- **A failed *write* during a *background* contact is invisible to the UI.** Both
  state-file I/O failures are always logged (`handleBackgroundContactError` for the
  interval/startup loop; Bun's top-level `error()` handler for HTTP-triggered
  contacts). They surface to the frontend as follows:
  - **Corrupt read** is loud: `GET /state` reads the same file, so it (and
    `/health`) 500s and the app shows its "can't load state" path.
  - **Failed write via a user action** (`POST /checks` / `PUT /cookie`) returns 500
    → an action-error toast.
  - **Failed write via the background loop** is the gap: the previous `state.json`
    is intact, so `GET /state` keeps serving last-good state and the dashboard shows
    stale data with no error — only the server log knows.

  We accept this: a persistently-failing background write is a server-health
  problem (disk full / permissions), so **logs + the `/health` endpoint** are the
  right place for it, not a dashboard condition. And it's inherent — we can't write
  "the write failed" into the very file whose write is failing. If we ever want the
  UI to flag it, the route would be a small in-memory `lastPersistError` surfaced
  through `GET /state` (deliberately *not* done, to keep "state is the truth").
