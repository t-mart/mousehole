# Non-VPN Docker Compose Example

<!-- prettier-ignore -->
> [!WARNING]
> Most users will not want to use this example because it does not use a VPN.

This example runs Mousehole without a VPN. Therefore, it is only suitable if you
are running your bittorrent client on the host machine or in another container
without a VPN.

<!-- prettier-ignore -->
> [!IMPORTANT]  
> This is just a starting point! You will need to
> [customize](../compose-setups.md) it to your needs.

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
      MOUSEHOLE_AUTH_PASSWORD: replace-with-a-long-random-password
    ports:
      - "127.0.0.1:5010:5010" # Mousehole port
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/var/lib/mousehole"
    restart: unless-stopped

volumes:
  mousehole:
```
