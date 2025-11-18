# Mousehole, a Seedbox IP Updater for MAM

A background service to update a seedbox IP for MAM and an HTTP server to manage
it.

![Mousehole Demo](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/demo.webp)

This can be helpful if you are using a host/VPN/seedbox to seed and its IP
address is not stable.

Features:

- Background service that regularly updates MAM with the IP address of the host.

  Before an update, Mousehole checks that it actually needs to update by
  comparing the host's current IP address and AS and with the last MAM response.

- Frontend website to manage the service, allowing:

  - Setting your MAM cookie
  - Displaying status information
  - Manual triggering of checks

- API server with management endpoints.

  See [API.md](https://github.com/t-mart/mousehole/blob/master/docs/API.md) for
  details.

## Getting Started

To use Mousehole, you need to:

1. [Run the service](#running-the-service)
2. [Set your MAM cookie via the web interface](#setting-your-mam-cookie)

### Running the service

#### Docker Compose (recommended)

Mousehole releases Docker images to
[Docker Hub](https://hub.docker.com/r/tmmrtn/mousehole) as part of its CI
process.

See [Docker Tags](#docker-tags) section for available tags.

Starter Docker Compose examples:

- [Gluetun + qBittorrent + Mousehole](docs/docker-compose-examples/gluetun-qb.md)
- [Wireguard + qBittorrent + Mousehole](docs/docker-compose-examples/wireguard-qb.md)
- [Non-VPN Example](docs/docker-compose-examples/non-vpn.md)

Any VPN setup can be adapted to include Mousehole as a sidecar. See
[Using Mousehole as a Sidecar with Docker Compose](docs/sidecars.md) for
details.

#### Unraid

See the [Unraid Installation Guide](./contrib/unraid/README.md) for
instructions.

#### Local

Run the server with:

```bash
bun run start
```

### Setting Your MAM Cookie

Once Mousehole is running, navigate to its web UI at `http://<host>:5010` in
your browser. This is likely to be <http://localhost:5010> if you are running it
locally.

When running for the first time (or if the cookie gets out of sync), you need to
set Mousehole's cookie manually.

On navigating to the Mousehole web interface, you will see a form to set the
cookie -- paste your cookie and click the "Set" button.

![Mousehole Cookie Form](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/cookie-form.png)

If you need help getting the cookie, click the "What do I enter here?" button
for a tutorial.

## Docker Tags

Mousehole publishes several image tags to
[Docker Hub](https://hub.docker.com/r/tmmrtn/mousehole):

- SemVer versions (`0`, `0.1`, `0.1.11`, etc)
- `latest`, the latest released version
- `edge`, the tip of `master` branch
- Pull requests targeting `master` for testing, tagged as `pr-<number>`

Choose `latest` if you do not know which to pick.

## Environment Variables

- `MOUSEHOLE_PORT`: _(Default `5010`)_ The port on which the HTTP server will
  listen.
- `MOUSEHOLE_STATE_DIR_PATH`: _(Default `/srv/mousehole`)_ The directory where
  the service will store its data.
- `MOUSEHOLE_USER_AGENT`: _(Default `mousehole-by-timtimtim/<version>`)_ The
  user agent to use for requests to MAM.
- `MOUSEHOLE_CHECK_INTERVAL_SECONDS`: _(Default `300` (5 minutes))_ The interval
  in seconds between checks.
- `MOUSEHOLE_STALE_RESPONSE_SECONDS`: _(Default `86400` (1 day))_ The number of
  seconds after which a MAM response is considered stale. This ensures that
  Mousehole is still talking with MAM at some regular interval and is detecting
  out-of-band changes to the cookie.
- `TZ`: _(Default `Etc/UTC`)_ The timezone for displaying localized times.

## Contributing

Want to contribute? Check out the [contribution guidelines](./CONTRIBUTING.md).

There is also a [`contrib`](./contrib/) directory with useful, supplementary
functionality.

## Links

- [Repository](https://github.com/t-mart/mousehole)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mousehole)
- [Forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257)

## Development

- Start the dev server with:

  ```bash
  bun run dev
  ```

- New versions can be tagged, released and pushed to Docker Hub by simply
  changing the version in `package.json` and pushing to GitHub. The CI workflows
  will take care of the rest.

## Attribution

Mouse Hole by Sergey Demushkin from
[Noun Project](https://thenounproject.com/term/mouse-hole/) (CC BY 3.0)
