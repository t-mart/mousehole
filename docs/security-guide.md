# Security Guide

Mousehole exposes a web interface and API that manage your MAM session cookie.
This page explains how to secure it with its provided options and the scenarios
in which you should use them.

- [Quick Start](#quick-start)
  - [Localhost Only](#localhost-only)
  - [LAN or Custom Domain](#lan-or-custom-domain)
  - [Reverse Proxy](#reverse-proxy)
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
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
```

### LAN or Custom Domain

If you access Mousehole on a _non-localhost_ host, such as one on your network
(for example, `192.168.0.2:5010`) or on a custom domain, add that host to
[Host Allowlist](#host-allowlist):

```yaml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
  MOUSEHOLE_ALLOWED_HOSTS: "localhost,127.0.0.1,192.168.0.2"
```

### Reverse Proxy

If you access Mousehole through a reverse proxy (like Caddy, Traefik, or some
Unraid configurations), you must configure _both_ the
[Host Allowlist](#host-allowlist) and [Origin Allowlist](#origin-allowlist). For
example, to access on `https://mousehole.myhomelab.lan` (where this host is a
reverse proxy), you would configure:

```yaml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
  MOUSEHOLE_ALLOWED_HOSTS: "localhost,127.0.0.1,mousehole.myhomelab.lan"
  MOUSEHOLE_ALLOWED_ORIGINS: "http://localhost:5010,http://127.0.0.1:5010,https://mousehole.myhomelab.lan"
```

### Backwards Compatibility Mode

Before v0.4.0, Mousehole had no authentication nor Host/Origin checks. To
restore that behavior, disable authentication and allow all hosts and origins.

> [!WARNING]
>
> Only use this on a private, trusted network.

```yaml
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

**Browser login password** (`MOUSEHOLE_AUTH_PASSWORD` environment variable):
Enables a login page on the web UI. Sessions persist for one week by default
(see [Session Duration](#session-duration)).

```yaml
environment:
  MOUSEHOLE_AUTH_PASSWORD: "replace-with-a-long-random-password"
```

**API token** (`MOUSEHOLE_AUTH_TOKEN` environment variable): Enables Bearer
token authentication for API clients. Clients send
`Authorization: Bearer <token>` with each request. Useful for scripts or tools
that access the [API](/docs/API.md).

```yaml
environment:
  MOUSEHOLE_AUTH_TOKEN: "replace-with-a-long-random-token"
```

Both credentials support a `_FILE` environment variable form that reads the
value from a file (for example a Docker secret under `/run/secrets/`) instead of
an environment variable. See [Docker Secrets](/README.md#docker-secrets).

To disable all authentication (not recommended outside of a trusted localhost
setup), set environment variable `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true`.

## Host Allowlist

The Host allowlist ensures Mousehole is only hosted on the names you intend for
it to be. Mousehole rejects requests with a
[`Host` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host)
that isn't on this list. This prevents
[Host header injection](https://portswigger.net/web-security/host-header)
attacks.

This list is set using the `MOUSEHOLE_ALLOWED_HOSTS` environment variable.
Separate multiple values with commas. Valid values are hostnames or IP
addresses, with optional ports. If a port is provided, _only_ that port is
allowed for that host. Without a port, _any_ port is allowed for that host.

The default is `localhost,127.0.0.1,[::1]`.

**When to configure this:** any time you access Mousehole at a hostname or IP
address other than localhost addresses, such as a LAN IP or a custom domain.
(You might need to configure the [Origin allowlist](#origin-allowlist) too.)

```yaml
environment:
  MOUSEHOLE_ALLOWED_HOSTS: mousehole.myhomelab.lan,192.168.1.10
```

Here are some examples of valid host values given a URL:

| URL                                    | Host Value                                                  |
| -------------------------------------- | ----------------------------------------------------------- |
| `http://localhost:5010`                | `localhost:5010` or `localhost`                             |
| `http://192.168.1.10:5010`             | `192.168.1.10:5010` or `192.168.1.10`                       |
| `https://mousehole.myhomelab.lan:5010` | `mousehole.myhomelab.lan:5010` or `mousehole.myhomelab.lan` |

You can also opt-out and allow any host.

```yaml
environment:
  MOUSEHOLE_ALLOWED_HOSTS: "*"
```

## Origin Allowlist

The Origin allowlist ensures that the Mousehole server only interacts with the
web pages (including its own web UI) that you intend to use it from. Mousehole
rejects [origins](https://developer.mozilla.org/en-US/docs/Glossary/Origin) that
are not on this list from making mutating requests (e.g., `POST /login`).
Tightening this down prevents
[Cross-Origin Request Forgery (CSRF)](https://portswigger.net/web-security/csrf).

This list is set using the `MOUSEHOLE_ALLOWED_ORIGINS` environment variable.
Separate multiple values with commas. Valid values are full origins: scheme,
host, and optional port, no path.

The default policy is
[same-origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy):
the Origin header must match the request's Host header, scheme, and port.

**When to configure this:** any time there is network infrastructure between
your browser and Mousehole that changes the Host header of requests, such as a
reverse proxy. (You will likely need to configure the
[Host allowlist](#host-allowlist) too.)

```yaml
environment:
  MOUSEHOLE_ALLOWED_ORIGINS: https://mousehole.myhomelab.lan,http://localhost:5010
```

Here are some examples of valid origin values given a URL:

| URL                                        | Origin Value                           |
| ------------------------------------------ | -------------------------------------- |
| `http://localhost:5010`                    | `http://localhost:5010`                |
| `http://192.168.1.10:5010`                 | `http://192.168.1.10:5010`             |
| `https://mousehole.myhomelab.lan:5010/web` | `https://mousehole.myhomelab.lan:5010` |

You can also opt-out and allow any origin.

```yaml
environment:
  MOUSEHOLE_ALLOWED_ORIGINS: "*"
```

## HTTPS-Only Cookies

In HTTPS-only envirionments, you can control whether Mousehole adds the
[`Secure` flag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#secure)
to session cookies, which prevents browsers from sending them over plain HTTP.
This is done with the `MOUSEHOLE_HTTPS_ONLY_COOKIES` environment variable set to
`true` or `false` (default `false`).

**When to configure this:** Enable this if you will **only be accessing
Mousehole over HTTPS**. Do not enable it for plain HTTP or split HTTP/HTTPS
setups, or else the browser will refuse to send the cookie and logins will
break.

```yaml
environment:
  MOUSEHOLE_HTTPS_ONLY_COOKIES: "true"
```

## Session Duration

The `MOUSEHOLE_SESSION_DURATION_SECONDS` environment variable sets how long a
browser login session stays valid before requiring re-authentication (default
`604800`, one week).

**When to configure this:** Shorten it on shared or less-trusted devices.

```yaml
environment:
  MOUSEHOLE_SESSION_DURATION_SECONDS: "86400" # one day
```
