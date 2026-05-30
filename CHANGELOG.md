# Changelog

## [Unreleased]

- Harden the HTTP and WebSocket boundary with public state serialization,
  authentication, Host/Origin checks, JSON content-type enforcement, and request
  body size limits.

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
