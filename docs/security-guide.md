# Security Guide

Mousehole exposes a web interface and API that manage your MAM session cookie.
This page explains how to secure it with its provided options and the scenarios
in which you should use them.

- [Quick Start](#quick-start)
  - [Localhost Only](#localhost-only)
  - [LAN or Reverse Proxy Access](#reverse-proxy-access)
  - [Backwards Compatibility Mode](#backwards-compatibility-mode)
- [Cookie Storage](#cookie-storage)
- [Port Binding](#port-binding)
- [Authentication](#authentication)
- [Host Allowlist](#host-allowlist)
- [Origin Allowlist](#origin-allowlist)
- [HTTPS-Only Cookies](#https-only-cookies)
- [Session Duration](#session-duration)

> [!NOTE]
>
> For MAM-specific errors (`ASN mismatch` or `Last Change Too Recent`), see the
> [MAM error documentation](/docs/mam-errors.md). For network errors, see the
> [network troubleshooting guide](/docs/network-troubleshooting.md).

## Quick Start

### Localhost Only

If you access Mousehole only from the machine it runs on
(`http://localhost:5010`), set a password and you're done.

```yaml
# mousehole service definition in compose.yml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
```

### Reverse Proxy Access

If you access Mousehole through a reverse proxy (Caddy, Traefik, Unraid, etc.),
add the appropriate entries to the host and origin allowlists. For example, if
you want access Mousehole at `https://mousehole.myhomelab.lan` and
`http://localhost:5010`.

```yaml
# mousehole service definition in compose.yml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
  MOUSEHOLE_ALLOWED_HOSTS: "mousehole.myhomelab.lan,localhost"
  MOUSEHOLE_ALLOWED_ORIGINS: "https://mousehole.myhomelab.lan,http://localhost:5010"
```

See the [Host Allowlist](#host-allowlist) and
[Origin Allowlist](#origin-allowlist) sections below for more details.

### Backwards Compatibility Mode

Before v0.4.0, Mousehole had no authentication nor host/origin checks. To
restore that behavior, disable authentication and allow all hosts and origins.

> [!WARNING]
>
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

Throughout Mousehole's Docker documentation, you will see examples that bind
`5010` to all interfaces.

```yaml
# mousehole or VPN service definition in compose.yml
ports:
  - "5010:5010" # all interfaces
```

You should only do this if you understand the risks and want to access Mousehole
from other devices on your network (e.g., other computer, phone). This form is
used because it is conventional among other projects that document Docker port
binding.

You can also bind to the localhost interface only, which is more secure.

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

```
MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
```

**API token** (`MOUSEHOLE_AUTH_TOKEN`): Enables Bearer token authentication for
API clients. Clients send `Authorization: Bearer <token>` with each request.
Useful for scripts or tools that access the [API](/docs/API.md).

```
MOUSEHOLE_AUTH_TOKEN: "replace-with-a-long-random-token"
```

Both credentials support a `_FILE` form that reads the value from a file (for
example a Docker secret under `/run/secrets/`) instead of an environment
variable. See [Docker Secrets](/README.md#docker-secrets).

To disable all authentication (not recommended outside of a trusted localhost
setup), set `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true`.

## Host Allowlist

`MOUSEHOLE_ALLOWED_HOSTS` ensures Mousehole is only hosted on the names you
intend for it to be. Mousehole rejects requests with a
[`Host` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host)
that isn't on this list. This prevents
[Host header injection](https://portswigger.net/web-security/host-header)
attacks.

Separate multiple values with commas. Valid values are hostnames or IP
addresses, with optional ports. If a port is provided, _only_ that port is
allowed for that host. Without a port, _any_ port is allowed for that host.

The default is `localhost,127.0.0.1,[::1]`.

Here are some examples of valid host values given a URL:

| URL                                   | Host Value                                                  |
| ------------------------------------- | ----------------------------------------------------------- |
| `http://mousehole.myhomelab.lan:5010` | `mousehole.myhomelab.lan:5010` or `mousehole.myhomelab.lan` |
| `http://192.168.1.10:5010`            | `192.168.1.10:5010` or `192.168.1.10`                       |
| `http://localhost:5010`               | `localhost:5010` or `localhost`                             |

**When to configure this:** any time you access Mousehole at a hostname or IP
address other than localhost addresses, such as a LAN IP or a reverse proxy
domain. (You will likely need to configure the
[allowed origins](#origin-allowlist) too.)

```
MOUSEHOLE_ALLOWED_HOSTS: mousehole.myhomelab.lan,192.168.1.10
```

You can also opt-out and allow any host.

```
MOUSEHOLE_ALLOWED_HOSTS: "*"
```

## Origin Allowlist

`MOUSEHOLE_ALLOWED_ORIGINS` ensures that the Mousehole server only interacts
with the web pages (including its own web UI) that you intend to use it from.
Mousehole rejects
[origins](https://developer.mozilla.org/en-US/docs/Glossary/Origin) that are not
on this list from making mutating requests (e.g., `POST /login`). Tightening
this down prevents
[Cross-Origin Request Forgery (CSRF)](https://portswigger.net/web-security/csrf).

Separate multiple values with commas. Valid values are full origins: scheme,
host, and optional port, no path.

The default policy is
[same-origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy):
the browser's origin (as seen in the address bar) must match the origin that the
Mousehole server is on.

Here are some examples of valid origin values given a URL:

| URL                                        | Origin Value                           |
| ------------------------------------------ | -------------------------------------- |
| `https://mousehole.myhomelab.lan:5010/web` | `https://mousehole.myhomelab.lan:5010` |
| `http://192.168.1.10:5010`                 | `http://192.168.1.10:5010`             |
| `http://localhost:5010`                    | `http://localhost:5010`                |

**When to configure this:** if you use a reverse proxy (Caddy, Traefik, Unraid,
etc.), you will likely need to add the the proxy's origin to this list because
proxies rewrite headers. (You will likely need to configure the
[host allowlist](#host-allowlist) too.)

```
MOUSEHOLE_ALLOWED_ORIGINS: https://mousehole.myhomelab.lan,http://localhost:5010
```

You can also opt-out and allow any origin.

```
MOUSEHOLE_ALLOWED_ORIGINS: "*"
```

## HTTPS-Only Cookies

`MOUSEHOLE_HTTPS_ONLY_COOKIES` (default `false`) adds the
[`Secure` flag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#secure)
to session cookies, so browsers only send them over HTTPS connections.

**When to configure this:** Enable this when Mousehole is behind an HTTPS
reverse proxy and you will **only be accessing it over HTTPS**. Do not enable it
for plain HTTP or split HTTP/HTTPS setups, or else the browser will refuse to
send the cookie and logins will break.

```
MOUSEHOLE_HTTPS_ONLY_COOKIES: "true"
```

## Session Duration

`MOUSEHOLE_SESSION_DURATION_SECONDS` (default `604800`, one week) sets how long
a browser login session stays valid before requiring re-authentication.

**When to configure this:** Shorten it on shared or less-trusted devices.

```
MOUSEHOLE_SESSION_DURATION_SECONDS: "86400"  # one day
```
