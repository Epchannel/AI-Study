"""HTTPX transport that connects only to freshly validated public IPs.

Keep URL/cookie semantics at the client layer. Pin the socket destination here,
while preserving the original HTTP Host and TLS server name. Separate origin
pools prevent two hostnames on the same IP from sharing a TLS connection.
"""

import asyncio
import ipaddress
import socket

import httpx


class PublicHTTPTransport(httpx.AsyncBaseTransport):
    """Prevent DNS rebinding between URL preflight and the actual connection."""

    def __init__(self) -> None:
        self._transports: dict[
            tuple[str, str, int | None], httpx.AsyncHTTPTransport
        ] = {}

    async def _resolve(self, request: httpx.Request) -> list[str]:
        host = request.url.raw_host.decode("ascii")
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            timeout = request.extensions.get("timeout", {}).get("connect", 15)
            try:
                async with asyncio.timeout(timeout):
                    records = await asyncio.get_running_loop().getaddrinfo(
                        host,
                        request.url.port
                        or (443 if request.url.scheme == "https" else 80),
                        type=socket.SOCK_STREAM,
                        proto=socket.IPPROTO_TCP,
                    )
            except TimeoutError as exc:
                raise httpx.ConnectTimeout(
                    "Public destination DNS timed out", request=request
                ) from exc
            except socket.gaierror as exc:
                raise httpx.ConnectError(
                    "Public destination DNS failed", request=request
                ) from exc
            addresses = [ipaddress.ip_address(record[4][0]) for record in records]
        if not addresses or any(
            not address.is_global or address.is_multicast or address.is_reserved
            for address in addresses
        ):
            raise httpx.ConnectError("Non-public destination blocked", request=request)
        return list(dict.fromkeys(str(address) for address in addresses))

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.scheme not in {"http", "https"} or not request.url.host:
            raise httpx.ConnectError(
                "Only public HTTP(S) destinations are allowed", request=request
            )
        addresses = await self._resolve(request)
        origin = (request.url.scheme, request.url.host, request.url.port)
        if origin not in self._transports:
            self._transports[origin] = httpx.AsyncHTTPTransport()
        for index, address in enumerate(addresses):
            extensions = dict(request.extensions)
            extensions["sni_hostname"] = request.url.raw_host.decode("ascii")
            pinned = httpx.Request(
                request.method,
                request.url.copy_with(host=address),
                headers=request.headers,
                stream=request.stream,
                extensions=extensions,
            )
            try:
                return await self._transports[origin].handle_async_request(pinned)
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if index == len(addresses) - 1:
                    raise
        raise AssertionError("A validated destination must have at least one address")

    async def aclose(self) -> None:
        for transport in self._transports.values():
            await transport.aclose()
        self._transports.clear()
