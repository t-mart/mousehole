# mam-vpn-ip-updater

A simple service to update a seedbox IP for MaM when your seedbox IP can change.

This can be helpful if you are using a VPN to seed (where IP addresses are not
often stable) or if you are using a seedbox that does not have a static IP
address.

This server does two things:

- Every 61 minutes, call the MaM API to set your current IP address. (The
  minimum frequency for this is 60 minutes, so we add a minute to avoid hitting
  the API at the exact same time every hour.)
- Provide an HTTP server:

  - `GET` `/update-ip`: Manually triggers an update of the IP address.

    Example `curl`:

    ```
    curl http://localhost:5010/update-ip
    ```

  - `GET` `/status`: Returns information about the last update to your IP
    address. The return code reflect the success of the last update:

    Example `curl`:

    ```
    curl http://localhost:5010/status
    ```

  - `PUT` `/set-cookie`: Updates the seedbox cookie with a new value. Useful
    when bootstrapping the service or when things get out of sync. Get this
    value from your
    [MaM Security Settings page](https://www.myanonamouse.net/preferences/index.php?view=security).

    Example `curl`:

    ```bash
    curl -X PUT http://localhost:5010/set-cookie -d "new_cookie_value"
    ```

## Usage

Run the server with:

```bash
bun run src/index.ts
```

Or, with Docker Compose:

```yaml
services:
  mam-vpn-ip-updater:
    image: tmmrtn/mam-vpn-ip-updater:latest
    ports:
      - "5010:5010"
    volumes:
      - "<some local path>:/mam-vpn-ip-updater/state"
    restart: unless-stopped
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

5. Voila! Your seedbox IP address is now set up and will be updated every 61
   minutes automatically.