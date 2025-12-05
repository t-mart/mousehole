# Wireguard + qBittorrent Docker Compose Example

[Wireguard](https://www.wireguard.com/) is a lean VPN client, and the image used
here is
[linuxserver/wireguard](https://docs.linuxserver.io/images/docker-wireguard). We
also use
[linuxserver/qBittorrent](https://docs.linuxserver.io/images/docker-qbittorrent)
in this example.

(Gluetun may be easier to set up for beginners. See the
[Gluetun example](gluetun-qb.md).)

This example uses [Mousehole as a sidecar](../sidecars.md).

> [!IMPORTANT]  
> This is just a starting point! Read documentation for the projects involved
> and adapt this example to your needs. Ask for help from the
> [forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257) or an LLM.

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
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/srv/mousehole"
    restart: unless-stopped

volumes:
  mousehole:
```
