"""DNS rebinding regressions; all socket/transport boundaries stay offline."""

import asyncio
import ipaddress
import socket

import httpx
import pytest
from services.browser import automation


@pytest.mark.asyncio
async def test_fetch_rejects_dns_rebinding_before_connecting(monkeypatch):
    resolutions = []
    connected = []

    async def dns(host, port, **kwargs):
        resolutions.append(host)
        address = "8.8.8.8" if len(resolutions) == 1 else "127.0.0.1"
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                (address, port or 443),
            )
        ]

    async def network(request):
        # Simulate the transport's second DNS lookup without opening sockets.
        try:
            address = str(ipaddress.ip_address(request.url.host))
        except ValueError:
            address = (await dns(request.url.host, request.url.port))[0][4][0]
        connected.append(address)
        return httpx.Response(200, text="private-service")

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", dns)
    factory = lambda **kwargs: httpx.MockTransport(network)
    monkeypatch.setattr(httpx, "AsyncHTTPTransport", factory)
    monkeypatch.setattr("httpx._client.AsyncHTTPTransport", factory)
    result = await automation.fetch_with_httpx("https://source.example/start")
    assert result is None
    assert connected == []
    assert len(resolutions) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "addresses",
    [
        ["127.0.0.1"],
        ["10.1.2.3"],
        ["169.254.169.254"],
        ["::1"],
        ["fc00::1"],
        ["fe80::1"],
        ["::ffff:127.0.0.1"],
        ["0.0.0.0"],
        ["100.64.0.1"],
        ["224.0.0.1"],
        ["192.0.2.1"],
        ["8.8.8.8", "127.0.0.1"],
        [],
    ],
)
async def test_transport_rejects_non_public_and_mixed_dns_before_io(
    monkeypatch, addresses
):
    from services.browser.public_http import PublicHTTPTransport

    async def dns(*args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))
            for address in addresses
        ]

    def forbidden_transport(**kwargs):
        pytest.fail("Blocked destination reached the network transport")

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", dns)
    monkeypatch.setattr(httpx, "AsyncHTTPTransport", forbidden_transport)
    async with httpx.AsyncClient(
        transport=PublicHTTPTransport(), trust_env=False
    ) as client:
        with pytest.raises(httpx.ConnectError, match="Non-public"):
            await client.get("https://source.example/private")


@pytest.mark.asyncio
async def test_transport_pins_public_ip_and_preserves_real_httpcore_tls_semantics(
    monkeypatch,
):
    import ssl

    from httpcore._backends.anyio import AnyIOBackend
    from services.browser.public_http import PublicHTTPTransport

    connected = []
    tls = []
    written = []
    closed = []
    resolutions = []

    async def dns(host, port, **kwargs):
        resolutions.append(host)
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("8.8.8.8", port),
            )
        ]

    class Stream:
        async def read(self, max_bytes, timeout=None):
            return b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nSet-Cookie: token=server; Path=/\r\n\r\nok"

        async def write(self, buffer, timeout=None):
            written.append(buffer)

        async def aclose(self):
            closed.append(self)

        async def start_tls(self, ssl_context, server_hostname=None, timeout=None):
            tls.append(
                (server_hostname, ssl_context.check_hostname, ssl_context.verify_mode)
            )
            return self

        def get_extra_info(self, info):
            return False if info == "is_readable" else None

    async def connect_tcp(self, host, port, **kwargs):
        connected.append((host, port))
        return Stream()

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", dns)
    monkeypatch.setattr(AnyIOBackend, "connect_tcp", connect_tcp)
    # Environment proxies must never bypass public-IP validation/pinning.
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:9999")
    async with httpx.AsyncClient(
        transport=PublicHTTPTransport(), trust_env=False
    ) as client:
        first = await client.get("https://one.example/first")
        second = await client.get("https://two.example/second")
        assert first.text == second.text == "ok"
        assert str(first.url) == "https://one.example/first"
        assert client.cookies.get("token", domain="one.example") == "server"
        assert client.cookies.get("token", domain="two.example") == "server"
    assert connected == [("8.8.8.8", 443), ("8.8.8.8", 443)]
    assert tls == [
        ("one.example", True, ssl.CERT_REQUIRED),
        ("two.example", True, ssl.CERT_REQUIRED),
    ]
    assert resolutions == ["one.example", "two.example"]
    assert any(b"Host: one.example" in data for data in written)
    assert any(b"Host: two.example" in data for data in written)
    assert not any(b"Cookie:" in data for data in written)
    assert len(closed) == 2


@pytest.mark.asyncio
async def test_transport_falls_back_only_to_other_validated_public_ips(monkeypatch):
    from services.browser.public_http import PublicHTTPTransport

    attempts = []

    async def dns(*args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, 443))
            for ip in ["8.8.8.8", "1.1.1.1"]
        ]

    def network(request):
        attempts.append(request.url.host)
        if request.url.host == "8.8.8.8":
            raise httpx.ConnectError("unreachable")
        assert request.headers["host"] == "source.example"
        assert request.extensions["sni_hostname"] == "source.example"
        return httpx.Response(200, text="ok")

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", dns)
    monkeypatch.setattr(
        httpx, "AsyncHTTPTransport", lambda **kwargs: httpx.MockTransport(network)
    )
    async with httpx.AsyncClient(
        transport=PublicHTTPTransport(), trust_env=False
    ) as client:
        assert (await client.get("https://source.example/")).text == "ok"
    assert attempts == ["8.8.8.8", "1.1.1.1"]
