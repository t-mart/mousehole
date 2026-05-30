# hotio/qBittorrent + Mousehole Docker Compose Example

[hotio/qbittorrent](https://hotio.dev/containers/qbittorrent/) bundles a
WireGuard VPN client directly into the qBittorrent container, so there is no
separate VPN container. Mousehole attaches to qBittorrent's network namespace as
a sidecar.

This example uses [Mousehole as a sidecar](../sidecars.md).

> [!IMPORTANT]  
> This is just a [starting point](../vpn-complexity.md)! Read documentation for
> the projects involved and adapt this example to your needs. Ask for help from
> the [forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257) or an LLM.
>
> Mousehole stores a MAM session cookie. Keep it bound to localhost unless you
> also configure authentication and explicit Host/Origin allowlists for your
> trusted access path.


```yaml
services:
  qbittorrent:
    image: ghcr.io/hotio/qbittorrent
    cap_add:
      - NET_ADMIN
    ports:
      - "127.0.0.1:5010:5010" # Mousehole port
      - "8080:8080"       # qBittorrent Web UI port
      - "6881:6881/tcp"   # qBittorrent TCP torrent port
      - "6881:6881/udp"   # qBittorrent UDP torrent port
    environment:
      PUID: 1000
      PGID: 1000
      UMASK: "002"
      TZ: Etc/UTC         # Set to your timezone for localization
      WEBUI_PORTS: 8080/tcp
      VPN_ENABLED: "true"
      VPN_CONF: wg0
      VPN_PROVIDER: generic
      VPN_LAN_NETWORK: 192.168.1.0/24 # Set to your LAN subnet
    volumes:
      - qbittorrent-config:/config
      - /path/to/data:/data
    restart: unless-stopped

  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:qbittorrent"
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      MOUSEHOLE_AUTH_PASSWORD: replace-with-a-long-random-password
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/var/lib/mousehole"
    restart: unless-stopped

volumes:
  qbittorrent-config:
  mousehole:
```
