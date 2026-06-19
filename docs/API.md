# API

Mousehole provides an API for programmatic access to its functionality.

## Authentication

Protected endpoints accept a Bearer token. Set the `MOUSEHOLE_AUTH_TOKEN`
environment variable (or its [`_FILE` variant](/README.md#docker-secrets)) and
pass it in the `Authorization` header:

```
Authorization: Bearer <token>
```

Example with curl:

```sh
curl -H "Authorization: Bearer mytoken" http://localhost:5010/state
```

A request with a missing or invalid credential is rejected with `401` and a
`WWW-Authenticate` header (see [Errors](#errors)).

## State shape

`GET /state`, `PUT /cookie`, and `POST /updates` all return the same public
state object. It never contains your cookie.

Mousehole records each exchange with MAM as a **contact**; when a cookie is set,
the contact performs an IP **update** (the `ipUpdate` field below).

```jsonc
{
  "hasCookie": true, // is a MAM cookie configured?
  "hasAuth": true, // is the web UI password-protected? (frontend concern)
  // When the next automatic contact is scheduled (RFC 9557). Omitted until the
  // scheduler has armed the first interval, e.g. before the initial contact
  // completes (and after shutdown).
  "nextContactAt": "2025-06-21T14:27:28.113-05:00[America/Chicago]",
  // The most recent contact with MAM. Absent until the first check runs.
  "lastMamContact": {
    "at": "2025-06-21T14:22:28.111-05:00[America/Chicago]",
    "reached": true, // we got an HTTP response from MAM
    "ip": "123.123.123.123",
    "asn": 12345,
    "as": "MegaCorp",
    // Present only when a cookie drove an update (the dynamicSeedbox call).
    "ipUpdate": { "success": true, "msg": "No change", "httpStatus": 200 },
  },
}
```

`lastMamContact` is a tagged union on `reached`:

- **Reached, with a cookie** — has `ip`/`asn`/`as` and an `ipUpdate`
  (`httpStatus` is `200` ok, `429` throttled, `403` rejected; `msg` is MAM's
  text, for display only).
- **Reached, no cookie yet** (setup lookup) — has `ip`/`asn`/`as`, no
  `ipUpdate`.
- **Unreachable** (transport failure) — no host fields:
  ```json
  {
    "at": "…",
    "reached": false,
    "error": {
      "type": "timeout-error",
      "message": "Request to … timed out after 10s. Is the network up?"
    }
  }
  ```

## Errors

HTTP boundary rejections, invalid requests, and server-side disk faults return a
non-2xx status with this envelope:

```jsonc
{
  "type": "json-parse-error", // stable, machine-readable tag
  "message": "...", // human-readable, written to be actionable
  // Only on a schema-error: the field-level validation problems.
  "issues": [{ "path": "value", "message": "..." }],
  // Present when this error wraps a lower-level one.
  "cause": { "type": "...", "message": "..." },
}
```

| `type`                    | Status | When                                                            |
| ------------------------- | ------ | --------------------------------------------------------------- |
| `host-not-allowed`        | 403    | `Host` header missing or not in `MOUSEHOLE_ALLOWED_HOSTS`       |
| `authentication-required` | 401    | missing or invalid token/session                                |
| `auth-not-configured`     | 500    | no `MOUSEHOLE_AUTH_*` credential is set                         |
| `origin-not-allowed`      | 403    | disallowed cross-origin browser request (waived for token auth) |
| `unsupported-media-type`  | 415    | request body without `Content-Type: application/json`           |
| `payload-too-large`       | 413    | request body over 8 KiB                                         |
| `schema-error`            | 400    | request body fails schema validation (carries `issues`)         |
| `json-parse-error`        | 400    | request body given by client is invalid JSON                    |
| `json-parse-error`        | 500    | MAM response or state file is invalid JSON (see message)        |
| `file-read-error`         | 500    | the state file exists but cannot be read (e.g. permissions)     |
| `file-write-error`        | 500    | the state file cannot be written                                |
| `directory-create-error`  | 500    | the state directory cannot be created                           |
| `not-found`               | 404    | no matching route                                               |
| `unhandled-error`         | 500    | any otherwise-unclassified server error                         |

Boundary failures (`401`, `403`) can occur on any endpoint marked _Requires
Auth_. The state-file `500`s can occur on any endpoint that reads or writes
state (`GET /state`, `PUT /cookie`, `POST /updates`, `GET /health`).

## `GET /state`

Requires Auth?: Yes

A pure read of the current state. Returns the [state shape](#state-shape).

**Failure modes:**

- `401`/`403` if the request isn't authorized
- `500` (`file-read-error` or `json-parse-error`) if the persisted state cannot
  be read

## `PUT /cookie`

Requires Auth?: Yes

Set the MAM session cookie. This stores the credential **and** immediately
contacts MAM with it, so the response body reflects whether the cookie works
(e.g. a `403` rejection shows up right away). Returns the
[state shape](#state-shape).

Example request body:

```json
{ "value": "<your-mam_id-cookie-value>" }
```

`value` must be a non-empty string. The cookie is persisted regardless of the
MAM outcome: a rejection (`403`), a throttle (`429`), or an unreachable MAM is
recorded in the returned `lastMamContact`, and the response is still `200`. The
HTTP status reflects request handling and persistence only, never what MAM said.

**Failure modes:**

- `415` if the body isn't `application/json`
- `413` if it exceeds 8 KiB
- `400` for malformed JSON (`json-parse-error`) or a missing/empty `value`
  (`schema-error`, with `issues`)
- `401`/`403` if unauthorized
- `500` if state cannot be read or written

## `POST /updates`

Requires Auth?: Yes

Run an update now: contact MAM and persist the result. Takes no body. Returns
the [state shape](#state-shape).

Like `PUT /cookie`, a failed MAM contact is recorded, not raised: the response
is `200` with the outcome in `lastMamContact`.

**Failure modes:**

- `401`/`403` if unauthorized
- `500` if state cannot be read or written

## `GET /health`

Requires Auth?: No

Answers with `200` if the server is up and able to read its persisted state.
Therefore, you can infer _liveness_ from the status code. This may be suitable
for container orchestrators looking to know if the container should be
restarted.

To facilitate monitoring, the body reports a state-like response, but it is
reduced because this endpoint does not require authorization.

```jsonc
{ "lastMamContactResult": "ok" }       // synced
{ "lastMamContactResult": "rejected" } // needs attention
{ "lastMamContactResult": "unreachable" } // MAM is down or network is down
```

Those are a few illustrative values; the table below lists the complete set.

| `lastMamContactResult` | Contact Attempted? | Contact Success? | IP Update Attempted? | IP Update Success? | Notes                                      |
| ---------------------- | ------------------ | ---------------- | -------------------- | ------------------ | ------------------------------------------ |
| `pending`              | ❌ No              | N/A              | N/A                  | N/A                | No contact attempt has run yet.            |
| `unreachable`          | ✅ Yes             | ❌ No            | N/A                  | N/A                | Unable to contact MAM                      |
| `no-cookie`            | ✅ Yes             | ✅ Yes           | ❌ No                | N/A                | User has not yet set a cookie.             |
| `rejected`             | ✅ Yes             | ✅ Yes           | ✅ Yes               | ❌ No              | Cookie refused by MAM; update not applied. |
| `throttled`            | ✅ Yes             | ✅ Yes           | ✅ Yes               | ❌ No              | Update refused: last change too recent.    |
| `ok`                   | ✅ Yes             | ✅ Yes           | ✅ Yes               | ✅ Yes             | IP update succeeded.                       |

**Failure modes:**

- `500` if state cannot be read

## `GET /events`

Requires Auth?: Yes

A
[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
stream the web UI subscribes to. The events have no content; they just signal
"something has changed, re-pull `GET /state`". Used by the dashboard to update
live without polling. Not generally useful to API clients.

**Failure modes:**

- `401`/`403` if the request isn't authorized
