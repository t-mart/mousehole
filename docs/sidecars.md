# Using Mousehole as a Sidecar with Docker Compose

In VPN setups with Docker Compose, Mousehole needs to run in the same network
stack as the VPN container. This is often called a "sidecar" setup.

The two key points to configuring Mousehole as a sidecar are:

1. Set Mousehole's `network_mode` to the VPN container's service.

2. Expose Mousehole's port (default `5010`) on the VPN container, not on
   Mousehole itself.

Knowing these two points, you can adapt any Docker Compose VPN setup to include
Mousehole as a sidecar.

## Non-Functional but Illustrative Example

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:vpn" # Point 1: Use VPN container's network
    restart: unless-stopped

  vpn:
    image: your-vpn-image:latest
    ports:
      - "5010:5010" # Point 2: Expose Mousehole's port here
```
