# Non-VPN Docker Compose Example

> [!WARNING]
> Most users will not want to use this example because it does not use a VPN.

This example runs Mousehole without a VPN. Therefore, it is only suitable if you
are running your bittorrent client on the host machine or in another container
without a VPN.

> [!IMPORTANT]  
> This is just a starting point! Read documentation for the projects involved
> and adapt this example to your needs. Ask for help from the
> [forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257) or an LLM.

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    environment:
      TZ: Etc/UTC # Set to your timezone for localization
    volumes:
      # persist cookie data across container restarts
      - "mousehole:/srv/mousehole"
    restart: unless-stopped

volumes:
  mousehole:
```
