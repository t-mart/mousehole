# Mousehole, a Seedbox IP Updater for MaM

A background service to update a seedbox IP for MaM on a schedule and an HTTP
server to manage it.

![Mousehole Overview](https://raw.githubusercontent.com/t-mart/mousehole/master/docs/overview.png)

This can be helpful if you are using a VPN/seedbox to seed and your IP address
is not stable.

This server does two things:

- Every 61 minutes, call the MaM API to set your current IP address. (The
  minimum frequency for this is 60 minutes, so we add a minute to avoid hitting
  the API at the exact same time every hour.)
- Provide an HTTP server with management endpoints:

  - `PUT` `/setCookie`: Updates the seedbox cookie with a new value. Useful when
    bootstrapping the service or when things get out of sync. Get this value
    from your
    [MaM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security)
    and/or see the tutorial below for how to get one.

    Example `curl`:

    ```bash
    curl -X PUT http://localhost:5010/setCookie -d "new_cookie_value"
    ```

    Example responses:

    <details>

      <summary>Success Response</summary>

      ```json
      {
        "success": true,
        "message": "Cookie value updated"
      }
      ```

    </details>

    <details>

      <summary>Missing Cookie Response</summary>

      ```json
      {
        "success": false,
        "message": "Cookie value is required"
      }
      ```

    </details>

  - `POST` `/updateIp`: Manually triggers an update of the IP address.

    Example `curl`:

    ```
    curl -X POST http://localhost:5010/updateIp
    ```

    Example responses:
    
    <details>

      <summary>Success Response</summary>

      ```json
      {
        "success": true,
        "message": "IP updated successfully",
        "responseWithMetadata": {
          "response": {
            "Success": true,
            "msg": "Completed",
            "ip": "123.123.123.123",
            "ASN": 12345,
            "AS": "MegaCorp"
          },
          "metadata": {
            "request": {
              "datetime": "2025-06-14T09:19:46.311+00:00[UTC]",
              "timestampMilliseconds": 1749892786311,
              "cookieValue": "<redacted>"
            },
            "response": {
              "httpStatus": 429,
              "cookieValue": "<redacted>"
            }
          }
        }
      }
      ```

    </details>

    <details>

      <summary>Last change too recent</summary>

      ```json
      {
        "success": false,
        "message": "Failed to update IP",
        "responseWithMetadata": {
          "response": {
            "Success": false,
            "msg": "Last change too recent",
            "ip": "123.123.123.123",
            "ASN": 12345,
            "AS": "MegaCorp"
          },
          "metadata": {
            "request": {
              "datetime": "2025-06-14T09:19:46.311+00:00[UTC]",
              "timestampMilliseconds": 1749892786311,
              "cookieValue": "<redacted>"
            },
            "response": {
              "httpStatus": 429,
              "cookieValue": "<redacted>"
            }
          }
        }
      }
      ```

    </details>

  - `GET` `/status`: Returns information about the latest update to your IP
    address. The return code reflects the success of the latest update:

    Example `curl`:

    ```
    curl http://localhost:5010/status
    ```

    Example responses:

    <details>

      <summary>Success Response</summary>

      ```json
      {
        "success": true,
        "message": "Latest update was successful",
        "responseWithMetadata": {
          "response": {
            "Success": true,
            "msg": "Completed",
            "ip": "123.123.123.123",
            "ASN": 12345,
            "AS": "MegaCorp"
          },
          "metadata": {
            "request": {
              "datetime": "2025-06-14T09:19:46.311+00:00[UTC]",
              "timestampMilliseconds": 1749892786311,
              "cookieValue": "<redacted>"
            },
            "response": {
              "httpStatus": 429,
              "cookieValue": "<redacted>"
            }
          }
        },
        "nextAutoUpdate": {
          "datetime": "2025-06-14T10:19:46.311+00:00[UTC]",
          "timestampMilliseconds": 1749892786311
        }
      }
      ```

    </details>

    <details>

      <summary>ASN Mismatch</summary>

      ```json
      {
        "success": false,
        "message": "Failed to update IP",
        "responseWithMetadata": {
          "response": {
            "Success": false,
            "msg": "Invalid session - ASN mismatch",
            "ip": "123.123.123.123",
            "ASN": 12345,
            "AS": "MegaCorp"
          },
          "metadata": {
            "request": {
              "datetime": "2025-06-14T09:19:46.311+00:00[UTC]",
              "timestampMilliseconds": 1749892786311,
              "cookieValue": "<redacted>"
            },
            "response": {
              "httpStatus": 429,
              "cookieValue": "<redacted>"
            }
          }
        },
        "nextAutoUpdate": {
          "datetime": "2025-06-14T10:19:46.311+00:00[UTC]",
          "timestampMilliseconds": 1749892786311
        }
      }
      ```

    </details>    

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
- `MOUSEHOLE_USER_AGENT`: _(Default `mousehole-by-timtimtim`)_ The user agent to
  use for requests to MaM.
- `MOUSEHOLE_UPDATE_INTERVAL_MILLISECONDS`: _(Default `3660000`)_ The interval
  in milliseconds at which the service will update the IP address.
- `MOUSEHOLE_TZ`: _(Default `UTC`)_ The timezone to use for the service. This is
  used to format the datetimes in endpoint responses and logs.

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

3. Issue an HTTP `PUT` request to the `/setCookie` endpoint with the value of
   the cookie you copied in the previous step.

   Example `curl`:

   ```bash
   curl -X PUT http://localhost:5010/setCookie -d "your_cookie_value"
   ```

   The response should be `{"success":true,"message":"Cookie value updated"}`.

4. Now you can trigger a manual update of the IP address by issuing an HTTP
   `POST` request to the `/updateIp` endpoint.

   Example `curl`:

   ```bash
   curl -X POST http://localhost:5010/updateIp
   ```

   The response will indicate its success or failure.

5. Et voilà! Your seedbox IP address is now set up and will be updated every 61
   minutes automatically. At any time, you can check the status of the last
   update or manually trigger an update using the `/status` and `/updateIp`
   endpoints, respectively.

## Links

- [Repository](https://github.com/t-mart/mousehole)
- [Docker Hub image](https://hub.docker.com/r/tmmrtn/mousehole)
