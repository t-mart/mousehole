# Gluetun + qBittorrent Docker Compose Example

[Gluetun](https://github.com/qdm12/gluetun) is a VPN client container with
support for many providers. This example also uses
[linuxserver/qbittorrent](https://docs.linuxserver.io/images/docker-qbittorrent).

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
  gluetun:
    image: qmcgaw/gluetun:latest
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - "127.0.0.1:5010:5010" # Mousehole port
      - "8080:8080" # qBittorrent Web UI port
      - "6881:6881/tcp" # qBittorrent TCP torrent port
      - "6881:6881/udp" # qBittorrent UDP torrent port
    environment:
      VPN_SERVICE_PROVIDER: "your-vpn-provider"
      FIREWALL_VPN_INPUT_PORTS: "6881" # qBittorrent torrent
      # more is needed here -- see Gluetun documentation
      # https://github.com/qdm12/gluetun-wiki
      # https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers
    restart: unless-stopped

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    network_mode: "service:gluetun"
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      WEBUI_PORT: 8080
      TORRENTING_PORT: 6881
    restart: unless-stopped

  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:gluetun"
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
