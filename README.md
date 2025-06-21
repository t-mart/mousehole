# Mousehole, a Seedbox IP Updater for MAM

A background service to update a seedbox IP for MaM and an HTTP server to manage
it.

![Mousehole Demo](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/demo.webp)

This can be helpful if you are using a VPN/seedbox to seed and your IP address
is not stable.

Mousehole does the following:

- Regularly updates MAM with the IP address of the host.

  Before an update, Mousehole checks that it actually needs to communicate with
  MAM by fetching the host's current IP address and comparing with the last MAM
  response.

- Provides a frontend website to manage the service, allowing:

  - Setting of the MAM cookie
  - Displaying of status information
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
      - "5010:5010"
    # persist cookie data across container restarts
    volumes:
      - mousehole:/srv/mousehole
    restart: unless-stopped
    healthcheck:
      test: [ "CMD-SHELL", "curl -fs http://localhost:5010/state || exit 1" ]

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
      - "5010:5010"
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
      - mousehole:/srv/mousehole
    restart: unless-stopped
    healthcheck:
      test: [ "CMD-SHELL", "curl -fs http://localhost:5010/state || exit 1" ]

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
bun run src/index.ts
```

## Environment Variables

- `MOUSEHOLE_PORT`: _(Default `5010`)_ The port on which the HTTP server will
  listen.
- `MOUSEHOLE_STATE_DIR_PATH`: _(Default `/srv/mousehole`)_ The directory where
  the service will store its data.
- `MOUSEHOLE_USER_AGENT`: _(Default `mousehole-by-timtimtim/<version>`)_ The
  user agent to use for requests to MaM.
- `MOUSEHOLE_CHECK_INTERVAL_SECONDS`: _(Default `300` (5 minutes))_ The interval
  in seconds between checks. Checks are done locally before talking with MAM.
- `MOUSEHOLE_STALE_RESPONSE_SECONDS`: _(Default `86400` (1 day))_ The number of
  seconds after which a response is considered stale. This is used to determine
  if the last update was successful or not. This ensures that we're still
  talking with MAM at some regular interval and can detect out-of-band changes
  to the cookie.
- `MOUSEHOLE_GET_HOST_IP_URL`: _(Default `https://api.ipify.org?format=json`)_
  The URL to use to get the current IP address of the seedbox. This is used
  during checks to ensure we actually need to update the IP address with MAM.

## First-time setup (or if cookie gets out of sync)

When running this service for the first time (or if the cookie gets out of
sync), you need to set the seedbox cookie manually:

0. Start the server so that it can listen for requests (see "Usage" above).

1. Create a new MaM session.

   Go to the
   [MaM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

   (If you already have a session you want to use here, click "View ASN locked
   session cookie" and proceed to the next step.)

   In the "Create session" section, enter the following values:

   - **IP**: Set to the current IP address of your seedbox.
   - **IP vs ASN locked session**: `ASN`, this allows your IP to change.
   - **Allow Session to set Dynamic Seedbox**: `Yes`, this allows the service to
     update your IP through MaM's API.
   - **Session Label/note**: Set to something that identifies the seedbox, e.g.
     "My Seedbox".

   Then, click "Submit changes!".

2. On the next page, copy the value of the cookie shown.

3. Go to the Mousehole web interface (likely at <http://localhost:5010>) and
   submit this cookie value in the form.

   ![Enter cookie into the form](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/enter-cookie-form.png)

   If you don't see the form, use the "Set Cookie" button.

4. Press the "Check now" button to trigger an immediate check.

    ![Check now](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/check-now-button.png)

5. Et voilà! You should now see the current state of the service, and it
   will continue to update the IP address with MaM automatically.

   You don't need to do anything else! You can close the page.

## Links

- [Repository](https://github.com/t-mart/mousehole)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mousehole)
- [Forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257)

## Attribution

Mouse Hole by Sergey Demushkin from
[Noun Project](https://thenounproject.com/term/mouse-hole/) (CC BY 3.0)
