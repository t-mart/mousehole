#!/usr/bin/env python3
"""Read-only Docker/VPN diagnostics; run probes separately outside the VPN."""

import argparse
import datetime as dt
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request


UTC = dt.timezone.utc
PROTOCOL = b"\x13BitTorrent protocol"
PEER_ID = b"-MH0001-000000000000"
CONTACT_STATUSES = {"ok", "throttled", "rejected", "unreachable", "no-cookie", "pending"}
MAM_HOST = "t.myanonamouse.net"


class Unknown(Exception):
    """Only static reason codes may be surfaced; never include response bodies."""


def public_ip(value):
    try:
        address = ipaddress.ip_address(value)
        if (not isinstance(value, str) or address.version != 4 or not address.is_global
                or address.is_multicast or address.is_reserved):
            raise ValueError
        return str(address)
    except (ValueError, TypeError):
        raise Unknown("invalid_public_ipv4") from None


def port_number(value):
    try:
        port = int(value)
        if isinstance(value, bool) or str(port) != str(value).strip() or not 1 <= port <= 65535:
            raise ValueError
        return port
    except (TypeError, ValueError):
        raise Unknown("invalid_port") from None


def private_gateway(value):
    try:
        address = ipaddress.IPv4Address(value)
        if not any(address in ipaddress.ip_network(net) for net in
                   ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")):
            raise ValueError
        return str(address)
    except (TypeError, ValueError):
        raise Unknown("invalid_nat_pmp_gateway") from None


def route_gateway(routes, interface):
    """/proc/net/route uses little-endian IPv4 addresses, including netmasks."""
    gateways = set()
    try:
        for line in routes.splitlines()[1:]:
            fields = line.split()
            if fields[0] != interface:
                continue
            destination, gateway, flags, mask = [int(fields[i], 16) for i in (1, 2, 3, 7)]
            if flags & 3 == 3 and (destination, mask) in ((0, 0), (0, 128), (128, 128)):
                gateways.add(private_gateway(socket.inet_ntoa(struct.pack("<I", gateway))))
        if len(gateways) != 1:
            raise ValueError
        return gateways.pop()
    except (ValueError, IndexError, struct.error):
        raise Unknown("nat_pmp_gateway_ambiguous") from None


def nat_pmp_response(packet):
    if len(packet) != 12:
        raise Unknown("invalid_nat_pmp_response")
    version, opcode, result, _epoch, packed = struct.unpack("!BBHI4s", packet)
    if (version, opcode, result) != (0, 128, 0):
        raise Unknown("invalid_nat_pmp_response")
    return public_ip(socket.inet_ntoa(packed))


def nat_pmp_ip(gateway, interface):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, interface.encode() + b"\0")
        sock.settimeout(5)
        sock.connect((private_gateway(gateway), 5351))
        sock.send(b"\0\0")  # External-address operation 0; never a port mapping request.
        return nat_pmp_response(sock.recv(64))


def nameservers(resolv_conf):
    result = []
    for line in resolv_conf.splitlines():
        fields = line.split()
        if len(fields) >= 2 and fields[0] == "nameserver":
            address = ipaddress.ip_address(fields[1])
            if address.version == 4 and not address.is_multicast and not address.is_unspecified:
                result.append(str(address))
    return list(dict.fromkeys(result))[:3]


def dns_name(packet, offset):
    labels, end = [], None
    for _ in range(128):
        if offset >= len(packet):
            break
        length = packet[offset]
        if length & 0xC0 == 0xC0:
            if offset + 1 >= len(packet):
                break
            pointer = ((length & 0x3F) << 8) | packet[offset + 1]
            if pointer >= offset:  # Compression refers to an earlier name, never a cycle.
                break
            end = end if end is not None else offset + 2
            offset = pointer
        elif length & 0xC0:
            break
        elif length == 0:
            name = ".".join(labels)
            if len(name) > 253:
                break
            return name.lower(), end if end is not None else offset + 1
        else:
            if offset + length + 1 > len(packet):
                break
            labels.append(packet[offset + 1:offset + length + 1].decode("ascii"))
            offset += length + 1
    raise Unknown("invalid_dns_response")


def dns_answer(packet, transaction):
    try:
        ident, flags, questions, answers, _authority, _additional = struct.unpack("!6H", packet[:12])
        if (ident != transaction or flags & 0x8000 == 0 or flags & 0x7A0F
                or questions != 1 or not 1 <= answers <= 64):
            raise ValueError
        question, offset = dns_name(packet, 12)
        if question != MAM_HOST or packet[offset:offset + 4] != b"\0\1\0\1":
            raise ValueError
        offset += 4
        addresses, aliases = {}, {}
        for _ in range(answers):
            owner, offset = dns_name(packet, offset)
            kind, cls, _ttl, size = struct.unpack("!HHIH", packet[offset:offset + 10])
            offset += 10
            end = offset + size
            if end > len(packet):
                raise ValueError
            if cls == 1 and kind == 1:
                if size != 4:
                    raise ValueError
                addresses[owner] = public_ip(socket.inet_ntoa(packet[offset:end]))
            elif cls == 1 and kind == 5:
                aliases[owner], consumed = dns_name(packet, offset)
                if consumed != end:
                    raise ValueError
            offset = end
        name = MAM_HOST
        for _ in range(16):
            if name in addresses:
                return addresses[name]
            name = aliases.get(name)
            if name is None:
                break
    except (ValueError, UnicodeError, struct.error):
        pass
    raise Unknown("invalid_dns_response")


def resolve_mam(resolvers):
    # DNS goes to the container's resolvers from its network namespace, never the host's stub.
    for resolver in (resolvers or [])[:3]:
        try:
            transaction = int.from_bytes(os.urandom(2), "big")
            question = b"".join(bytes([len(label)]) + label.encode() for label in MAM_HOST.split("."))
            query = struct.pack("!6H", transaction, 0x0100, 1, 0, 0, 0) + question + b"\0\0\1\0\1"
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(3)
                sock.connect((str(ipaddress.IPv4Address(resolver)), 53))
                sock.send(query)
                return dns_answer(sock.recv(4096), transaction)
        except (OSError, ValueError, Unknown):
            continue
    raise Unknown("container_dns_lookup_failed")


def loopback_url(value):
    try:
        url = urllib.parse.urlsplit(value)
        if (url.scheme != "http" or url.hostname not in ("127.0.0.1", "::1", "localhost")
                or url.username is not None or url.password is not None or url.query or url.fragment):
            raise ValueError
        if url.port is not None:
            port_number(url.port)
        return value.rstrip("/")
    except (ValueError, TypeError):
        raise Unknown("invalid_loopback_url") from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, destination, **kwargs):
        super().__init__(host, **kwargs)
        self.destination = public_ip(destination)
        self._create_connection = self.connect_address

    def connect_address(self, address, timeout, source_address):
        # HTTPSConnection retains the original host for SNI and certificate verification.
        return socket.create_connection((self.destination, address[1]), timeout, source_address)


class PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def __init__(self, destination):
        super().__init__()
        self.destination = destination

    def https_open(self, request):
        return self.do_open(lambda host, **kwargs: PinnedHTTPSConnection(host, self.destination, **kwargs),
                            request, context=self._context)


def get_json(url, token=None, destination=None):
    # Ignore proxy environment variables and refuse redirects, especially with credentials.
    handlers = [urllib.request.ProxyHandler({}), NoRedirect()]
    if destination:
        handlers.append(PinnedHTTPSHandler(destination))
    opener = urllib.request.build_opener(*handlers)
    request = urllib.request.Request(url)
    if token is not None:
        request.add_header("Authorization", "Bearer " + token)
    with opener.open(request, timeout=5) as response:
        body = response.read(8 * 1024 * 1024 + 1)
        if len(body) > 8 * 1024 * 1024:
            raise Unknown("response_too_large")
        return json.loads(body)


def timestamp(value):
    """Accept MouseHole's RFC 9557 zone annotation, emit only normalized UTC."""
    if not isinstance(value, str):
        raise Unknown("invalid_timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.split("[", 1)[0].replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError
        return parsed.astimezone(UTC)
    except ValueError:
        raise Unknown("invalid_timestamp") from None


def mousehole_state(data):
    result = {"last_contact_status": "pending"}
    if data.get("nextContactAt"):
        result["next_contact_at"] = timestamp(data["nextContactAt"]).isoformat()
    contact = data.get("lastMamContact")
    if contact:
        result["last_contact_at"] = timestamp(contact["at"]).isoformat()
        update = contact.get("ipUpdate")
        if contact.get("reached") is False:
            result["last_contact_status"] = "unreachable"
        elif contact.get("reached") is True and update is None:
            result["last_contact_status"] = "no-cookie"
        elif contact.get("reached") is True and isinstance(update, dict):
            status = update.get("httpStatus")
            if type(status) is not int or not 100 <= status <= 599:
                raise Unknown("invalid_mousehole_status")
            result["last_update_http_status"] = status
            result["last_contact_status"] = {200: "ok", 429: "throttled"}.get(status, "rejected")
            if type(update.get("success")) is bool:
                result["last_update_success"] = update["success"]
        else:
            raise Unknown("invalid_mousehole_contact")
        if contact.get("reached") is True:
            result["last_contact_ip"] = public_ip(contact["ip"])
            asn = contact.get("asn")
            if type(asn) is not int or not 0 <= asn < 2 ** 32:
                raise Unknown("invalid_mousehole_asn")
            result["last_contact_asn"] = asn
    return result


def is_mam_tracker(url):
    if not isinstance(url, str):
        return False
    try:
        hostname = urllib.parse.urlsplit(url).hostname or ""
        return hostname == "myanonamouse.net" or hostname.endswith(".myanonamouse.net")
    except ValueError:
        return False


def tracker_summary(base):
    trackers = get_json(base + "/api/v2/sync/maindata").get("trackers", {})
    hashes = sorted({h for url, values in trackers.items() if is_mam_tracker(url)
                     for h in values if isinstance(h, str) and re.fullmatch(r"[a-fA-F0-9]{40}", h)})
    result = {"total_mam_torrents": len(hashes), "sampled_mam_torrents": 0,
              "tracker_status_counts": {}, "tracker_error_count": 0, "tracker_message_count": 0}
    for info_hash in hashes[:5]:
        rows = get_json(base + "/api/v2/torrents/trackers?hash=" + info_hash)
        for row in rows:
            if not is_mam_tracker(row.get("url")):
                continue
            status = row.get("status")
            if type(status) is not int or status not in range(5):
                raise Unknown("invalid_tracker_status")
            counts = result["tracker_status_counts"]
            counts[str(status)] = counts.get(str(status), 0) + 1
            result["tracker_error_count"] += status == 4
            result["tracker_message_count"] += bool(row.get("msg"))
        result["sampled_mam_torrents"] += 1
    return result


def attempt(errors, label, operation):
    try:
        return operation()
    except Exception:
        # Raw API/command errors can contain tokens, tracker URLs and passkeys.
        errors.append(label + "_read_failed")
        return None


def namespace_sample(config):
    errors = []
    result = {"errors": errors}
    base = loopback_url(config["qbittorrent_url"])
    interface = config["interface"]
    gateway = attempt(errors, "nat_pmp_gateway", lambda: private_gateway(config["nat_pmp_gateway"])
                      if config.get("nat_pmp_gateway") else
                      route_gateway(Path("/proc/net/route").read_text(), interface))
    result["nat_pmp_gateway"] = gateway
    result["nat_pmp_ip"] = attempt(errors, "nat_pmp", lambda: nat_pmp_ip(gateway, interface)) if gateway else None
    result["observed_ip"] = attempt(errors, "mam_observed_ip", lambda:
        public_ip(get_json("https://" + MAM_HOST + "/json/jsonIp.php",
                           destination=resolve_mam(config.get("nameservers")))["ip"]))

    def preferences():
        data = get_json(base + "/api/v2/app/preferences")
        bound = data.get("current_network_interface")
        if not isinstance(bound, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{0,15}", bound):
            raise Unknown("invalid_qbittorrent_interface")
        return {"listen_port": port_number(data["listen_port"]), "interface": bound}

    result["qbittorrent"] = attempt(errors, "qbittorrent_preferences", preferences)
    result["trackers"] = attempt(errors, "trackers", lambda: tracker_summary(base))
    if config.get("mousehole_enabled"):
        mousehole = {}
        base = loopback_url(config["mousehole_url"])

        def health():
            value = get_json(base + "/health").get("lastMamContactResult")
            if value not in CONTACT_STATUSES:
                raise Unknown("invalid_mousehole_health")
            return value

        mousehole["health_last_contact_result"] = attempt(errors, "mousehole_health", health)
        mousehole["health_reachable"] = mousehole["health_last_contact_result"] is not None
        if config.get("token"):
            state = attempt(errors, "mousehole_state", lambda:
                mousehole_state(get_json(base + "/state", config["token"])))
            if state:
                mousehole.update(state)
        result["mousehole"] = mousehole
    return result


def run(arguments, *, stdin=None, timeout=15):
    try:
        result = subprocess.run(arguments, input=stdin, capture_output=True, text=True,
                                timeout=timeout, check=False)
        if result.returncode:
            raise Unknown("command_failed")
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        raise Unknown("command_unavailable") from None


def container_snapshot(names):
    # Docker's full configuration stays in memory. Emit only these state fields.
    items = json.loads(run(["docker", "inspect", *names.values()]))
    result, pids = {}, {}
    for label, item in zip(names, items):
        state = item["State"]
        pid = state["Pid"]
        running = state.get("Running") is True and state.get("Status") == "running"
        health = state.get("Health", {}).get("Status", "not-configured")
        if health not in ("healthy", "unhealthy", "starting", "not-configured"):
            health = "unknown"
        netns = None
        if running and type(pid) is int and pid > 1:
            netns = os.readlink("/proc/" + str(pid) + "/ns/net")
            if not re.fullmatch(r"net:\[\d+\]", netns):
                raise Unknown("invalid_namespace")
            pids[label] = pid
        result[label] = {"running": running, "health": health, "netns": netns}
    if len(result) != len(names):
        raise Unknown("container_inspection_failed")
    return result, pids


def containers_ready(containers):
    if not isinstance(containers, dict) or not {"vpn", "qbittorrent"} <= containers.keys():
        raise Unknown("missing_containers")
    namespaces = set()
    for item in containers.values():
        if (item.get("running") is not True or item.get("health") not in ("healthy", "not-configured")
                or not isinstance(item.get("netns"), str)
                or not re.fullmatch(r"net:\[\d+\]", item["netns"])):
            raise Unknown("container_not_ready")
        namespaces.add(item["netns"])
    if len(namespaces) != 1:
        raise Unknown("namespace_mismatch")


def inspect_sample(args):
    result = {"schema_version": 1, "collected_at": dt.datetime.now(UTC).isoformat(),
              "expected_interface": args.interface, "snapshot_stable": False, "errors": []}
    errors = result["errors"]
    names = {"vpn": args.vpn_container, "qbittorrent": args.qbittorrent_container}
    if args.mousehole_container:
        names["mousehole"] = args.mousehole_container
    try:
        containers, pids = container_snapshot(names)
        result["containers"] = containers
        result["namespace_match"] = len({item["netns"] for item in containers.values()}) == 1
        containers_ready(containers)
        result["forwarded_port"] = attempt(errors, "forwarded_port", lambda:
            port_number(run(["docker", "exec", args.vpn_container, "cat", "--", args.forwarded_port_file]).strip()))
        config = {"qbittorrent_url": args.qbittorrent_url, "interface": args.interface,
                  "nat_pmp_gateway": args.nat_pmp_gateway, "mousehole_url": args.mousehole_url,
                  "mousehole_enabled": bool(args.mousehole_container)}
        config["nameservers"] = attempt(errors, "container_resolvers", lambda:
            nameservers(Path("/proc/" + str(pids["qbittorrent"]) + "/root/etc/resolv.conf").read_text()))
        if args.mousehole_token_file:
            config["token"] = attempt(errors, "mousehole_token", lambda:
                Path(args.mousehole_token_file).read_text().strip())
        data = json.loads(run(["nsenter", "--net=/proc/" + str(pids["qbittorrent"]) + "/ns/net", "--",
                               sys.executable, str(Path(__file__).resolve()), "_namespace"],
                              stdin=json.dumps(config), timeout=75))
        errors.extend(data.pop("errors", []))
        result.update(data)
        # A restart during collection invalidates the snapshot and all derived evidence.
        after, after_pids = container_snapshot(names)
        final_port = attempt(errors, "final_forwarded_port", lambda:
            port_number(run(["docker", "exec", args.vpn_container, "cat", "--", args.forwarded_port_file]).strip()))
        if after != containers or after_pids != pids:
            errors.append("containers_changed_during_inspection")
        elif final_port is None or final_port != result["forwarded_port"]:
            errors.append("forwarded_port_not_stable")
        else:
            result["snapshot_stable"] = True
    except Unknown as error:
        errors.append(str(error))
    except Exception:
        errors.append("inspection_failed")
    return result


def handshake(ip, port, info_hash):
    result = {"ip": ip, "port": port, "tcp": False, "valid_handshake": False}
    try:
        with socket.create_connection((ip, port), timeout=5) as connection:
            result["tcp"] = True
            deadline = time.monotonic() + 5
            connection.settimeout(5)
            connection.sendall(PROTOCOL + b"\0" * 8 + info_hash + PEER_ID)
            received = b""
            while len(received) < 68:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                connection.settimeout(remaining)
                chunk = connection.recv(68 - len(received))
                if not chunk:
                    break
                received += chunk
            result["valid_handshake"] = (len(received) == 68 and received[:20] == PROTOCOL
                                          and received[28:48] == info_hash and received[48:68] != PEER_ID)
    except OSError:
        pass
    return result


def probe_targets(sample, max_age, now=None):
    if type(max_age) is not int or not 1 <= max_age <= 3600:
        raise Unknown("invalid_max_age")
    if type(sample.get("schema_version")) is not int or sample["schema_version"] != 1:
        raise Unknown("unsupported_schema")
    age = ((now or dt.datetime.now(UTC)) - timestamp(sample.get("collected_at"))).total_seconds()
    if age < -30 or age > max_age:
        raise Unknown("sample_not_fresh")
    containers_ready(sample.get("containers"))
    if sample.get("namespace_match") is not True:
        raise Unknown("namespace_mismatch")
    if sample.get("snapshot_stable") is not True:
        raise Unknown("container_snapshot_not_stable")
    port = port_number(sample.get("forwarded_port"))
    prefs = sample.get("qbittorrent") or {}
    if port_number(prefs.get("listen_port")) != port:
        raise Unknown("port_mismatch")
    interface = sample.get("expected_interface")
    if not isinstance(interface, str) or not interface or prefs.get("interface") != interface:
        raise Unknown("interface_mismatch")
    observed, nat = public_ip(sample.get("observed_ip")), public_ip(sample.get("nat_pmp_ip"))
    return observed, nat, port


def verdict(observed, nat, probes):
    if probes[observed]["valid_handshake"]:
        return "observed_endpoint_reachable"
    if probes[nat]["valid_handshake"] and observed != nat:
        return "split_incoming_failure"
    return "unknown"


def probe_sample(sample, info_hash, max_age=300):
    result = {"schema_version": 1, "probed_at": dt.datetime.now(UTC).isoformat(),
              "verdict": "unknown", "outside_vpn_acknowledged": True, "probes": []}
    try:
        observed, nat, port = probe_targets(sample, max_age)
        result["collected_at"] = timestamp(sample["collected_at"]).isoformat()
        probes = {ip: handshake(ip, port, info_hash) for ip in dict.fromkeys((observed, nat))}
        result.update({"observed_ip": observed, "nat_pmp_ip": nat, "port": port,
                       "probes": list(probes.values()), "verdict": verdict(observed, nat, probes)})
    except Unknown as error:
        result["reason"] = str(error)
    except Exception:
        result["reason"] = "invalid_sample"
    return result


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's usual diagnostics echo invalid values, potentially credentials.
        self.exit(2, "Invalid arguments; use --help for supported options.\n")


def main():
    if sys.argv[1:] == ["_namespace"]:
        try:
            print(json.dumps(namespace_sample(json.load(sys.stdin))))
        except Exception:
            print(json.dumps({"errors": ["namespace_read_failed"]}))
        return
    parser = SafeParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True, parser_class=SafeParser)
    inspect = commands.add_parser("inspect", help="Collect a sanitized sample on the Linux Docker host")
    inspect.add_argument("--vpn-container", required=True)
    inspect.add_argument("--qbittorrent-container", required=True)
    inspect.add_argument("--mousehole-container")
    inspect.add_argument("--qbittorrent-url", default="http://127.0.0.1:8995")
    inspect.add_argument("--mousehole-url", default="http://127.0.0.1:5010")
    inspect.add_argument("--mousehole-token-file")
    inspect.add_argument("--forwarded-port-file", default="/gluetun/forwarded_port")
    inspect.add_argument("--interface", default="tun0")
    inspect.add_argument("--nat-pmp-gateway")
    probe = commands.add_parser("probe", help="Probe the measured endpoints from outside the VPN")
    probe.add_argument("sample_json", help="Fresh JSON sample file, or - to read stdin")
    probe.add_argument("--info-hash", required=True, help="40 hexadecimal digits of your active, complete seed")
    probe.add_argument("--outside-vpn", required=True, action="store_true",
                       help="Acknowledge that this machine's probes travel outside the VPN")
    probe.add_argument("--max-age-seconds", dest="max_age", type=int, default=300,
                       help="Maximum sample age in seconds (1..3600)")
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            for name in (args.vpn_container, args.qbittorrent_container, args.mousehole_container):
                if name is not None and not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", name):
                    raise Unknown("invalid_container_name")
            if not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,15}", args.interface):
                raise Unknown("invalid_interface")
            loopback_url(args.qbittorrent_url)
            loopback_url(args.mousehole_url)
            if args.nat_pmp_gateway:
                private_gateway(args.nat_pmp_gateway)
            if args.mousehole_token_file and not args.mousehole_container:
                raise Unknown("mousehole_container_required_for_token")
            print(json.dumps(inspect_sample(args), indent=2))
        else:
            if not re.fullmatch(r"[a-fA-F0-9]{40}", args.info_hash) or not 1 <= args.max_age <= 3600:
                raise Unknown("invalid_probe_arguments")
            sample = json.load(sys.stdin) if args.sample_json == "-" else json.loads(Path(args.sample_json).read_text())
            print(json.dumps(probe_sample(sample, bytes.fromhex(args.info_hash), args.max_age), indent=2))
    except Unknown as error:
        print(json.dumps({"verdict": "unknown", "reason": str(error)}))
        return 2
    except Exception:
        print(json.dumps({"verdict": "unknown", "reason": "input_read_failed"}))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
