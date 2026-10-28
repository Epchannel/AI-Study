"""Regression tests for the browser tool's outbound navigation sandbox."""

from types import SimpleNamespace

import pytest
from services.browser import automation


class _Route:
    def __init__(self) -> None:
        self.action = None

    async def continue_(self) -> None:
        self.action = "continue"

    async def abort(self, reason: str) -> None:
        self.action = ("abort", reason)


class _SyncRoute:
    def __init__(self) -> None:
        self.action = None

    def continue_(self) -> None:
        self.action = "continue"

    def abort(self, reason: str) -> None:
        self.action = ("abort", reason)


@pytest.mark.asyncio
async def test_browser_route_aborts_private_redirect_target(monkeypatch):
    async def reject_private(url: str) -> None:
        if "127.0.0.1" in url:
            raise ValueError("private address")

    monkeypatch.setattr(automation, "_validate_public_url", reject_private)
    route = _Route()

    await automation._guard_browser_request(
        route, SimpleNamespace(url="http://127.0.0.1/admin")
    )

    assert route.action == ("abort", "blockedbyclient")


@pytest.mark.asyncio
async def test_browser_route_allows_public_and_in_page_resources(monkeypatch):
    checked = []

    async def accept_public(url: str) -> None:
        checked.append(url)

    monkeypatch.setattr(automation, "_validate_public_url", accept_public)

    public = _Route()
    await automation._guard_browser_request(
        public, SimpleNamespace(url="https://example.com/app.js")
    )
    inline = _Route()
    await automation._guard_browser_request(
        inline, SimpleNamespace(url="data:text/plain,ok")
    )

    assert public.action == "continue"
    assert inline.action == "continue"
    assert checked == ["https://example.com/app.js"]


def test_scrapling_route_aborts_private_redirect_target(monkeypatch):
    def validate(url: str) -> str:
        if "127.0.0.1" in url:
            raise ValueError("private address")
        return url

    monkeypatch.setattr("libs.url_validation.validate_url", validate)
    route = _SyncRoute()

    automation._guard_scrapling_request(
        route, SimpleNamespace(url="http://127.0.0.1/admin")
    )

    assert route.action == ("abort", "blockedbyclient")


@pytest.mark.asyncio
async def test_http_redirect_is_validated_before_following(monkeypatch, mock_http):
    import httpx

    requested, _ = mock_http(
        [
            httpx.Response(302, headers={"location": "http://127.0.0.1/metadata"}),
        ]
    )
    validated = []

    async def validate(url: str) -> None:
        validated.append(url)
        if "127.0.0.1" in url:
            raise ValueError("private address")

    monkeypatch.setattr(automation, "_validate_public_url", validate)
    assert (
        await automation.fetch_with_httpx("https://example.com", {"session": "x"})
        is None
    )
    assert len(requested) == 1
    assert requested[0].headers["cookie"] == "session=x"
    assert validated == ["https://example.com", "http://127.0.0.1/metadata"]


@pytest.fixture
def mock_http(monkeypatch):
    """Exercise real HTTPX redirect/cookie behavior without DNS or network I/O."""
    from unittest.mock import AsyncMock

    import httpx

    original_client = httpx.AsyncClient
    validate = AsyncMock()
    monkeypatch.setattr(automation, "_validate_public_url", validate)

    def install(responses):
        requested = []

        def handler(request):
            requested.append(request)
            return responses[len(requested) - 1]

        monkeypatch.setattr(
            httpx,
            "AsyncClient",
            lambda **kwargs: original_client(
                transport=httpx.MockTransport(handler), **kwargs
            ),
        )
        return requested, validate

    return install


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "destination",
    [
        "https://other.example/landing",
        "https://sub.source.example/landing",
        "http://source.example/landing",
        "https://source.example:444/landing",
    ],
)
async def test_http_redirect_does_not_forward_session_to_other_origins(
    mock_http, destination
):
    import httpx

    requested, validated = mock_http(
        [
            httpx.Response(302, headers={"location": destination}),
            httpx.Response(200, text="landing"),
        ]
    )
    assert (
        await automation.fetch_with_httpx(
            "https://source.example/start", {"session": "synthetic-secret"}
        )
        == "landing"
    )
    assert requested[0].headers["cookie"] == "session=synthetic-secret"
    assert "cookie" not in requested[1].headers
    assert [call.args[0] for call in validated.call_args_list] == [
        "https://source.example/start",
        destination,
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url,location",
    [
        ("https://source.example/start", "/next"),
        ("https://source.example/start", "https://SOURCE.example:443/next"),
        ("https://8.8.8.8/start", "/next"),
        ("https://[2606:4700::1111]/start", "/next"),
        ("https://xn--bcher-kva.example/start", "/next"),
    ],
)
async def test_http_redirect_keeps_session_on_same_origin(mock_http, url, location):
    import httpx

    requested, _ = mock_http(
        [
            httpx.Response(302, headers={"location": location}),
            httpx.Response(200, text="authenticated"),
        ]
    )
    assert (
        await automation.fetch_with_httpx(url, {"session": "synthetic-secret"})
        == "authenticated"
    )
    assert [request.headers.get("cookie") for request in requested] == [
        "session=synthetic-secret"
    ] * 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "set_cookie,expected",
    [
        ("session=rotated; Path=/; Secure", "session=rotated"),
        ("session=; Max-Age=0; Path=/", None),
    ],
)
async def test_http_redirect_respects_session_rotation_and_deletion(
    mock_http, set_cookie, expected
):
    import httpx

    requested, _ = mock_http(
        [
            httpx.Response(
                302, headers={"location": "/next", "set-cookie": set_cookie}
            ),
            httpx.Response(200, text="done"),
        ]
    )
    assert (
        await automation.fetch_with_httpx(
            "https://source.example/start", {"session": "original"}
        )
        == "done"
    )
    assert requested[1].headers.get("cookie") == expected


@pytest.mark.asyncio
async def test_http_redirect_isolates_response_cookies_and_restores_returning_origin(
    mock_http,
):
    import httpx

    requested, _ = mock_http(
        [
            httpx.Response(
                302,
                headers={
                    "location": "https://other.example/start",
                    "set-cookie": "session=rotated; Path=/",
                },
            ),
            httpx.Response(
                302,
                headers={
                    "location": "/next",
                    "set-cookie": "session=other-session; Path=/",
                },
            ),
            httpx.Response(302, headers={"location": "https://source.example/finish"}),
            httpx.Response(200, text="done"),
        ]
    )
    assert (
        await automation.fetch_with_httpx(
            "https://source.example/start", {"session": "original"}
        )
        == "done"
    )
    assert [request.headers.get("cookie") for request in requested] == [
        "session=original",
        None,
        "session=other-session",
        "session=rotated",
    ]


@pytest.mark.asyncio
async def test_http_redirect_limit_and_validation_are_preserved(mock_http):
    import httpx

    requested, validated = mock_http(
        [
            httpx.Response(302, headers={"location": f"/hop-{i}"})
            for i in range(automation._MAX_REDIRECTS + 1)
        ]
    )
    assert (
        await automation.fetch_with_httpx(
            "https://source.example/start", {"session": "synthetic"}
        )
        is None
    )
    assert len(requested) == automation._MAX_REDIRECTS + 1
    assert validated.await_count >= len(requested)


@pytest.mark.asyncio
async def test_blocked_redirect_does_not_log_session_url(
    monkeypatch, mock_http, caplog
):
    import httpx

    destination = "http://127.0.0.1/private-path?session=synthetic-secret"
    requested, _ = mock_http([httpx.Response(302, headers={"location": destination})])

    async def validate(url):
        if url == destination:
            raise ValueError(f"blocked {url}")

    monkeypatch.setattr(automation, "_validate_public_url", validate)
    assert await automation.fetch_with_httpx("https://source.example/start") is None
    assert len(requested) == 1
    assert "Blocked unsafe HTTP redirect" in caplog.text
    assert "private-path" not in caplog.text and "synthetic-secret" not in caplog.text
