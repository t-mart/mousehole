# Mousehole, a Seedbox IP Updater for MAM

A background service to update a seedbox IP for MAM and web app to manage it.

![Mousehole Demo](/docs/images/demo.webp)

This can be helpful if you are using a host/VPN/seedbox to seed and its IP
address is not stable.

Features:

- Background service that automatically keeps MAM up to date with your host's IP
- Frontend website to manage the service
- [API](/docs/API.md) for programmatic access

## Getting Started

To use Mousehole, you need to:

1. [Run the service](#step-1-run-the-service)
2. [Set your MAM cookie](#step-2-set-your-mam-cookie)

### Step 1: Run the service

#### Docker Compose (recommended)

Starter Docker Compose examples:

- ⭐ [Gluetun + qBittorrent](/docs/docker-compose-examples/gluetun-qb.md)
- [Wireguard + qBittorrent](/docs/docker-compose-examples/wireguard-qb.md)
- [hotio/qBittorrent](/docs/docker-compose-examples/hotio-qb.md)
- [binhex/arch-qbittorrentvpn](/docs/docker-compose-examples/binhex-qb.md)
- [Non-VPN Example](/docs/docker-compose-examples/non-vpn.md)

Any Docker Compose setup can be adapted to include
[Mousehole as a sidecar](/docs/compose-setups.md).

#### Unraid

See the [Unraid Installation Guide](/contrib/unraid/README.md) for instructions.

#### From Source

Mousehole runs on [Bun](https://bun.sh/). After installing `bun` and cloning the
repository, run:

```bash
cd /path/to/mousehole
bun install
bun run build
bun run start  # See environment variables section below
```

### Step 2: Set Your MAM Cookie

Navigate to the Mousehole web UI at <http://localhost:5010> and paste in your
MAM cookie. See [Getting Your Cookie Value](/docs/getting-your-cookie.md) for a
full walkthrough of how to obtain the cookie from MAM.

## Troubleshooting

Despite following the above steps, things can still go wrong that cannot be
fixed automatically.

- For MAM-specific errors (`ASN mismatch` or `Last Change Too Recent`), see the
  [MAM error documentation](/docs/mam-errors.md).
- For network errors, see the
  [network troubleshooting guide](/docs/network-troubleshooting.md).
- For errors related to `Host` and `Origin` headers, see the
  [security guide](/docs/security-guide.md).

## Security

Mousehole has security features to protect the cookie credential. Most are
enabled by default. If you are running Mousehole on a custom domain or through a
proxy, the defaults will not be sufficient. See the
[security guide](/docs/security-guide.md) for common setups and detailed
information.

## Docker Images

Mousehole publishes Alpine-based images for amd64 and arm64 to
[Docker Hub](https://hub.docker.com/r/tmmrtn/mousehole).

### Tags

Several tags are published throughout the lifecycle of the project:

- Released [SemVer](https://semver.org/) versions (`0`, `0.1`, `0.1.11`, etc)
- `latest`, the latest release
- `edge`, the tip of `master` branch
- Pull requests targeting `master` for testing, tagged as `pr-<number>`

### Healthcheck

The Dockerfile includes a default healthcheck that hits the
`http://localhost:5010/health` endpoint (see
[API Documentation](/docs/API.md#get-health)). A `200` status code indicates the
service is live, and therefore, it is suitable for use in container
orchestration.

If you change the port on which Mousehole listens with the `MOUSEHOLE_PORT`
environment variable, make sure to override the
[healthcheck command](/Dockerfile) accordingly.

## How It Works

On a schedule, Mousehole contacts MAM. If Mousehole has your cookie, it makes a
request to the
[dynamic-seedbox API](https://www.myanonamouse.net/api/endpoint.php/3/json/dynamicSeedbox.php)
to update your IP with MAM. If without your cookie, Mousehole gets your current
IP for reference while you [get your cookie](/docs/getting-your-cookie.md).

You can trigger an immediate update from the web UI with **Update Now**.

## Environment Variables

### Commonly set

- `MOUSEHOLE_AUTH_PASSWORD`: Enables browser login via the web UI login page.
  Set this to a strong password. Supports the
  [`_FILE` variant](#docker-secrets). See
  [Authentication](/docs/security-guide.md#authentication).
- `TZ`: _(Default `Etc/UTC`)_ The timezone identifier for displaying local
  times. Use the "TZ identifier" column from this
  [list of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
  for valid values. (Not every city is listed! Use one that follows the same
  rules as your location.)

### When hosting beyond localhost

- `MOUSEHOLE_ALLOWED_HOSTS`: Comma-separated allowlist of `Host` header values.
  Defaults to `localhost,127.0.0.1,[::1]`. See
  [Host Allowlist](/docs/security-guide.md#host-allowlist).
- `MOUSEHOLE_ALLOWED_ORIGINS`: Comma-separated allowlist of `Origin` header
  values. Defaults to same-origin only. See
  [Origin Allowlist](/docs/security-guide.md#origin-allowlist).
- `MOUSEHOLE_HTTPS_ONLY_COOKIES`: _(Default `false`)_ Set to `true` to add the
  `Secure` flag to session cookies, preventing browsers from sending them over
  plain HTTP. See
  [HTTPS-Only Cookies](/docs/security-guide.md#https-only-cookies).

### Occasional tuning

- `MOUSEHOLE_PORT`: _(Default `5010`)_ The port on which the HTTP server will
  listen.
- `MOUSEHOLE_UPDATE_INTERVAL_SECONDS`: _(Default `300` (5 minutes))_ The
  interval in seconds between automatic updates. If your IP is unchanged, MAM
  simply replies "No change", so there's no harm in a short interval.
- `MOUSEHOLE_AUTH_TOKEN`: Enables Bearer token authentication for API clients.
  Only needed if you're writing/integrating code against the API. Clients can
  send HTTP headers in the format `Authorization: Bearer <token>` when accessing
  [API endpoints](/docs/API.md). Supports the
  [`_FILE` variant](#docker-secrets). See
  [Authentication](/docs/security-guide.md#authentication).
- `MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS`: _(Default `10`)_ How long to wait for
  a response from MAM before aborting the request. Prevents Mousehole from
  hanging when the connection silently stalls (e.g. before the VPN is up).
- `MOUSEHOLE_SESSION_DURATION_SECONDS`: _(Default `604800` (1 week))_ How long a
  browser login session remains valid before expiring. See
  [Session Duration](/docs/security-guide.md#session-duration).
- `MOUSEHOLE_LOG_LEVEL`: _(Default `info`)_ Log verbosity. Valid values:
  `error`, `warn`, `info`, `debug`.
- `MOUSEHOLE_STATE_DIR_PATH`: _(Default `/var/lib/mousehole`)_ The directory
  where the service will store its internal data.

### Rarely needed

- `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH`: Set to `true` to turn off all
  authentication. Do not use in mixed-trust environments.

### Docker Secrets

As an alternative to placing a credential in an environment variable, you can
specify a file that contains it with the `_FILE` variant. This enables use of
[Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/). The
contents are whitespace-trimmed, and the `_FILE` variant takes precedence when
both are set. If the file can't be read, Mousehole fails to start.

Supported for `MOUSEHOLE_AUTH_PASSWORD` and `MOUSEHOLE_AUTH_TOKEN`:

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    environment:
      MOUSEHOLE_AUTH_PASSWORD_FILE: /run/secrets/mousehole-auth-password
    secrets:
      - mousehole-auth-password

secrets:
  mousehole-auth-password:
    file: mousehole-auth-password.txt
```

## Contributing

Want to contribute, or run Mousehole locally for development? Check out the
[contribution guidelines](/CONTRIBUTING.md).

There is also a [`contrib`](/contrib/) directory with community-contributed
work, maintained on a best-effort basis.

## Links

- [Repository](https://github.com/t-mart/mousehole)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mousehole)
- [Forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257)

## Attribution

- [Commissioner](https://github.com/kosbarts/Commissioner), Copyright 2019 The
  Commissioner Project Authors, licensed under
  [OFL-1.1](https://openfontlicense.org/open-font-license-official-text/)
- [IBM Plex Mono](https://github.com/IBM/plex), Copyright 2017 IBM Corp.,
  licensed under
  [OFL-1.1](https://openfontlicense.org/open-font-license-official-text/)
- [Mouse Hole](https://thenounproject.com/icon/mouse-hole-125505/), Sergey
  Demushkin on the [Noun Project](https://thenounproject.com/), licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

## Support the Project

If my project has helped you out, you can ensure it stays maintained.

- Sponsor me on [GitHub](https://github.com/sponsors/t-mart)
- Send BTC to `3NbDsq9mhLAf7mRQ5UqnC5z1UXS8YGJBok`.
