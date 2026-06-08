# binhex/arch-qbittorrentvpn + Mousehole Docker Compose Example

[binhex/arch-qbittorrentvpn](https://github.com/binhex/arch-qbittorrentvpn)
bundles qBittorrent with an OpenVPN or WireGuard client in a single container.
Mousehole attaches to its network namespace as a sidecar.

> [!IMPORTANT]
>
> This is just a starting point! You will need to
> [customize](../compose-setups.md) it to your needs.

```yaml
services:
  qbittorrentvpn:
    image: binhex/arch-qbittorrentvpn:latest
    privileged: true
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    ports:
      - "5010:5010" # Mousehole port
      - "8080:8080" # qBittorrent Web UI port
    environment:
      PUID: 1000
      PGID: 1000
      TZ: Etc/UTC # Set to your timezone for localization
      VPN_ENABLED: "yes"
      VPN_CLIENT: wireguard
      VPN_PROV: custom # or pia, airvpn, protonvpn
      VPN_USER: "" # not required for custom WireGuard configs
      VPN_PASS: "" # not required for custom WireGuard configs
      LAN_NETWORK: 192.168.1.0/24 # Set to your LAN subnet
      WEBUI_PORT: 8080
      VPN_INPUT_PORTS: 5010 # Allow LAN access to Mousehole's port through binhex's firewall
    volumes:
      - qbittorrentvpn-config:/config
      - /path/to/data:/data
    restart: unless-stopped

  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:qbittorrentvpn"
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      MOUSEHOLE_AUTH_PASSWORD: replace-with-a-long-random-password
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/var/lib/mousehole"
    restart: unless-stopped

volumes:
  qbittorrentvpn-config:
  mousehole:
```
