# hotio/qBittorrent + Mousehole Docker Compose Example

[hotio/qbittorrent](https://hotio.dev/containers/qbittorrent/) bundles a
WireGuard VPN client directly into the qBittorrent container, so there is no
separate VPN container. Mousehole attaches to qBittorrent's network namespace as
a sidecar.

> [!IMPORTANT]
>
> This is just a starting point! You will need to
> [customize](../compose-setups.md) it to your needs.

```yaml
services:
  qbittorrent:
    image: ghcr.io/hotio/qbittorrent
    cap_add:
      - NET_ADMIN
    ports:
      - "5010:5010" # Mousehole port
      - "8080:8080" # qBittorrent Web UI port
      - "6881:6881/tcp" # qBittorrent TCP torrent port
      - "6881:6881/udp" # qBittorrent UDP torrent port
    environment:
      PUID: 1000
      PGID: 1000
      UMASK: "002"
      TZ: Etc/UTC
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
