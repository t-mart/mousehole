# Running Mousehole on Unraid

The Unraid template at [`my-mousehole.xml`](/contrib/unraid/my-mousehole.xml)
can be placed on your Unraid server to pre-fill Mousehole's settings in the
**Add Container** screen. Install it manually with the steps below.

## Prerequisites

- SSH or terminal access or terminal access to your Unraid server
- An already-running VPN container for Mousehole to route through, such as
  [Gluetun](https://github.com/passteque/gluetun),
  [WireGuard](https://docs.linuxserver.io/images/docker-wireguard/), or
  [Hotio](https://hotio.dev/containers/qbittorrent/).

## Installation

### Get the Template

1. Get to a terminal on your Unraid server, such as through SSH or the web UI's
   terminal.
2. Download the template into Unraid's user-templates directory:
   ```bash
   cd /boot/config/plugins/dockerMan/templates-user/
   wget https://raw.githubusercontent.com/t-mart/mousehole/master/contrib/unraid/my-mousehole.xml
   ```

### Add the Container

1. In the web UI, open the **Docker** tab and click **Add Container**.
2. Choose **Mousehole** from the **Template** dropdown.
3. Fill in the fields. You may want to set:
   - **Network Type** to your VPN container.
   - **WebUI Port** to `5010` (or your preferred port, but keep it consistent
     with the port you publish on your VPN container).
   - **Auth Password** to a long, random password.
   - **Timezone** to your timezone identifier
   - **Allowed Hosts** if you want to access Mousehole on a custom domain.

   Most other fields can be left at their defaults, but feel free to adjust as
   needed. See the [environment variable documentation](/README.md) and the
   [Security Guide](/docs/security-guide.md) for more details on how to set
   these fields.

4. Click **Apply**.

### Publish the Port on Your VPN Container

Setting **Network Type** to your VPN container means that you must now publish
Mousehole's port on that VPN container.

1. Open the **Docker** tab, click your **VPN container**, and choose **Edit**.
2. Click **Add another Path, Port, Variable, Label or Device**.
3. Set **Config Type** to **Port**, then set both **Container Port** and **Host
   Port** to `5010` (match whatever you used for Mousehole's **WebUI Port**).
4. Click **Apply**. Unraid recreates the VPN container with the new mapping,
   which briefly restarts it.
5. Restart the Mousehole container to connect to the VPN container's new network
   configuration.
6. Reach Mousehole at `http://<your-unraid-ip>:5010`.

## Network Troubleshooting with Appdata.Backup plugin

If Mousehole encounters network issues after the Appdata.Backup plugin runs, you
may have a container lifecycle issue. See
[Failed Network Requests after Restarting VPN Container](/docs/network-troubleshooting.md#failed-network-requests-after-restarting-vpn-container)
