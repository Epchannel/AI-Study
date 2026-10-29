import httpx
import openai
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock
from services.academy_errors import generate_with_error_handling, generation_error


@pytest.mark.parametrize("upstream,expected", [(429, 429), (504, 504), (401, 502), (403, 502), (503, 502)])
def test_gateway_error_preserves_request_id_without_provider_body(upstream, expected):
    response = httpx.Response(upstream, headers={"X-Request-Id": "gateway-test-123", "Retry-After": "120"}, request=httpx.Request("POST", "https://example.test/v1/chat/completions"))
    error = generation_error(openai.APIStatusError("private upstream details", response=response, body={"secret": "must-not-leak"}))
    assert error.status_code == expected
    assert error.headers == {"X-Request-Id": "gateway-test-123", "Retry-After": "120"}
    assert "private" not in error.detail and "must-not-leak" not in error.detail
    assert "không tự gửi lại" in error.detail


@pytest.mark.asyncio
async def test_generation_timeout_is_reported_without_retry():
    generate = AsyncMock(side_effect=httpx.ReadTimeout("internal details"))
    with pytest.raises(HTTPException) as caught:
        await generate_with_error_handling(generate())
    assert caught.value.status_code == 504
    generate.assert_awaited_once()
