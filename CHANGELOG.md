# Changelog

## Unreleased

This release reworks how Mousehole talks to MAM and how the web UI stays in sync,
and flattens the state model. Existing `state.json` files are migrated
automatically (your cookie is preserved).

- **Breaking**: Live updates now use Server-Sent Events instead of WebSockets.
  The `GET /web/ws` endpoint is replaced by `GET /events`, which carries
  contentless "re-pull `GET /state`" signals (no state in the payload).
- **Breaking**: Setting the cookie moved from `PUT /state` (`{ "currentCookie":
  … }`) to `PUT /cookie` (`{ "value": … }`). It now also contacts MAM
  immediately, so the response reflects whether the cookie works.
- **Breaking**: Triggering an update moved from `POST /update` (with an
  optional `force` body) to `POST /updates` (no body).
- **Breaking**: `MOUSEHOLE_CHECK_INTERVAL_SECONDS` is renamed to
  `MOUSEHOLE_UPDATE_INTERVAL_SECONDS`. The old name is ignored (the default of
  300 seconds applies until you rename it).
- **Breaking**: The `GET /state` response is reshaped. `host`, `lastMam`,
  `lastUpdate`, `hasCurrentCookie`, and `isOnline` are gone, and `nextCheckAt`
  is renamed to `nextContactAt`; it now returns `hasCookie`, `hasAuth`,
  `nextContactAt`, and a `lastMamContact` tagged union. See
  [the API docs](/docs/API.md).
- **Breaking**: `GET /ok` and `GET /health` now return `{ ok, reason }`, where
  `reason` is a contact status (`ok`, `throttled`, `rejected`, `unreachable`,
  `no-cookie`, `pending`). The old `isOnline` / `neededUpdateReason` fields are
  removed.
- **Breaking**: Removed `MOUSEHOLE_STALE_RESPONSE_SECONDS`. Every update now
  contacts MAM (which replies "No change" when nothing changed), so the
  stale-forcing mechanism is no longer needed.
- **Changed**: `GET /state`, `/ok`, and `/health` are now pure reads — they never
  call MAM, so a network blip can't make them fail or hang. The background update
  task is the only thing that contacts MAM.
- **Changed**: Requests with bodies over 8 KB now get a JSON
  `{ "type": "payload-too-large", … }` error body with the `413` status.
- **Fixed**: The web UI no longer spins forever when the server rejects its
  requests — most notably browsing from a host missing from
  `MOUSEHOLE_ALLOWED_HOSTS` — and instead shows the server's error with a
  Retry button. Boundary rejection messages are written to be actionable
  (naming the offending value and the setting to change). A failed
  *background* refresh no longer replaces a working dashboard: the error
  screen only appears when there's no loaded state at all.
- **Changed**: `POST /login` now explains when browser login is unavailable
  (`MOUSEHOLE_AUTH_PASSWORD` not set) instead of presenting like a wrong
  password.
- **Changed**: Invalid request bodies (`400` schema errors) carry a
  structured `issues` array (`[{ path, message }]`) and a one-line `message`
  instead of zod's raw multi-line text.
- **Fixed**: Error banners in the web UI now actually appear on plain-HTTP
  LAN deployments (they relied on `crypto.randomUUID`, which only exists in
  secure contexts, so adding one threw and the banner was silently lost).
  Banners also clear when a subsequent action succeeds, repeats of the same
  error coalesce into one banner with a count, and new banners are announced
  to screen readers.

## [v0.4.0](https://github.com/t-mart/mousehole/releases/tag/v0.4.0) - 2026-06-04

- **Breaking**: Introduce many security features: Add authentication, make the
  cookie write only to web UI and API endpoints, add Host/Origin checks, enforce
  JSON content-type enforcement, and limit request body size in
  [2ac082b](https://github.com/t-mart/mousehole/commit/2ac082b). To migrate,
  users should at least set `MOUSEHOLE_AUTH_PASSWORD`. See the
  [security guide](/docs/security-guide.md) for more details and
  recommendations.
- **Breaking**: Move to an alpine base (was Debian) in
  [#103](https://github.com/t-mart/mousehole/pull/103). This greatly reduces the
  size of the image.
- **Breaking**: Rename the `nextUpdateAt` field on `GET /state` to
  `nextCheckAt`, to make terminology more consistent around the app. API clients
  reading `nextUpdateAt` should switch to `nextCheckAt`.
- **Deprecation**: Deprecate the `/ok` endpoint in favor of `/health`.
- Add a configurable timeout for requests to MAM via the new
  `MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS` environment variable (default `10`).
  Previously, a stalled connection (for example, before a VPN is up) could make
  Mousehole hang.
- Add new healthcheck endpoint `GET /health` that is used in as the Docker
  image's default healthcheck in
  [#104](https://github.com/t-mart/mousehole/pull/104)
- Detect when Mousehole can't reach MAM (for example, when a VPN container
  stops) and surface it as a new `isOnline` field on `GET /state` and
  `GET /health`, a dashboard error, and a server log in
  [7d3a16d](https://github.com/t-mart/mousehole/commit/7d3a16d)
- Validate environment variables at startup. Invalid values (bad port, log
  level, intervals, or an empty Host/Origin allowlist) now fail fast with a
  clear message instead of being silently coerced in
  [9f48140](https://github.com/t-mart/mousehole/commit/9f48140)
- Make logging configurable by level with the new `MOUSEHOLE_LOG_LEVEL`
  environment variable.
- Surface server errors in the web UI and add a cancel button to the cookie form
  in [3ece893](https://github.com/t-mart/mousehole/commit/3ece893)

## [v0.3.1](https://github.com/t-mart/mousehole/releases/tag/v0.3.1) - 2026-05-23

- Use correct user in Dockerfile in
  [6e51d6a](https://github.com/t-mart/mousehole/commit/6e51d6a)
- Add TLS certificates to Docker image in
  [a4fbd43](https://github.com/t-mart/mousehole/commit/a4fbd43)

## [v0.3.0](https://github.com/t-mart/mousehole/releases/tag/v0.3.0) - 2026-05-22

- Show gentler log message on first startup when no cookie exists yet in
  [#85](https://github.com/t-mart/mousehole/pull/85)
- Refactor update reason logic in
  [#84](https://github.com/t-mart/mousehole/pull/84)
- Deprecate `/srv/mousehole` as the default directory for persistent application
  state in favor of `/var/lib/mousehole`. See rationale in the
  [FHS](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch05s08.html).
  Mousehole will warn at startup and continue reading from the old path if state
  is found there. See [#51](https://github.com/t-mart/mousehole/pull/51) for
  migration instructions.
- Reduce calls to IP endpoint by passing state in WebSocket messages in
  [#79](https://github.com/t-mart/mousehole/pull/79)
- Maintain help documentation in Markdown on Github instead of in the app in
  [#74](https://github.com/t-mart/mousehole/pull/74)
- Click to copy IP address in [#71](https://github.com/t-mart/mousehole/pull/71)
- Refactor frontend files in [#67](https://github.com/t-mart/mousehole/pull/67)
- Fix some issues around synchronization, such as preventing race conditions and
  enabling graceful shutdown on signal in
  [#68](https://github.com/t-mart/mousehole/pull/68)
- Also log HTTP request errors in server logs in
  [#70](https://github.com/t-mart/mousehole/pull/70)
- Declare that CSS can be imported in
  [#66](https://github.com/t-mart/mousehole/pull/66)
- Improve Dockerfile caching in
  [#65](https://github.com/t-mart/mousehole/pull/65) and
  [#69](https://github.com/t-mart/mousehole/pull/69)
- Remove deprecated `baseUrl` tsconfig option in
  [#64](https://github.com/t-mart/mousehole/pull/64)
- Update JS dependencies to latest versions in
  [#63](https://github.com/t-mart/mousehole/pull/63)
- Use Bun Cookie API instead of `tough-cookie` for parsing MAM cookies in
  [#62](https://github.com/t-mart/mousehole/pull/62)
- Update GitHub actions to latest versions in
  [#59](https://github.com/t-mart/mousehole/pull/59)
- Auto detect text files and perform LF normalization in
  [#58](https://github.com/t-mart/mousehole/pull/58)
- State updates to `PUT /state` now save correctly (was writing Promise object
  instead of actual data) in [#42](https://github.com/t-mart/mousehole/pull/42)
- State directory is now created automatically on first write if it doesn't
  exist in [#44](https://github.com/t-mart/mousehole/pull/44)
- Non-Error exceptions are now properly wrapped in custom error types with
  context in [#45](https://github.com/t-mart/mousehole/pull/45)
- Refactor MAM cookie parsing to use `getSetCookie()` in
  [#46](https://github.com/t-mart/mousehole/pull/46)
- Start this changelog in [#43](https://github.com/t-mart/mousehole/pull/43)

## [0.2.0](https://github.com/t-mart/mousehole/releases/tag/v0.2.0) - 2025-09-09

- Add Homepage Integration Examples and Contribution Guidelines by @NSF12345 in
  [#13](https://github.com/t-mart/mousehole/pull/13)
- Return 503 when not /ok by @t-mart in
  [#14](https://github.com/t-mart/mousehole/pull/14)
