# Mousehole, a Seedbox IP Updater for MAM

A background service to update a seedbox IP for MAM and an HTTP server to manage
it.

![Mousehole Demo](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/demo.webp)

This can be helpful if you are using a host/VPN/seedbox to seed and its IP
address is not stable.

Features:

- Regularly updates MAM with the IP address of the host.

  Before an update, Mousehole checks that it actually needs to communicate with
  MAM by fetching the host's current IP address and comparing with the last MAM
  response.

- Provides a frontend website to manage the service, allowing:

  - Setting your MAM cookie
  - Displaying status information
  - Manual triggering of checks

- Provide an HTTP server with management endpoints

  See [API.md](https://github.com/t-mart/mousehole/blob/master/docs/API.md) for
  details.

## Usage

### Docker Compose

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    ports:
      - "127.0.0.1:5010:5010"  # or just "5010:5010" if you want it accessible to the outside world too
    # persist cookie data across container restarts
    volumes:
      - "mousehole:/srv/mousehole"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:5010/state || exit 1"]

volumes:
  mousehole:
```

If you intend to run this service alongside a VPN container to tunnel your
connection, it is imperative that you run mousehole in the same network as the
VPN container.

Example with WireGuard and qBittorrent Docker Compose stack:

```yaml
services:
  wireguard:
    image: lscr.io/linuxserver/wireguard:latest

    # configure as necessary, see https://docs.linuxserver.io/images/docker-wireguard

    ports:
      # anything that wants to use the wireguard network must expose ports here, such as
      # bittorrent port, webui port, and mousehole http port
      - "127.0.0.1:5010:5010"  # or just "5010:5010" if you want it accessible to the outside world too
      # - <bittorrent port>:<bittorrent port>
      # - <webui port>:<webui port>

    # optional - healthcheck to ensure the VPN is up. replace `airvpn` with your VPN interface name
    healthcheck:
      test: ["CMD-SHELL", "wg show airvpn | grep -q 'latest handshake'"]

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest

    # configure as necessary, see https://docs.linuxserver.io/images/docker-qbittorrent

    # CRITICAL - Use wireguard container's network stack
    network_mode: "service:wireguard"

    # optional - only run after wireguard is healthy
    # depends_on:
    #   wireguard:
    #     condition: service_healthy

  mousehole:
    image: tmmrtn/mousehole:latest

    # CRITICAL - Use wireguard container's network stack
    network_mode: "service:wireguard"

    # persist cookie data across container restarts
    volumes:
      - "mousehole:/srv/mousehole"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:5010/state || exit 1"]

    # optional - only run after wireguard is healthy
    # depends_on:
    #   wireguard:
    #     condition: service_healthy

volumes:
  mousehole:
```

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
  we're still talking with MAM at some regular interval and ensures we can
  detect out-of-band changes to the cookie.

## First-time setup (or if cookie gets out of sync)

When running this service for the first time (or if the cookie gets out of
sync), you need to set the Mousehole's cookie manually.

On navigating to the Mousehole web interface, you will see a form to set the
cookie -- paste your cookie and click the "Set" button.

![Mousehole Cookie Form](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/cookie-form.png)


If you need help getting the cookie, click the "What do I enter here?" button
for a tutorial.

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
