import os
import sys

import pytest

os.environ.setdefault("PYTEST_VERSION", "1")
os.environ.setdefault("DISABLE_RATE_LIMIT", "1")

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
API_DIR = os.path.join(ROOT_DIR, "apps", "api")

if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)



@pytest.fixture
def block_unmocked_cloud_requests(monkeypatch):
    """Unit tests must mock cloud HTTP instead of using configured credentials."""
    import httpx

    original = httpx.AsyncHTTPTransport.handle_async_request

    async def offline_request(self, request):
        if request.url.host not in {"localhost", "127.0.0.1", "::1"}:
            pytest.fail(
                f"Unmocked external HTTP request to {request.url.host}; "
                "use an offline transport or mock the provider"
            )
        return await original(self, request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", offline_request)
