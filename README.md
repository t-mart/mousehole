# mam-vpn-ip-updater

A background service to update a seedbox IP for MaM when your seedbox IP can
change and an HTTP server to manage it.

This can be helpful if you are using a VPN/seedbox to seed and your IP address
is not stable.

This server does two things:

- Every 61 minutes, call the MaM API to set your current IP address. (The
  minimum frequency for this is 60 minutes, so we add a minute to avoid hitting
  the API at the exact same time every hour.)
- Provide an HTTP server with management endpoints:

  - `GET` `/update-ip`: Manually triggers an update of the IP address.

    Example `curl`:

    ```
    curl http://localhost:5010/update-ip
    ```

  - `GET` `/status`: Returns information about the last update to your IP
    address. The return code reflects the success of the last update:

    Example `curl`:

    ```
    curl http://localhost:5010/status
    ```

  - `PUT` `/set-cookie`: Updates the seedbox cookie with a new value. Useful
    when bootstrapping the service or when things get out of sync. Get this
    value from your [MaM Security Settings
    page](https://www.myanonamouse.net/preferences/index.php?view=security)
    and/or see the tutorial below for how to get one.

    Example `curl`:

    ```bash
    curl -X PUT http://localhost:5010/set-cookie -d "new_cookie_value"
    ```

## Usage

Run the server with:

```bash
bun run src/index.ts
```

Or, with Docker Compose with the [Docker Hub image](https://hub.docker.com/r/tmmrtn/mam-vpn-ip-updater):

```yaml
services:
  mam-vpn-ip-updater:
    image: tmmrtn/mam-vpn-ip-updater:latest
    ports:
      - "5010:5010"
```

### With a VPN Container

If you intend to run this service alongside a VPN container to tunnel your
connection, it is imperative that you run mam-vpn-ip-updater in the same network
as the VPN container.

Example with WireGuard and qBittorrent Docker Compose stack:

```yaml
services:
  wireguard:
    image: lscr.io/linuxserver/wireguard:latest

    # configure as necessary, see https://docs.linuxserver.io/images/docker-wireguard

    ports:
      # anything that wants to use the wireguard network must expose ports here, such as
      # bittorrent port, webui port, and mam-vpn-ip-updater http port
      - "5010:5010" # mam-vpn-ip-updater HTTP port
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

  mam-vpn-ip-updater:
    image: tmmrtn/mam-vpn-ip-updater:latest
    
    # CRITICAL - Use wireguard container's network stack
    network_mode: "service:wireguard"
    
    # optional - only run after wireguard is healthy
    # depends_on:
    #   wireguard:
    #     condition: service_healthy
```

## First-time setup (or if cookie gets out of sync)

When running this service for the first time (or if the cookie gets out of
sync), you need to set the seedbox cookie manually:

0. Start the server so that it can listen for requests (see "Usage" above).

1. Create a new MaM session for the seed.

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

3. Issue an HTTP `PUT` request to the `/set-cookie` endpoint with the value of
   the cookie you copied in the previous step.

   Example `curl`:

   ```bash
   curl -X PUT http://localhost:5010/set-cookie -d "your_cookie_value"
   ```

   The response should be something like `{"message":"Cookie value updated"}`.

4. Now you can trigger a manual update of the IP address by issuing an HTTP
   `GET` request to the `/update-ip` endpoint.

   Example `curl`:

   ```bash
   curl http://localhost:5010/update-ip
   ```

   The response will indicate its success or failure.

5. Et voilà! Your seedbox IP address is now set up and will be updated every 61
   minutes automatically. At any time, you can check the status of the last
   update or manually trigger an update using the `/status` and `/update-ip`
   endpoints, respectively.

## Links

- [Repository](https://github.com/t-mart/mam-vpn-ip-updater)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mam-vpn-ip-updater)
