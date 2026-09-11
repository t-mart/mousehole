# Incoming connectivity check

A read-only diagnostic for a Docker stack in which Mousehole and qBittorrent
share a VPN container's network namespace and the VPN provides NAT-PMP port
forwarding. It compares the IP MAM sees with the forwarding gateway's current
external IP, then lets a separate machine test the actual BitTorrent endpoint.

A successful Mousehole update confirms that MAM accepted the update. It does not
prove that a peer can connect to your listening port. A VPN can provide a
working forward on one public IP while outbound requests use another.
Conversely, two different IPs do not necessarily mean incoming connectivity is
broken.

This tool is a community contribution. It is not part of Mousehole's
application, API, Docker image, or container healthcheck.

## Requirements

- Python 3.10 or newer; no Python dependencies.
- For inspection: a Linux Docker host, Docker CLI, `nsenter`, and root access to
  read and enter the containers' network namespaces.
- A VPN that supports NAT-PMP, such as a suitably configured Gluetun/Proton
  stack.
- qBittorrent's Web API must already be readable from inside its network
  namespace. The tool does not configure or bypass authentication. An API that
  requires login produces an unknown result.
- For the incoming test: a machine outside the tested VPN and the v1 info hash
  of one torrent you are already actively seeding. A paused or absent torrent,
  or a client requiring encrypted handshakes, cannot provide this test's proof.

The inspector targets a shared network namespace setup. If Mousehole uses an
HTTP proxy instead, omit `--mousehole-container`; different network namespaces
are expected in that arrangement. This tool cannot validate proxy routing.

## 1. Inspect the current connection

Run from this repository on the Docker host, substituting your container names
and the Web API port used inside qBittorrent's namespace:

```sh
sudo python3 contrib/connectivity-check/check.py inspect \
  --vpn-container gluetun \
  --qbittorrent-container qbittorrent \
  --mousehole-container mousehole \
  --qbittorrent-url http://127.0.0.1:8995 \
  > /tmp/connectivity-sample.json
```

The inspector reads:

- Actual Linux network namespace identities and container health/status.
- The VPN's current forwarded-port file and qBittorrent's listening port and
  bound interface.
- MAM's unauthenticated observed-IP endpoint from qBittorrent's namespace, using
  that container's DNS resolvers and normal HTTPS certificate checks.
- The gateway's current external IPv4 address using NAT-PMP operation 0. It
  never creates, renews, or deletes a mapping; the VPN remains the mapping
  owner.
- A bounded sample of MAM tracker statuses, with URLs, torrent names, info
  hashes, and passkeys omitted from the report.
- Mousehole's liveness and, if a token is supplied, its last contact and next
  scheduled contact. It never invokes an authenticated MAM update.

Defaults are `tun0`, `/gluetun/forwarded_port`, and `http://127.0.0.1:5010` for
Mousehole. Use `--interface`, `--forwarded-port-file`, and `--mousehole-url` if
yours differ. By default, the NAT-PMP gateway comes from the tunnel's default or
split-default routes; use `--nat-pmp-gateway` to specify a private IPv4 gateway
explicitly.

For optional Mousehole state, add
`--mousehole-token-file /path/to/mousehole-token`. This is the **Mousehole API
Bearer token**, not the MAM cookie. Its contents travel to the namespace helper
through standard input, never command arguments or diagnostic output. No token
is needed for the core network checks. Credentials and API response bodies are
not included in error output.

The MAM lookup uses IPv4 DNS resolvers from the inspected container and verifies
the original HTTPS hostname when connecting. It uses one validated public IPv4
answer. IPv6-only resolvers, truncated DNS responses, unavailable DNS, or an
unexpected response produce an unknown result; the inspector does not fall back
to the Docker host's DNS.

The report contains network addresses and operational status. Review it before
sharing, and keep your token file private.

## 2. Probe from outside the VPN

Copy the fresh JSON report to a separate machine that is outside the tested VPN.
Keep the machines' clocks synchronized. Samples expire after five minutes by
default; collect again if you reconnect, change ports, or take longer to copy
it.

Run the following on that external machine, replacing the placeholder with the
40-character hexadecimal v1 info hash of your existing active seed:

```sh
python3 contrib/connectivity-check/check.py probe /tmp/connectivity-sample.json \
  --info-hash YOUR_40_CHARACTER_V1_INFO_HASH \
  --outside-vpn
```

`--outside-vpn` confirms where you are running the probe; the tool cannot prove
that an arbitrary external machine's routing bypasses your VPN. Probing from
inside the tested tunnel can fail because the VPN does not support hairpin
connections and is not a valid incoming test.

The probe checks only the current observed and NAT-PMP IPv4 endpoints recorded
in the report. It validates freshness, public addresses, port alignment, and
network preconditions before opening sockets. `--max-age-seconds` changes the
freshness limit when needed; it does not make an old mapping current.

It sends the standard BitTorrent handshake, validates the response's protocol
and info hash, and closes the socket after the handshake. It never requests
pieces or downloads torrent content. TCP connection success is reported
separately and does not count as a valid BitTorrent handshake.

## Interpret the evidence

| Measurement                                                 | Meaning                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Valid handshake at the IP MAM observes                      | Incoming BitTorrent reachability was verified from this external machine, even if the NAT-PMP IP differs. |
| Observed-IP handshake fails, NAT-PMP-IP handshake succeeds  | The seed and forwarding endpoint work, but the endpoint MAM observes failed this incoming test.           |
| TCP connects, but the handshake is invalid or absent        | TCP alone does not verify the expected BitTorrent seed.                                                   |
| Both tests fail, API reads fail, or ports/namespaces differ | Inconclusive; fix the reported prerequisite or investigate further before choosing a recovery action.     |

A single failed test is not enough to justify automated reconnects. Repeat with
fresh inspection data and look for consistent evidence. If you automate recovery
outside Mousehole, use explicit cooldowns and a retry limit, preserve the VPN
kill switch, and let Mousehole remain the only authenticated MAM updater.

Neither a valid handshake nor HTTP 200 from Mousehole proves MAM currently shows
the account as connectable. That status still needs confirmation on MAM.

`tracker_status_counts` uses qBittorrent's status codes: `0` disabled, `1` not
contacted, `2` working, `3` updating, and `4` not working. Tracker coverage is
reported separately and is limited to five MAM torrents per inspection.

The tool makes no service, preference, cookie, or network changes. It performs
one bounded inspection/probe when invoked; it installs no timer or daemon.

## Tests

The tests mock network and container access and require no VPN, Docker daemon,
MAM credentials, or live tracker:

```sh
python3 -m unittest discover -s contrib/connectivity-check -p 'test_*.py' -v
```
