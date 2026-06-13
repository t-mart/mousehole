# Changelog

## Unreleased

This release reworks how Mousehole talks to MAM and how the web UI stays in
sync, and flattens the state model. Existing `state.json` files are migrated
automatically (your cookie is preserved).

- **Breaking**: Live updates use Server-Sent Events instead of WebSockets:
  `GET /web/ws` is replaced by `GET /events`, a contentless "re-pull
  `GET /state`" signal, in
  [57c71fc](https://github.com/t-mart/mousehole/commit/57c71fc) and
  [7677644](https://github.com/t-mart/mousehole/commit/7677644).
- **Breaking**: Setting the cookie moved from `PUT /state`
  (`{ "currentCookie": … }`) to `PUT /cookie` (`{ "value": … }`, non-empty),
  which contacts MAM immediately so the response shows whether the cookie works,
  in [b244901](https://github.com/t-mart/mousehole/commit/b244901).
- **Breaking**: Triggering an update moved from `POST /update` (optional `force`
  body) to `POST /updates` (no body) in
  [b244901](https://github.com/t-mart/mousehole/commit/b244901) and
  [51b228c](https://github.com/t-mart/mousehole/commit/51b228c).
- **Breaking**: `MOUSEHOLE_CHECK_INTERVAL_SECONDS` is renamed to
  `MOUSEHOLE_UPDATE_INTERVAL_SECONDS` in
  [51b228c](https://github.com/t-mart/mousehole/commit/51b228c). The old name is
  ignored (the 300-second default applies until you rename it).
- **Breaking**: The `GET /state` response is reshaped: `host`, `lastMam`,
  `lastUpdate`, `hasCurrentCookie`, and `isOnline` are gone, and `nextCheckAt`
  is renamed to `nextContactAt`. It now returns `hasCookie`, `hasAuth`,
  `nextContactAt`, and a `lastMamContact` tagged union (see
  [the API docs](/docs/API.md)), in
  [4c10402](https://github.com/t-mart/mousehole/commit/4c10402) and
  [51b228c](https://github.com/t-mart/mousehole/commit/51b228c).
- **Breaking**: `GET /health` return `{ sync: { ok, reason } }`, where `reason`
  is `ok`, `throttled`, `rejected`, `unreachable`, `no-cookie`, or `pending`;
  `isOnline` / `neededUpdateReason` are removed, in
  [b244901](https://github.com/t-mart/mousehole/commit/b244901).
- **Breaking**: The `/ok` endpoint (deprecated in v0.4.0) is removed in favor of `/health` in
  [b7d67d2](https://github.com/t-mart/mousehole/commit/b7d67d2).
- **Breaking**: `GET /health` now always returns HTTP `200` while the server is
  up. The `ok`/`reason` body still reports the MAM sync state, but no longer
  drives the status code (it was `503` when not `ok`). This keeps the container
  healthy when your IP simply needs re-syncing, so reverse proxies and
  orchestrators don't restart it or pull it from rotation over something only
  you can fix.
- **Breaking**: Removed `MOUSEHOLE_STALE_RESPONSE_SECONDS`. Every update
  contacts MAM (which replies "No change" when nothing changed), in
  [4c10402](https://github.com/t-mart/mousehole/commit/4c10402).
- **Breaking**: Removed the `/srv/mousehole` legacy state-directory fallback
  (deprecated in v0.3.0). Mousehole always defaults to `/var/lib/mousehole` now.
  If your state still lives at `/srv/mousehole`, move it or set
  `MOUSEHOLE_STATE_DIR_PATH=/srv/mousehole`. See
  [#51](https://github.com/t-mart/mousehole/issues/51) for migration steps.
- **Changed**: `GET /state`, `/ok`, and `/health` are pure reads. They never
  call MAM, so a network blip can't fail or hang them, in
  [b244901](https://github.com/t-mart/mousehole/commit/b244901).
- **Changed**: Bearer-token requests are exempt from the cross-origin (CSRF)
  check because a cross-site page can't attach your token, so there's nothing to
  block, in [9755fd9](https://github.com/t-mart/mousehole/commit/9755fd9).
- **Changed**: `POST /logout` enforces the origin check (no more cross-site
  logout) in [9755fd9](https://github.com/t-mart/mousehole/commit/9755fd9).
- **Changed**: Requests with bodies over 8 KB get a JSON
  `{ "type": "payload-too-large", … }` body with the `413` status, in
  [7677644](https://github.com/t-mart/mousehole/commit/7677644).
- **Changed**: Server logs honor the [`NO_COLOR`](https://no-color.org)
  convention in [6e3db04](https://github.com/t-mart/mousehole/commit/6e3db04).
- **Changed**: The Unraid guide has been overhauled for clarity and the
  associated template updated to match the latest version of Mousehole, in
  [fd81847](https://github.com/t-mart/mousehole/commit/fd81847).
- **Fixed**: A failure _reading_ `state.json` (permissions, IO) no longer passes
  for a fresh install (which could overwrite the stored cookie) in
  [0374bcd](https://github.com/t-mart/mousehole/commit/0374bcd).
- **Fixed**: The web UI no longer spins forever when the server rejects its
  requests (e.g. browsing from a host missing from `MOUSEHOLE_ALLOWED_HOSTS`);
  it shows the error with a Retry button, in
  [05750e5](https://github.com/t-mart/mousehole/commit/05750e5).
- **Changed**: HTTP error messages now have more actionable messages in
  [05750e5](https://github.com/t-mart/mousehole/commit/05750e5).
- **Changed**: `POST /login` explains when browser login is unavailable
  (`MOUSEHOLE_AUTH_PASSWORD` not set) instead of presenting like a wrong
  password, in [05750e5](https://github.com/t-mart/mousehole/commit/05750e5).
- **Changed**: Invalid request bodies (`400`) carry a structured
  `issues: [{ path, message }]` array and a one-line `message` instead of zod's
  multi-line text, in
  [05750e5](https://github.com/t-mart/mousehole/commit/05750e5).
- **Fixed**: Error banners now properly appear on plain-HTTP LAN deployments in
  [505e992](https://github.com/t-mart/mousehole/commit/505e992).
- **Changed**: Error banners clear when a later action succeeds, repeats
  coalesce into one banner with a count, and new banners are announced to screen
  readers, in [505e992](https://github.com/t-mart/mousehole/commit/505e992).

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
