# Security Guide

Mousehole exposes a web interface and API that manage your MAM session cookie.
This page explains how to secure it with its provided options and the scenarios
in which you should use them.

- [Quick Start](#quick-start)
  - [Localhost Only](#localhost-only)
  - [LAN or Reverse Proxy Access](#lan-or-reverse-proxy-access)
  - [Backwards Compatibility Mode](#backwards-compatibility-mode)
- [Cookie Storage](#cookie-storage)
- [Port Binding](#port-binding)
- [Authentication](#authentication)
- [Host Allowlist](#host-allowlist)
- [Origin Allowlist](#origin-allowlist)
- [HTTPS-Only Cookies](#https-only-cookies)
- [Session Duration](#session-duration)

## Quick Start

### Localhost Only

If you access Mousehole only from the machine it runs on
(`http://localhost:5010`), set a password and you're done:

```yaml
# mousehole service definition in compose.yml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
```

### Reverse Proxy Access

If you access Mousehole through a reverse proxy (Caddy, Traefik, Nginx, other
NAS software), add that hostname to the host and origin allowlists. For example,
if you want access Mousehole at `https://mousehole.myhomelab.lan` and
`http://localhost:5010`:

```yaml
# mousehole service definition in compose.yml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
  MOUSEHOLE_ALLOWED_HOSTS: "mousehole.myhomelab.lan,localhost"
  MOUSEHOLE_ALLOWED_ORIGINS: "https://mousehole.myhomelab.lan,http://localhost:5010"
```

### Backwards Compatibility Mode

Before v0.4.0, Mousehole had no authentication or host/origin checks. To restore
that behavior, disable authentication and allow all hosts and origins.

<!-- prettier-ignore -->
> [!WARNING]
> Only use this on a private, trusted network.

```yaml
# mousehole service definition in compose.yml
environment:
  MOUSEHOLE_INSECURE_ALLOW_NO_AUTH: "true"
  MOUSEHOLE_ALLOWED_HOSTS: "*"
  MOUSEHOLE_ALLOWED_ORIGINS: "*"
```

## Cookie Storage

Mousehole writes your MAM session cookie to disk in plaintext under
`MOUSEHOLE_STATE_DIR_PATH` (default `/var/lib/mousehole`). Restrict access to it
and avoid backing it up to untrusted destinations.

In Docker setups, treat the volume that stores this directory in the same way.

## Port Binding

In Docker Compose
[`ports` mappings](https://docs.docker.com/reference/compose-file/services/#ports),
if you do not specify an IP address, Docker binds to _all_ interfaces, which can
bypass firewall rules and expose Mousehole directly to the internet.

The form for specifying an IP address is `IP:HOST_PORT:CONTAINER_PORT`. The IP
part controls which network interface the port is published on.

```yaml
# mousehole or VPN service definition in compose.yml
ports:
  - "127.0.0.1:5010:5010" # localhost only
```

See the
[Docker `ports` documentation](https://docs.docker.com/reference/compose-file/services/#ports)
for details.

## Authentication

Mousehole v0.4.0 introduced two authentication mechanisms, which can be used
independently or together.

**Browser login** (`MOUSEHOLE_AUTH_PASSWORD`): Enables a login page on the web
UI. Sessions persist for one week by default (see
[Session Duration](#session-duration)).

**API token** (`MOUSEHOLE_AUTH_TOKEN`): Enables Bearer token authentication for
API clients. Clients send `Authorization: Bearer <token>` with each request.
Useful for scripts or tools that access the [API](./API.md) without a browser
session.

To disable all authentication (not recommended outside of a trusted localhost
setup): set `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true`.

## Host Allowlist

`MOUSEHOLE_ALLOWED_HOSTS` controls which
[`Host` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host)
values Mousehole accepts. When a browser makes a request, it sets the `Host`
header to the hostname in the URL. Mousehole rejects requests with a `Host` that
isn't on the allowlist, which prevents
[Host header injection](https://portswigger.net/web-security/host-header)
attacks.

The default is `localhost,127.0.0.1,[::1]`.

**When to configure this:** any time you access Mousehole at a hostname or IP
address other than `localhost` or `127.0.0.1`, such as a NAS hostname, a LAN IP,
or a reverse proxy domain. Set it to the exact values you use in the browser:

```
MOUSEHOLE_ALLOWED_HOSTS: mousehole.myhomelab.lan,192.168.1.10
```

To allow any host (opt-out):

```
MOUSEHOLE_ALLOWED_HOSTS: "*"
```

## Origin Allowlist

`MOUSEHOLE_ALLOWED_ORIGINS` controls which web origins can make
[cross-origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) requests
to Mousehole's API and WebSocket endpoint. Tightening this down prevents
[Cross-Origin Request Forgery (CSRF)](https://portswigger.net/web-security/csrf).

The default is same-origin only, which only allows the origin that matches the
host of the request. **Most users never need to change this.** Configure it only
if a separate web application (not Mousehole's frontend) needs to make browser
requests to Mousehole's API.

Values are full
[origins](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin)
— scheme, host, and optional port, no path:

```
MOUSEHOLE_ALLOWED_ORIGINS: https://mousehole.myhomelab.lan,http://localhost:5010
```

To allow any origin (opt-out):

```
MOUSEHOLE_ALLOWED_ORIGINS: "*"
```

## HTTPS-Only Cookies

`MOUSEHOLE_HTTPS_ONLY_COOKIES` (default `false`) adds the
[`Secure` flag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#secure)
to session cookies, so browsers only send them over HTTPS connections.

Enable this when Mousehole is behind an HTTPS reverse proxy. Do not enable it
for plain HTTP setups, or else the browser will refuse to send the cookie and
logins will break.

## Session Duration

`MOUSEHOLE_SESSION_DURATION_SECONDS` (default `604800`, one week) sets how long
a browser login session stays valid before requiring re-authentication. Shorten
it on shared or less-trusted devices:

```
MOUSEHOLE_SESSION_DURATION_SECONDS: "86400"  # one day
```
