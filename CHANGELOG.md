# Changelog

## [Unreleased]

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
