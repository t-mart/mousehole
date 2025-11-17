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

If you intend to run Mousehole alongside a VPN container (sometimes called a
"sidecar"), you need to ensure that:

- Mousehole uses the VPN container's network stack

  With Docker Compose, this is done by setting
  `network_mode: "service:<vpn-service-name>"`

- The _VPN container_ exposes Mousehole's port (default `5010`). Don't expose it
  on Mousehole itself!

<details>

<summary>Example with Wireguard + qBittorrent + Mousehole</summary>

This example uses
[LinuxServer.io's Wireguard](https://docs.linuxserver.io/images/docker-wireguard)
and [qBittorrent](https://docs.linuxserver.io/images/docker-qbittorrent)
containers.

You will likely need more configuration than shown here for Wireguard and
qBittorrent -- see these containers' documentation for details.

```yaml
services:
  wireguard:
    image: lscr.io/linuxserver/wireguard:latest
    ports:
      # IMPORTANT - expose Mousehole's port here
      - "127.0.0.1:5010:5010" # or just "5010:5010" for access from beyond the local host
      # List other ports here too, such as qBittorrent's port torrent port and web UI port

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest

    # IMPORTANT - Use wireguard container's network
    network_mode: "service:wireguard"

    depends_on:
      wireguard:
        condition: service_started

  mousehole:
    image: tmmrtn/mousehole:latest

    # IMPORTANT - Use wireguard container's network
    network_mode: "service:wireguard"

    environment:
      TZ: Etc/UTC # Set to your timezone for localization

    volumes:
      # persist cookie data across container restarts
      - "mousehole:/srv/mousehole"
    restart: unless-stopped

    depends_on:
      wireguard:
        condition: service_started

volumes:
  mousehole:
```

</details>

<details>

<summary>Non-VPN Example</summary>

While this example is the simplest, it **will not** work with VPN containers,
which is what most users will want. Skip this one if you are using a VPN
container.

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
    ports:
      - "127.0.0.1:5010:5010" # or just "5010:5010" for access from beyond the local host
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/srv/mousehole"
    restart: unless-stopped

volumes:
  mousehole:
```

</details>

#### Unraid

See the [Unraid Installation Guide](./contrib/unraid/README.md) for
instructions.

### Docker Tags

Mousehole publishes several image tags to
[Docker Hub](https://hub.docker.com/r/tmmrtn/mousehole):

- SemVer versions (`0`, `0.1`, `0.1.11`, etc)
- `latest`, the latest released version
- `edge`, the tip of `master` branch

Choose `latest` if you do not know which to pick.

### Local

Run the server with:

```bash
bun run start
```

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

## Setting Your MAM Cookie

When running this service for the first time (or if the cookie gets out of
sync), you need to set the Mousehole's cookie manually.

On navigating to the Mousehole web interface, you will see a form to set the
cookie -- paste your cookie and click the "Set" button.

![Mousehole Cookie Form](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/images/cookie-form.png)

If you need help getting the cookie, click the "What do I enter here?" button
for a tutorial.

## Proxying

Mousehole works great with reverse proxies like
[Nginx Proxy Manager](https://nginxproxymanager.com/).

However, the Web UI makes use of WebSockets, so you need to ensure that your
reverse proxy is configured to use them.

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
