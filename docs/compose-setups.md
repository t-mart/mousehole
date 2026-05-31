# Custom Docker Compose Setups

No documentation can cover every Docker Compose setup — the combinations of
BitTorrent client, VPN provider, and container configurations are endless.

But, you can be successful with Mousehole if you understand the following
concepts.

- [Mousehole as a VPN sidecar](#mousehole-as-a-vpn-sidecar)
- [Reading Documentation](#reading-documentation)
- [Getting More Help](#getting-more-help)

## Mousehole as a VPN Sidecar

To route Mousehole (and your BitTorrent client's) traffic through a VPN tunnel,
Mousehole needs to run on the same network as the VPN container. This is often
called a "sidecar" setup.

You can achieve a sidecar setup by using these Docker Compose attributes.

1. Set the Mousehole container's
   [`network_mode`](https://docs.docker.com/reference/compose-file/services/#network_mode)
   to the VPN container's service with the `service:{name}` syntax.

2. Map Mousehole's port (default `5010`) on the VPN container, not Mousehole's
   container.

If you do that, you can adapt any Docker Compose VPN setup to include Mousehole
as a sidecar.

### Non-Functional but Illustrative Example

```yaml
services:
  mousehole:
    image: tmmrtn/mousehole:latest
    network_mode: "service:vpn" # Point 1: Use VPN container's network
    environment:
      MOUSEHOLE_AUTH_PASSWORD: replace-with-a-long-random-password

  vpn:
    image: your-vpn-image:latest
    ports:
      - "127.0.0.1:5010:5010" # Point 2: Map Mousehole's port on the VPN container
```

See [Port Binding](./security-guide.md#port-binding) in the Security Guide for
why the `127.0.0.1:` prefix in the port mapping matters.

## Reading Documentation

There are many technologies involved in a VPN + BitTorrent + Mousehole setup. If
you are new to this, it can be overwhelming. But, don't fret. Take it one step
at a time. Read the documentation for each project involved. Here are some
examples.

- [YAML Reference](https://yaml.org/spec/1.2/spec.html) or
  [YAML cheatsheet](https://quickref.me/yaml.html) for understanding the syntax
  of Docker Compose files.
- [Docker Compose file reference](https://docs.docker.com/reference/compose-file/),
  especially the
  [services section reference](https://docs.docker.com/reference/compose-file/services/).
- Your VPN client container's documentation, such as
  [Gluetun's readme](https://github.com/passteque/gluetun) and
  [Gluetun's wiki](https://github.com/qdm12/gluetun-wiki#table-of-contents) or
  the
  [linuxserver/wireguard documentation](https://docs.linuxserver.io/images/docker-wireguard/).
  Find the official page for your container and read it thoroughly.

## Getting More Help

If you're still stuck after reading documentation, try these resources.

- The [forum post](https://www.myanonamouse.net/f/t/84712/p/p1013257) is a great
  place to ask for help and see how others have set up Mousehole.
- LLMs can be helpful for troubleshooting and understanding documentation.
  Provide them as much context as possible.
