"""Offline checks for protocol proof, read-only collection and safe output."""

import argparse
import copy
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import socket
import struct
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location("connectivity_check", Path(__file__).with_name("check.py"))
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)
IP_A, IP_B = "8.8.8.8", "1.1.1.1"  # Offline fixtures: no test opens real sockets.
INFO_HASH = bytes(range(20))
NOW = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
SECRET = "SENSITIVE_VALUE_MUST_NOT_APPEAR"


def sample():
    return {
        "schema_version": 1, "collected_at": NOW.isoformat(), "errors": [],
        "snapshot_stable": True, "namespace_match": True, "expected_interface": "tun0",
        "containers": {name: {"running": True, "health": "healthy", "netns": "net:[123]"}
                       for name in ("vpn", "qbittorrent")},
        "forwarded_port": 40000, "nat_pmp_ip": IP_B, "observed_ip": IP_A,
        "qbittorrent": {"listen_port": 40000, "interface": "tun0"},
    }


class InputTests(unittest.TestCase):
    def test_nonpublic_or_nonipv4_endpoints_are_rejected(self):
        for value in (None, 1234, True, "127.0.0.1", "192.168.1.1", "100.64.1.1",
                      "169.254.1.1", "0.0.0.0", "192.0.2.1", "224.0.0.1",
                      "255.255.255.255", "::1", "2606:4700::1111", SECRET):
            with self.subTest(value=value), self.assertRaises(check.Unknown):
                check.public_ip(value)

    def test_unsafe_ports_are_rejected(self):
        for value in (0, 65536, -1, True, False, 1.0, "22.0", None, "1e3", "22\n" + SECRET):
            with self.subTest(value=value), self.assertRaises(check.Unknown):
                check.port_number(value)
        self.assertEqual(check.port_number(" 40000\n"), 40000)

    def test_loopback_url_validation(self):
        self.assertEqual(check.loopback_url("http://127.0.0.1:8995/"), "http://127.0.0.1:8995")
        for value in ("https://127.0.0.1", "http://example.org", "http://127.0.0.1.evil",
                      "http://user:" + SECRET + "@127.0.0.1", "http://127.0.0.1?token=" + SECRET,
                      "http://127.0.0.1/#" + SECRET, "http://127.0.0.1:65536"):
            with self.subTest(value=value), self.assertRaises(check.Unknown):
                check.loopback_url(value)

    def test_fresh_sample_targets(self):
        self.assertEqual(check.probe_targets(sample(), 300, NOW), (IP_A, IP_B, 40000))

    def test_stale_future_naive_and_invalid_timestamps(self):
        for value in ((NOW - dt.timedelta(seconds=301)).isoformat(),
                      (NOW + dt.timedelta(seconds=31)).isoformat(), "2026-01-01T00:00:00", SECRET):
            fixture = sample()
            fixture["collected_at"] = value
            with self.subTest(value=value), self.assertRaises(check.Unknown):
                check.probe_targets(fixture, 300, NOW)

    def test_bounded_max_age(self):
        for value in (0, 3601, True, "300"):
            with self.subTest(value=value), self.assertRaises(check.Unknown):
                check.probe_targets(sample(), value, NOW)

    def test_preconditions_reject_unhealthy_mismatched_or_incomplete_samples(self):
        changes = [
            lambda s: s.update(schema_version=True),
            lambda s: s.update(snapshot_stable=False),
            lambda s: s.update(namespace_match=False),
            lambda s: s.update(forwarded_port=40001),
            lambda s: s["qbittorrent"].update(interface=""),
            lambda s: s["containers"]["vpn"].update(health="unhealthy"),
            lambda s: s["containers"]["vpn"].update(health="starting"),
            lambda s: s["containers"]["vpn"].update(running=False),
            lambda s: s["containers"]["vpn"].update(netns="net:[456]"),
            lambda s: s["containers"].pop("qbittorrent"),
        ]
        for change in changes:
            fixture = sample()
            change(fixture)
            with self.subTest(change=change), self.assertRaises(check.Unknown):
                check.probe_targets(fixture, 300, NOW)

    def test_missing_optional_mousehole_token_does_not_block_probe(self):
        fixture = sample()
        fixture["errors"].append("mousehole_state_read_failed")
        fixture["containers"]["vpn"]["health"] = "not-configured"
        self.assertEqual(check.probe_targets(fixture, 300, NOW), (IP_A, IP_B, 40000))

    def test_invalid_sample_never_opens_connection_or_echoes_payload(self):
        fixture = sample()
        fixture["collected_at"] = dt.datetime.now(check.UTC).isoformat()
        fixture["observed_ip"] = SECRET
        with mock.patch.object(check, "handshake") as probe:
            result = check.probe_sample(fixture, INFO_HASH)
        probe.assert_not_called()
        self.assertEqual(result["verdict"], "unknown")
        self.assertNotIn(SECRET, json.dumps(result))


class NatPmpTests(unittest.TestCase):
    HEADER = "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT\n"

    def test_proc_routes_use_little_endian_and_only_requested_interface(self):
        routes = self.HEADER + (
            "eth0 00000000 0101A8C0 0003 0 0 0 00000000 0 0 0\n"
            "tun0 00000000 0100020A 0003 0 0 0 00000080 0 0 0\n"
            "tun0 00000080 0100020A 0003 0 0 0 00000080 0 0 0\n")
        self.assertEqual(check.route_gateway(routes, "tun0"), "10.2.0.1")

    def test_ambiguous_absent_and_not_up_gateways_are_unknown(self):
        rows = ["", "tun0 00000000 0100020A 0002 0 0 0 00000000 0 0 0\n",
                "tun0 00000000 0100020A 0003 0 0 0 00000080 0 0 0\n"
                "tun0 00000080 0200020A 0003 0 0 0 00000080 0 0 0\n"]
        for row in rows:
            with self.subTest(row=row), self.assertRaises(check.Unknown):
                check.route_gateway(self.HEADER + row, "tun0")

    def test_response_frame_and_network_byte_order(self):
        packet = struct.pack("!BBHI4s", 0, 128, 0, 123456, socket.inet_aton(IP_A))
        self.assertEqual(check.nat_pmp_response(packet), IP_A)
        for malformed in (packet[:11], packet + b"x", b"\1" + packet[1:],
                          packet[:1] + b"\x81" + packet[2:], packet[:3] + b"\1" + packet[4:]):
            with self.subTest(packet=malformed), self.assertRaises(check.Unknown):
                check.nat_pmp_response(malformed)

    def test_request_is_address_only_and_bound_to_vpn_interface(self):
        sock = mock.MagicMock()
        sock.__enter__.return_value = sock
        sock.recv.return_value = struct.pack("!BBHI4s", 0, 128, 0, 0, socket.inet_aton(IP_A))
        with mock.patch.object(check.socket, "socket", return_value=sock):
            self.assertEqual(check.nat_pmp_ip("10.2.0.1", "tun0"), IP_A)
        sock.connect.assert_called_once_with(("10.2.0.1", 5351))
        sock.send.assert_called_once_with(b"\0\0")
        sock.setsockopt.assert_called_once_with(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, b"tun0\0")


class HandshakeTests(unittest.TestCase):
    PACKET = check.PROTOCOL + b"\0" * 8 + INFO_HASH + b"-UT0001-000000000000"

    def exercise(self, chunks):
        connection = mock.MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.side_effect = chunks
        with mock.patch.object(check.socket, "create_connection", return_value=connection) as connect:
            result = check.handshake(IP_A, 40000, INFO_HASH)
        connect.assert_called_once_with((IP_A, 40000), timeout=5)
        connection.sendall.assert_called_once_with(check.PROTOCOL + b"\0" * 8 + INFO_HASH + check.PEER_ID)
        self.assertEqual(len(connection.sendall.call_args.args[0]), 68)
        connection.__exit__.assert_called_once()
        return result, connection

    def test_valid_fragmented_handshake_is_strong_proof(self):
        result, connection = self.exercise([self.PACKET[:3], self.PACKET[3:21], self.PACKET[21:]])
        self.assertTrue(result["tcp"])
        self.assertTrue(result["valid_handshake"])
        self.assertEqual(connection.recv.call_args_list, [mock.call(68), mock.call(65), mock.call(47)])

    def test_wrong_hash_protocol_short_or_timeout_is_only_tcp(self):
        for chunks in ([self.PACKET[:28] + b"x" * 20 + self.PACKET[48:]],
                       [b"\x12" + self.PACKET[1:]], [self.PACKET[:48] + check.PEER_ID],
                       [self.PACKET[:40], b""], [TimeoutError()]):
            with self.subTest(chunks=chunks):
                result, _ = self.exercise(chunks)
                self.assertTrue(result["tcp"])
                self.assertFalse(result["valid_handshake"])

    def test_connection_failure_is_distinct_from_tcp_only(self):
        with mock.patch.object(check.socket, "create_connection", side_effect=TimeoutError()):
            result = check.handshake(IP_A, 40000, INFO_HASH)
        self.assertFalse(result["tcp"])
        self.assertFalse(result["valid_handshake"])

    def test_read_deadline_cannot_be_extended_by_slow_fragments(self):
        with mock.patch.object(check.time, "monotonic", side_effect=[100, 106]):
            result, connection = self.exercise([])
        connection.recv.assert_not_called()
        self.assertFalse(result["valid_handshake"])

    def test_verdict_requires_valid_protocol_not_just_tcp_or_matching_ips(self):
        cases = [(True, True, "observed_endpoint_reachable"),
                 (True, False, "observed_endpoint_reachable"),
                 (False, True, "split_incoming_failure"), (False, False, "unknown")]
        for observed_ok, nat_ok, expected in cases:
            probes = {IP_A: {"tcp": True, "valid_handshake": observed_ok},
                      IP_B: {"tcp": True, "valid_handshake": nat_ok}}
            with self.subTest(observed=observed_ok, nat=nat_ok):
                self.assertEqual(check.verdict(IP_A, IP_B, probes), expected)

    def test_matching_ips_are_probed_once(self):
        fixture = sample()
        fixture["collected_at"] = dt.datetime.now(check.UTC).isoformat()
        fixture["nat_pmp_ip"] = IP_A
        response = {"ip": IP_A, "port": 40000, "tcp": True, "valid_handshake": True}
        with mock.patch.object(check, "handshake", return_value=response) as probe:
            result = check.probe_sample(fixture, INFO_HASH)
        probe.assert_called_once_with(IP_A, 40000, INFO_HASH)
        self.assertEqual(result["verdict"], "observed_endpoint_reachable")


class SanitizationTests(unittest.TestCase):
    def test_mousehole_state_never_releases_free_text(self):
        data = {"cookie": SECRET, "nextContactAt": "2026-01-01T01:00:00+00:00[UTC]",
                "lastMamContact": {"at": "2026-01-01T00:00:00+00:00[UTC]", "reached": True,
                    "ip": IP_A, "asn": 1234, "as": SECRET,
                    "ipUpdate": {"httpStatus": 200, "success": True, "msg": SECRET}}}
        result = check.mousehole_state(data)
        self.assertEqual(result["last_contact_status"], "ok")
        self.assertEqual(result["last_contact_ip"], IP_A)
        self.assertEqual(result["last_contact_asn"], 1234)
        self.assertNotIn(SECRET, json.dumps(result))
        data["lastMamContact"] = {"at": "2026-01-01T00:00:00Z", "reached": False,
                                  "error": {"message": SECRET}}
        self.assertEqual(check.mousehole_state(data)["last_contact_status"], "unreachable")
        self.assertNotIn(SECRET, json.dumps(check.mousehole_state(data)))

    def test_mam_tracker_match_is_hostname_based(self):
        self.assertTrue(check.is_mam_tracker("https://t.myanonamouse.net/" + SECRET))
        for url in ("https://myanonamouse.net.evil/", "https://evil/?myanonamouse.net",
                    "https://myanonamouse.net@evil/", "** [DHT] **"):
            self.assertFalse(check.is_mam_tracker(url))

    def test_tracker_collection_is_bounded_and_discards_urls_messages_hashes(self):
        url = "https://t.myanonamouse.net/" + SECRET
        hashes = [f"{n:040x}" for n in range(8)]
        data = {"trackers": {url: hashes}, "torrents": {"secret-title": SECRET}}
        row = {"url": url, "status": 4, "msg": SECRET}
        with mock.patch.object(check, "get_json", side_effect=[data] + [[row]] * 5) as get:
            result = check.tracker_summary("http://127.0.0.1:8995")
        self.assertEqual(get.call_count, 6)
        self.assertEqual(result["total_mam_torrents"], 8)
        self.assertEqual(result["sampled_mam_torrents"], 5)
        self.assertEqual(result["tracker_status_counts"], {"4": 5})
        self.assertEqual(result["tracker_error_count"], 5)
        self.assertNotIn(SECRET, json.dumps(result))
        for info_hash in hashes:
            self.assertNotIn(info_hash, json.dumps(result))

    def test_exception_text_is_never_used_as_read_error(self):
        errors = []
        with mock.patch.object(check, "get_json", side_effect=ValueError(SECRET)):
            result = check.attempt(errors, "state", lambda: check.get_json("unused"))
        self.assertIsNone(result)
        self.assertEqual(errors, ["state_read_failed"])

    def test_container_output_omits_environment_name_and_health_log(self):
        config = {"Id": SECRET, "Name": SECRET, "Config": {"Env": [SECRET]},
                  "State": {"Running": True, "Status": "running", "Pid": 1234,
                            "Health": {"Status": "healthy", "Log": [{"Output": SECRET}]}}}
        with mock.patch.object(check, "run", return_value=json.dumps([config, config])), \
                mock.patch.object(check.os, "readlink", return_value="net:[123]"):
            containers, _ = check.container_snapshot({"vpn": "vpn", "qbittorrent": "qbittorrent"})
        self.assertNotIn(SECRET, json.dumps(containers))

    def test_http_reader_disables_proxy_redirects_and_uses_header_for_token(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"safe": true}'
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.object(check.urllib.request, "build_opener", return_value=opener) as build:
            self.assertEqual(check.get_json("http://127.0.0.1:5010/state", SECRET), {"safe": True})
        handlers = build.call_args.args
        self.assertEqual(handlers[0].proxies, {})
        self.assertIsInstance(handlers[1], check.NoRedirect)
        self.assertIsNone(handlers[1].redirect_request(None, None, 302, None, None, "https://evil"))
        request = opener.open.call_args.args[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(request.get_header("Authorization"), "Bearer " + SECRET)
        self.assertNotIn(SECRET, request.full_url)

    def test_argument_errors_do_not_echo_input(self):
        parser = check.SafeParser()
        with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr, self.assertRaises(SystemExit):
            parser.parse_args(["--unknown=" + SECRET])
        self.assertNotIn(SECRET, stderr.getvalue())


class CollectionTests(unittest.TestCase):
    def args(self):
        return argparse.Namespace(vpn_container="vpn", qbittorrent_container="qbittorrent",
                                  mousehole_container=None, interface="tun0", nat_pmp_gateway=None,
                                  qbittorrent_url="http://127.0.0.1:8995", mousehole_url="http://127.0.0.1:5010",
                                  mousehole_token_file=None, forwarded_port_file="/gluetun/forwarded_port")

    def test_collection_changed_namespace_does_not_produce_probeable_sample(self):
        before = sample()["containers"]
        after = copy.deepcopy(before)
        after["vpn"]["netns"] = "net:[456]"
        with mock.patch.object(check, "container_snapshot", side_effect=[(before, {"qbittorrent": 100}),
                                                                         (after, {"qbittorrent": 101})]), \
                mock.patch.object(check, "run", side_effect=["40000\n", '{"errors": []}', "40000\n"]):
            result = check.inspect_sample(self.args())
        self.assertFalse(result["snapshot_stable"])
        self.assertIn("containers_changed_during_inspection", result["errors"])

    def test_token_is_only_passed_on_stdin_and_reads_are_not_mutations(self):
        args = self.args()
        args.mousehole_container, args.mousehole_token_file = "mousehole", "/private/token"
        before, pids = sample()["containers"], {"qbittorrent": 100}
        with mock.patch.object(check, "container_snapshot", return_value=(before, pids)), \
                mock.patch.object(check.Path, "read_text", return_value=SECRET), \
                mock.patch.object(check, "run", side_effect=["40000\n", '{"errors": []}', "40000\n"]) as run:
            result = check.inspect_sample(args)
        self.assertTrue(result["snapshot_stable"])
        self.assertNotIn(SECRET, json.dumps(result))
        for call in run.call_args_list:
            self.assertNotIn(SECRET, json.dumps(call.args))
        self.assertEqual(json.loads(run.call_args_list[1].kwargs["stdin"])["token"], SECRET)
        self.assertEqual(run.call_args_list[0].args[0],
                         ["docker", "exec", "vpn", "cat", "--", "/gluetun/forwarded_port"])

    def test_reinspection_failure_does_not_leave_probeable_sample(self):
        before = sample()["containers"]
        with mock.patch.object(check, "container_snapshot", side_effect=[(before, {"qbittorrent": 100}),
                                                                         check.Unknown("command_failed")]), \
                mock.patch.object(check, "run", side_effect=["40000\n", '{"errors": []}']):
            result = check.inspect_sample(self.args())
        self.assertFalse(result["snapshot_stable"])
        with mock.patch.object(check, "handshake") as probe:
            self.assertEqual(check.probe_sample(result, INFO_HASH)["verdict"], "unknown")
        probe.assert_not_called()

    def test_forwarded_port_change_invalidates_same_container_snapshot(self):
        with mock.patch.object(check, "container_snapshot", return_value=(sample()["containers"], {"qbittorrent": 100})), \
                mock.patch.object(check, "run", side_effect=["40000\n", '{"errors": []}', "40001\n"]):
            result = check.inspect_sample(self.args())
        self.assertFalse(result["snapshot_stable"])
        self.assertIn("forwarded_port_not_stable", result["errors"])


class DnsTests(unittest.TestCase):
    QUESTION = b"\x01t\x0cmyanonamouse\x03net\0\0\1\0\1"

    def packet(self, *, flags=0x8180, ident=123, answer=None):
        if answer is None:
            answer = b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 300, 4) + socket.inet_aton(IP_A)
        return struct.pack("!6H", ident, flags, 1, 1, 0, 0) + self.QUESTION + answer

    def test_container_resolvers_are_parsed_and_capped(self):
        data = "nameserver 127.0.0.11\nnameserver 10.0.0.1 # comment\nsearch local\n"
        data += "nameserver 127.0.0.11\nnameserver 224.0.0.1\nnameserver ::1\n"
        data += "nameserver 10.0.0.2\nnameserver 10.0.0.3\n"
        self.assertEqual(check.nameservers(data), ["127.0.0.11", "10.0.0.1", "10.0.0.2"])

    def test_compressed_dns_a_answer(self):
        self.assertEqual(check.dns_answer(self.packet(), 123), IP_A)

    def test_cname_then_a_in_answer_section(self):
        cname = b"\x04edge\xc0\x0e"
        alias = b"\xc0\x0c" + struct.pack("!HHIH", 5, 1, 300, len(cname)) + cname
        address = b"\x04edge\xc0\x0e" + struct.pack("!HHIH", 1, 1, 300, 4) + socket.inet_aton(IP_A)
        packet = struct.pack("!6H", 123, 0x8180, 1, 2, 0, 0) + self.QUESTION + alias + address
        self.assertEqual(check.dns_answer(packet, 123), IP_A)

    def test_malformed_truncated_wrong_question_or_unrelated_answers_are_unknown(self):
        unrelated = b"\x04evil\0" + struct.pack("!HHIH", 1, 1, 300, 4) + socket.inet_aton(IP_A)
        fixtures = [b"", self.packet()[:-1], self.packet(flags=0x8380), self.packet(flags=0x8183),
                    self.packet(flags=0x0180), self.packet(ident=124), self.packet(answer=unrelated),
                    self.packet().replace(b"\x01t", b"\x01x", 1)]
        for packet in fixtures:
            with self.subTest(packet=packet), self.assertRaises(check.Unknown):
                check.dns_answer(packet, 123)

    def test_dns_name_rejects_compression_cycles_and_out_of_bounds(self):
        for packet in (b"\xc0\0", b"\xc0\xff", b"\x01x\xc0\0", b"\x3fshort"):
            with self.subTest(packet=packet), self.assertRaises(check.Unknown):
                check.dns_name(packet, 0)

    def test_lookup_contacts_only_provided_container_resolver(self):
        sock = mock.MagicMock()
        sock.__enter__.return_value = sock
        sock.recv.return_value = self.packet()
        with mock.patch.object(check.os, "urandom", return_value=b"\0{"), \
                mock.patch.object(check.socket, "socket", return_value=sock), \
                mock.patch.object(check.socket, "getaddrinfo") as host_dns:
            self.assertEqual(check.resolve_mam(["127.0.0.11"]), IP_A)
        sock.connect.assert_called_once_with(("127.0.0.11", 53))
        sock.settimeout.assert_called_once_with(3)
        host_dns.assert_not_called()
        self.assertEqual(sock.send.call_args.args[0][12:], self.QUESTION)

    def test_pinned_https_uses_original_hostname_for_verified_tls(self):
        context = mock.Mock()
        connection = check.PinnedHTTPSConnection(check.MAM_HOST, IP_A, context=context, timeout=5)
        sock = mock.Mock()
        with mock.patch.object(check.socket, "create_connection", return_value=sock) as connect:
            connection.connect()
        connect.assert_called_once_with((IP_A, 443), 5, None)
        context.wrap_socket.assert_called_once_with(sock, server_hostname=check.MAM_HOST)
        default = check.PinnedHTTPSConnection(check.MAM_HOST, IP_A)
        self.assertTrue(default._context.check_hostname)
        self.assertEqual(default._context.verify_mode, 2)


if __name__ == "__main__":
    unittest.main()
