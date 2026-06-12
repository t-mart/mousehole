# Wireguard + qBittorrent Docker Compose Example

[Wireguard](https://www.wireguard.com/) is a lean VPN client, and the image used
here is
[linuxserver/wireguard](https://docs.linuxserver.io/images/docker-wireguard). We
also use
[linuxserver/qBittorrent](https://docs.linuxserver.io/images/docker-qbittorrent)
in this example.

(Gluetun may be easier to set up for beginners. See the
[Gluetun example](/docs/docker-compose-examples/gluetun-qb.md).)

> [!IMPORTANT]
>
> This is just a starting point! You will need to
> [customize](/docs/compose-setups.md) it to your needs.

```yaml
services:
  wireguard:
    image: lscr.io/linuxserver/wireguard:latest
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - "5010:5010" # Mousehole port
      - "8080:8080" # qBittorrent Web UI port
      - "6881:6881/tcp" # qBittorrent TCP torrent port
      - "6881:6881/udp" # qBittorrent UDP torrent port
    # more is needed here -- see linuxserver/wireguard documentation
    restart: unless-stopped

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    network_mode: "service:wireguard"
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      WEBUI_PORT: 8080
      TORRENTING_PORT: 6881
    restart: unless-stopped

  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:wireguard"
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      MOUSEHOLE_AUTH_PASSWORD: replace-with-a-long-random-password
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/var/lib/mousehole"
    restart: unless-stopped

volumes:
  mousehole:
```
