# Mousehole, a Seedbox IP Updater for MAM

A background service to update a seedbox IP for MAM and an HTTP server to manage
it.

![Mousehole Demo](/docs/images/demo.webp)

This can be helpful if you are using a host/VPN/seedbox to seed and its IP
address is not stable.

Features:

- Background service that automatically keeps MAM up to date with your host's
  IP
- Frontend website to manage the service
- [API](/docs/API.md) for programmatic access

## Getting Started

To use Mousehole, you need to:

1. [Run the service](#step-1-run-the-service)
2. [Set your MAM cookie via the web interface](#step-2-set-your-mam-cookie)

### Step 1: Run the service

#### Docker Compose (recommended)

Starter Docker Compose examples:

- ⭐
  [Gluetun + qBittorrent + Mousehole](/docs/docker-compose-examples/gluetun-qb.md)
- [Wireguard + qBittorrent + Mousehole](/docs/docker-compose-examples/wireguard-qb.md)
- [hotio/qBittorrent + Mousehole](/docs/docker-compose-examples/hotio-qb.md)
- [binhex/arch-qbittorrentvpn + Mousehole](/docs/docker-compose-examples/binhex-qb.md)
- [Non-VPN Example](/docs/docker-compose-examples/non-vpn.md)

Any Docker Compose setup can be adapted to include [Mousehole as a sidecar](/docs/compose-setups.md).

#### Unraid

See the [Unraid Installation Guide](/contrib/unraid/README.md) for instructions.

#### From Source

Build the web UI, then run the server:

```bash
cd /path/to/mousehole
bun install
bun run build
bun run start
```

### Step 2: Set Your MAM Cookie

Navigate to the Mousehole web UI at <http://localhost:5010> and paste in your
MAM cookie. See [Getting Your Cookie Value](/docs/getting-your-cookie.md) for a
full walkthrough of how to obtain the cookie from MAM.

## Handling Errors

Even with Mousehole up and running, things can still go wrong that Mousehole
cannot fix automatically. Check out the [error documentation](/docs/errors.md)
for help with troubleshooting.

## Security

See the [security guide](/docs/security-guide.md) for detailed information.

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
[API Documentation](/docs/API.md#get-health)). If you change the port on which
Mousehole listens with the `MOUSEHOLE_PORT` environment variable, make sure to
override the healthcheck command accordingly.

## How It Works

Mousehole runs on a loop. On each **update** (every
`MOUSEHOLE_UPDATE_INTERVAL_SECONDS`), it contacts MAM. If you've configured a
cookie, it sends MAM your current IP through their dynamic-seedbox API — MAM
commits any change, or simply replies "No change" if your IP is already correct.
If you haven't set a cookie yet, the contact just looks up your public IP so you
can see it during setup.

You can trigger an immediate update from the web UI with **Update Now**, and the
dashboard reflects each one live (in this and any other open tab).

## Environment Variables

### Commonly set

- `MOUSEHOLE_AUTH_PASSWORD`: Enables browser login via the web UI login page.
  Set this to a strong password.
- `TZ`: _(Default `Etc/UTC`)_ The timezone identifier for displaying localized
  times. Use the "TZ identifier" column from this
  [list of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
  for valid values. (Not every city is listed! Use one that follows the same
  rules as your location.)

### When hosting beyond localhost

- `MOUSEHOLE_ALLOWED_HOSTS`: Comma-separated allowlist of `Host` header values
  for protected routes. Defaults to `localhost,127.0.0.1,[::1]`. If an entry in
  this list does not have a port, then any port is allowed for that host. But,
  if a port is specified (`localhost:5010`), only that port is allowed. As an
  opt-out, set to `*` to allow any host. See
  [Host Allowlist](/docs/security-guide.md#host-allowlist) for more details.
- `MOUSEHOLE_ALLOWED_ORIGINS`: Comma-separated allowlist of origins permitted to
  make cross-origin requests to mutating routes and the live-update stream. Defaults
  to same-origin only, which only allows the origin that matches the host of the
  request. Values must be exact origins with no path, such as
  `https://mousehole.example.com` or `http://nas.local:5010`. As an opt-out, set
  to `*` to allow any origin. See
  [Origin Allowlist](/docs/security-guide.md#origin-allowlist) for more details.
- `MOUSEHOLE_HTTPS_ONLY_COOKIES`: _(Default `false`)_ Set to `true` to add the
  `Secure` flag to session cookies, preventing browsers from sending them over
  plain HTTP. Enable this when Mousehole is accessed exclusively via HTTPS (e.g.
  behind a reverse proxy). HTTP sessions will not work. See
  [HTTPS-Only Cookies](/docs/security-guide.md#https-only-cookies) for more
  details.
- `MOUSEHOLE_AUTH_TOKEN`: Enables Bearer token authentication for API clients.
  Clients can send HTTP headers in the format `Authorization: Bearer <token>`
  when accessing [API endpoints](/docs/API.md).

### Occasional tuning

- `MOUSEHOLE_PORT`: _(Default `5010`)_ The port on which the HTTP server will
  listen.
- `MOUSEHOLE_UPDATE_INTERVAL_SECONDS`: _(Default `300` (5 minutes))_ The
  interval in seconds between automatic updates. Each one contacts MAM; if your
  IP is unchanged, MAM simply replies "No change", so there's no harm in a
  short interval.
- `MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS`: _(Default `10`)_ How long to wait for
  a response from MAM before aborting the request. Prevents Mousehole from
  hanging when the connection silently stalls (e.g. before the VPN is up).
- `MOUSEHOLE_SESSION_DURATION_SECONDS`: _(Default `604800` (1 week))_ How long a
  browser login session remains valid before expiring. See
  [Session Duration](/docs/security-guide.md#session-duration) for more details.
- `MOUSEHOLE_LOG_LEVEL`: _(Default `info`)_ Log verbosity. Valid values:
  `error`, `warn`, `info`, `debug`.
- `MOUSEHOLE_STATE_DIR_PATH`: _(Default `/var/lib/mousehole`)_ The directory
  where the service will store its internal data.

### Rarely needed

- `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH`: Set to `true` to turn off all
  authentication. Do not use in mixed-trust environments.
- `MOUSEHOLE_USER_AGENT`: _(Default `mousehole-by-timtimtim/<version>`)_ The
  user agent to use for requests to MAM.

## Contributing

Want to contribute? Check out the [contribution guidelines](/CONTRIBUTING.md).

There is also a [`contrib`](/contrib/) directory with useful, supplementary
functionality.

## Links

- [Repository](https://github.com/t-mart/mousehole)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mousehole)
- [Forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257)

## Development

- Start development with:

  ```bash
  bun dev
  ```

  This runs two processes via `concurrently`: the backend (`bun dev:server`,
  restarts on change) and the Vite dev server (`bun dev:web`, hot module
  reloading). Browse the app at <http://localhost:5010/web> — the backend
  reverse-proxies `/web/*` to Vite in development, so the dev URL matches
  production.

- Run tests with `bun check:test`, check types with `bun check:types`, and
  lint with `bun check:lint`.

- New versions can be tagged, released and pushed to Docker Hub by simply
  changing the version in `package.json` and pushing to GitHub. The CI workflows
  will take care of the rest.

## Attribution

Mouse Hole by Sergey Demushkin from
[Noun Project](https://thenounproject.com/term/mouse-hole/) (CC BY 3.0)

## Donate

If my project has helped you out, consider supporting me:

- Sponsor me on [GitHub](https://github.com/sponsors/t-mart)
- Donate BTC to `3NbDsq9mhLAf7mRQ5UqnC5z1UXS8YGJBok`.
