# Network Troubleshooting

Mousehole is often placed in configuration-heavy network setups. If that network
configuration is broken, then so is Mousehole. Use the steps below to find out
where the problem actually is before filing an issue.

- [Failed Network Requests](#failed-network-requests)
- [Failed Network Requests at Startup](#failed-network-requests-at-startup)
- [Failed Network Requests after Restarting VPN Container](#failed-network-requests-after-restarting-vpn-container)
- [Cannot Reach the Web UI](#cannot-reach-the-web-ui)
- [Cannot Reach the Web UI from Other Devices on Network](#cannot-reach-the-web-ui-from-other-devices-on-network)

> [!NOTE]
>
> For MAM-specific errors (`ASN mismatch` or `Last Change Too Recent`), see the
> [MAM error documentation](/docs/mam-errors.md). For errors related to `Host`
> and `Origin` headers, see the [security guide](/docs/security-guide.md).

## Failed Network Requests

**Symptom**: For sustained periods of time, Mousehole has network errors in the
server logs.

**Cause**: The VPN tunnel is down, blocked, or misconfigured.

**How to fix**: You first need to determine if the problem is with Mousehole or
with the VPN tunnel.

One way to do this is to add a test container to your stack that loops requests
through the same VPN network Mousehole uses.

```yaml
netcheck:
  image: curlimages/curl:latest
  network_mode: "service:<vpn-service>" # replace with your VPN container's service name
  entrypoint:
    - sh
    - -c
    - while true; do date -Iseconds; curl -fsS -m 10 https://api.ipify.org ||
      echo "*** request FAILED ***"; echo; sleep 5; done
  restart: unless-stopped
```

Start it and watch the logs with `docker compose logs -f netcheck`. (Don't
forget to remove it after testing!)

Then, interpret the output:

| Output                                                     | Meaning                    | How to fix                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steady stream of IP addresses                              | Tunnel is healthy          | Network is configured properly. If you still have problems, open an issue.                                                                                                    |
| The IP shown is your home/ISP IP                           | Tunnel is leaking          | Fix VPN configuration. See your VPN container docs. Ensure Mousehole is [running as a sidecar](/docs/compose-setups.md#mousehole-as-a-vpn-sidecar).                           |
| `request FAILED` lines                                     | Tunnel is down or blocked  | Fix the VPN configuration. See your VPN container docs. Also check if a [container lifecycle issue](#failed-network-requests-after-restarting-vpn-container) may be at fault. |
| `request FAILED` lines only at startup                     | Tunnel is initializing     | See [Failed Network Requests at Startup](#failed-network-requests-at-startup)                                                                                                 |
| `request FAILED` lines only after restarting VPN container | Tunnel is gone             | See [Failed Network Requests after Restarting VPN Container](#failed-network-requests-after-restarting-vpn-container)                                                         |
| IP keeps changing                                          | Tunnel is changing network | Unstable VPN. Expect MAM `429` errors from frequent IP changes.                                                                                                               |

## Failed Network Requests at Startup

**Symptom**: Mousehole has network errors at startup, but then works fine after.

**Cause**: Mousehole attached to the VPN network before the tunnel was ready.

**How to fix**: This isn't something that _needs_ fixing, but you can make it
smoother controlling the order of startup with Compose's
[`depends_on` and `condition: service_healthy`](https://docs.docker.com/reference/compose-file/services/#depends_on)
attributes. The
[gluetun-qbittorrent example](/docs/docker-compose-examples/gluetun-qb.md)
demonstrates this.

## Failed Network Requests after Restarting VPN Container

**Symptom**: After restarting the VPN container, Mousehole has network errors.

**Cause**: The network that Mousehole is attached to no longer has a VPN tunnel.

**How to fix**: Restart the Mousehole container. In a sidecar setup, if the
"main" container (VPN) restarts, the sidecar (Mousehole) must be restarted too
to re-attach to the network with the tunnel.

This especially applies to **Unraid** users that use the **Appdata.Backup
plugin**, which recreates containers when restoring. See the
[plugin's support thread](https://forums.unraid.net/topic/137710-plugin-appdatabackup/#:~:text=The%20plugin%20sent%20me%20here%20for%20help%20with%20the%20grouping%20function)
for an automated way of doing this safely under the heading "The plugin sent me
here for help with the grouping function".

## Cannot Reach the Web UI

**Symptom**: The container is running but the browser will not load the web UI.

**Cause**: In a sidecar setup the port must be published on the VPN container,
not on Mousehole. (Or, URL is wrong.)

**How to fix**: Map `5010` on the VPN service. See
[Mousehole as a VPN Sidecar](/docs/compose-setups.md#mousehole-as-a-vpn-sidecar).
Ensure correct URL.

## Cannot Reach the Web UI from Other Devices on Network

**Symptom**: The web UI loads on the host where the container is running, but
not on other devices.

**Cause**: The port is only bound to localhost or a firewall is blocking
incoming connections.

**How to fix**:

- Ensure you are binding port `5010` to all interfaces, not just localhost. See
  [Port Binding](/docs/security-guide.md#port-binding).
- Possibly a firewall issue. You need to allow incoming connections to port
  `5010` on the host machine. The steps to do this depend on your OS and
  firewall software.
