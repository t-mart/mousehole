# API

Mousehole provides an API for programmatic access to its functionality.

## Authentication

Protected endpoints accept a Bearer token. Set the `MOUSEHOLE_AUTH_TOKEN`
environment variable and pass it in the `Authorization` header:

```
Authorization: Bearer <token>
```

Example with curl:

```sh
curl -H "Authorization: Bearer mytoken" http://localhost:5010/state
```

## State shape

`GET /state`, `PUT /cookie`, and `POST /checks` all return the same public state
object. It never contains your cookie — only whether one is set.

```jsonc
{
  "hasCookie": true,                 // is a MAM cookie configured?
  "hasAuth": true,                   // is the web UI password-protected?
  "nextCheckAt": "2025-06-21T14:27:28.113-05:00[America/Chicago]", // RFC 9557
  // The most recent contact with MAM. Absent until the first check runs.
  "lastMamContact": {
    "at": "2025-06-21T14:22:28.111-05:00[America/Chicago]",
    "reached": true,                 // we got an HTTP response from MAM
    "ip": "123.123.123.123",
    "asn": 12345,
    "as": "MegaCorp",
    // Present only when a cookie drove an update (the dynamicSeedbox call).
    "ipUpdate": { "success": true, "msg": "No change", "httpStatus": 200 }
  }
}
```

`lastMamContact` is a tagged union on `reached`:

- **Reached, with a cookie** — has `ip`/`asn`/`as` and an `ipUpdate`
  (`httpStatus` is `200` ok, `429` throttled, `403` rejected; `msg` is MAM's
  text, for display only).
- **Reached, no cookie yet** (setup lookup) — has `ip`/`asn`/`as`, no `ipUpdate`.
- **Unreachable** (transport failure) — no host fields:
  ```json
  { "at": "…", "reached": false,
    "error": { "type": "timeout-error", "message": "Request to … timed out after 10s. Is the network up?" } }
  ```

## `GET /state`

Protected: Yes

A pure read of the current state — it does **not** contact MAM, so it always
responds quickly and can't fail on a network blip. Returns the [state
shape](#state-shape).

## `PUT /cookie`

Protected: Yes

Set the MAM session cookie. This stores the credential **and** immediately
contacts MAM with it, so the response reflects whether the cookie works (e.g. a
`403` rejection shows up right away). Returns the [state shape](#state-shape).

Example request body:

```json
{ "value": "<your-mam_id-cookie-value>" }
```

## `POST /checks`

Protected: Yes

Run a check now: contact MAM and persist the result. Takes no body. Returns the
[state shape](#state-shape).

## `GET /ok`

Protected: No

**Deprecated in favor of `/health`.** A convenience endpoint summarizing the last
check. Returns `200` when the last check reached MAM and the IP update applied,
`503` otherwise.

```jsonc
{ "ok": true,  "reason": "ok" }          // 200
{ "ok": false, "reason": "unreachable" } // 503
```

`reason` is one of: `ok`, `throttled` (429), `rejected` (403), `unreachable`,
`no-cookie` (set one up), `pending` (no check has run yet).

## `GET /health`

Protected: No

Health check endpoint, same body and status semantics as `/ok` (`200` healthy /
`503` otherwise). It's a pure read of the last check — it makes no network call,
so a `curl`/Docker healthcheck never hits MAM.

```jsonc
{ "ok": true,  "reason": "ok" }
{ "ok": false, "reason": "rejected" }
```

## `GET /web/events`

Protected: Yes (origin-checked)

A [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
stream the web UI subscribes to. The events are **contentless** — each one just
signals "something changed, re-pull `GET /state`". Used by the dashboard to update
live without polling; not generally useful to API clients.
